import { Strategy, StrategyContext, StrategyResult } from "./index";

// ─────────────────────────────────────────────────────────────────────────────
// DUPLA POSIÇÃO (M10 + M1)
//
// FLUXO DE TEMPO (expiryCandles: 1):
//   Vela [i-1] fecha → onTick analisa confirmCandle = m1[curM1Idx-1]
//   Sinal emitido → trade abre no OPEN da vela [i]
//   Trade fecha no CLOSE da vela [i]
//   Tick [i+1] → lastTrade.id mudou → processamos WIN/LOSS
//
// RASTREAMENTO DE TRADE (padrão recomendado pelo desenvolvedor):
//   Guardamos o último lastTrade.id processado por ativo num map externo.
//   Quando lastTrade.id !== ultimoIdProcessado sabemos que é um novo trade
//   finalizado — processamos o resultado UMA ÚNICA VEZ e guardamos o novo ID.
// ─────────────────────────────────────────────────────────────────────────────

interface Candle {
  o: number;
  c: number;
  h: number;
  l: number;
}

type SetupPhase =
  | "waiting_breakout"
  | "waiting_first"
  | "waiting_second"
  | "active"
  | "waiting_third"
  | "done";

type BreakoutLevel = "A" | "B";

interface DuplaSetup {
  upper: number;
  lower: number;
  mid: number;

  direction: "bull" | "bear";

  broken: boolean;
  breakoutLevel: BreakoutLevel | null;
  tradeDir: "CALL" | "PUT" | null;
  retestLine: number | null;

  createdAtM10: number;
  brokenAtM10: number;
  retestM10: number;

  phase: SetupPhase;
  retestCount: number;
  entriesThisSetup: number;
  lastRejectionM1: number;
  lastSignalM1: number;

  // true entre o tick do sinal e o tick em que lastTrade.id muda
  // (ou seja, enquanto o trade ainda não fechou / resultado não chegou)
  tradePending: boolean;

  lossOccurred: boolean;
}

interface AssetState {
  setups: DuplaSetup[];
}

// ─── Estado global por ativo ───────────────────────────────────────────────

const stateMap: Record<string, AssetState> = {};
function getState(asset: string): AssetState {
  if (!stateMap[asset]) stateMap[asset] = { setups: [] };
  return stateMap[asset];
}

// Padrão recomendado pelo desenvolvedor:
// guarda o ID do último trade JÁ PROCESSADO por ativo.
// Quando lastTrade.id !== ultimoIdProcessado[asset] → novo trade finalizado.
const ultimoIdProcessado: Record<string, string> = {};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const isBull     = (c: Candle) => c.c > c.o;
const isBear     = (c: Candle) => c.c < c.o;
const bodyHigh   = (c: Candle) => Math.max(c.o, c.c);
const bodyLow    = (c: Candle) => Math.min(c.o, c.c);
const upperWick  = (c: Candle) => c.h - bodyHigh(c);
const lowerWick  = (c: Candle) => bodyLow(c) - c.l;
const bodySize   = (c: Candle) => Math.abs(c.c - c.o);

function lowerWickVsBody(c: Candle): number {
  const body = bodySize(c);
  if (body === 0) return lowerWick(c) > 0 ? 999 : 0;
  return lowerWick(c) / body;
}
function upperWickVsBody(c: Candle): number {
  const body = bodySize(c);
  if (body === 0) return upperWick(c) > 0 ? 999 : 0;
  return upperWick(c) / body;
}
function lowerWickRatio(c: Candle): number {
  const r = c.h - c.l;
  return r === 0 ? 0 : lowerWick(c) / r;
}
function upperWickRatio(c: Candle): number {
  const r = c.h - c.l;
  return r === 0 ? 0 : upperWick(c) / r;
}

// ─────────────────────────────────────────────────────────────────────────────
// DETEÇÃO DO PADRÃO (M10)
// ─────────────────────────────────────────────────────────────────────────────

function detectDuplaBull(a: Candle, b: Candle, idx: number): DuplaSetup | null {
  if (upperWick(a) <= 0) return null;
  if (b.c > a.h) return null;
  return {
    upper: b.h, lower: b.l, mid: a.c,
    direction: "bull",
    broken: false, breakoutLevel: null, tradeDir: null, retestLine: null,
    createdAtM10: idx, brokenAtM10: -1, retestM10: -1,
    phase: "waiting_breakout",
    retestCount: 0, entriesThisSetup: 0,
    lastRejectionM1: -1, lastSignalM1: -1,
    tradePending: false,
    lossOccurred: false,
  };
}

function detectDuplaBear(a: Candle, b: Candle, idx: number): DuplaSetup | null {
  if (lowerWick(a) <= 0) return null;
  if (b.c < a.l) return null;
  return {
    upper: b.h, lower: b.l, mid: a.c,
    direction: "bear",
    broken: false, breakoutLevel: null, tradeDir: null, retestLine: null,
    createdAtM10: idx, brokenAtM10: -1, retestM10: -1,
    phase: "waiting_breakout",
    retestCount: 0, entriesThisSetup: 0,
    lastRejectionM1: -1, lastSignalM1: -1,
    tradePending: false,
    lossOccurred: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ROMPIMENTO (M10)
// ─────────────────────────────────────────────────────────────────────────────

function checkBreakout(
  c: Candle,
  setup: DuplaSetup,
  tol: number
): { level: BreakoutLevel; tradeDir: "CALL" | "PUT"; retestLine: number } | null {
  if (setup.direction === "bull") {
    if (isBull(c) && c.o < setup.mid - tol && c.c > setup.upper + tol)
      return { level: "B", tradeDir: "CALL", retestLine: setup.mid };
    if (isBull(c) && c.c > setup.upper + tol && upperWick(c) > 0)
      return { level: "A", tradeDir: "CALL", retestLine: setup.upper };
  } else {
    if (isBear(c) && c.o > setup.mid + tol && c.c < setup.lower - tol)
      return { level: "B", tradeDir: "PUT", retestLine: setup.mid };
    if (isBear(c) && c.c < setup.lower - tol && lowerWick(c) > 0)
      return { level: "A", tradeDir: "PUT", retestLine: setup.lower };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// REJEIÇÃO NA LINHA (M1)
// ─────────────────────────────────────────────────────────────────────────────

function isRejection(
  c: Candle,
  linePrice: number,
  tradeDir: "CALL" | "PUT",
  tol: number,
  minWickBodyRatio: number
): boolean {
  if (c.h === c.l) return false;

  if (tradeDir === "CALL") {
    if (c.l > linePrice + tol) return false;   // não tocou a linha
    if (c.c <= linePrice) return false;         // fechou abaixo — não é rejeição
    // toque limpo (mínima acima da linha) → exige pavio inferior forte
    if (c.l >= linePrice - tol) return lowerWickVsBody(c) >= minWickBodyRatio;
    // mínima desceu abaixo mas fechou acima → rejeição por recuperação
    return true;
  }

  if (tradeDir === "PUT") {
    if (c.h < linePrice - tol) return false;   // não tocou a linha
    if (c.c >= linePrice) return false;         // fechou acima — não é rejeição
    // toque limpo (máxima abaixo da linha) → exige pavio superior forte
    if (c.h <= linePrice + tol) return upperWickVsBody(c) >= minWickBodyRatio;
    // máxima ultrapassou mas fechou abaixo → rejeição por recuperação
    return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// ESTRATÉGIA
// ─────────────────────────────────────────────────────────────────────────────

const DuplaPosicao: Strategy = {
  id: "dupla_posicao3",
  name: "Dupla Posição (M10 + M1)3",
  description:
    "Identifica Dupla Posição no M10 → rompimento nível A ou B → " +
    "retest nas primeiras 5 velas M1 da vela M10 seguinte → " +
    "1ª rejeição observa, 2ª entra. Após derrota aguarda 3ª rejeição.",
  category: "auto",

  customStatKeys: [
    { key: "direcao",        label: "Direção"          },
    { key: "nivel",          label: "Nível Rompimento" },
    { key: "linhaReteste",   label: "Linha de Reteste" },
    { key: "numRejeicao",    label: "Nº Rejeição"      },
    { key: "pavioRejeicao",  label: "% Pavio Rejeição" },
    { key: "fase",           label: "Fase"             },
  ],

  customFilterKeys: [
    {
      key: "min_wick_body_ratio",
      label: "Pavio Mínimo vs Corpo M1 (%) — toque limpo",
      type: "range",
      defaultMin: 30,
      defaultMax: 80,
      step: 5,
    },
    {
      key: "setup_expiry_m10",
      label: "Validade do Padrão sem rompimento (velas M10)",
      type: "range",
      defaultMin: 2,
      defaultMax: 15,
      step: 1,
    },
    {
      key: "min_gap_rejections",
      label: "Gap mínimo entre rejeições M1 (velas)",
      type: "range",
      defaultMin: 1,
      defaultMax: 8,
      step: 1,
    },
  ],

  onTick: (ctx: StrategyContext): StrategyResult | null => {
    const { asset, activeFilters, hasOpenTrade, lastPrice, lastTrade } = ctx;

    const minWickBodyRatio: number =
      (activeFilters?.min_wick_body_ratio?.ranges?.[0]?.min ?? 50) / 100;
    const setupExpiryM10: number =
      activeFilters?.setup_expiry_m10?.ranges?.[0]?.max ?? 8;
    const minGap: number =
      activeFilters?.min_gap_rejections?.ranges?.[0]?.min ?? 2;

    const tol = lastPrice * 0.0002;

    const m1  = ctx.candles;
    const m10 = ctx.getMTF(10);

    if (m1.length  < 5) return null;
    if (m10.length < 3) return null;

    const state     = getState(asset);
    const curM1Idx  = m1.length - 1;
    const curM10Idx = m10.length - 1;

    // ════════════════════════════════════════════════════════════════════════
    // PASSO 0 — Detetar novo trade finalizado e processar resultado
    //
    // Comparamos lastTrade.id com ultimoIdProcessado[asset].
    // Se forem diferentes → é um trade novo que acabou de fechar.
    // Processamos o resultado UMA ÚNICA VEZ e guardamos o novo ID.
    //
    // Enquanto lastTrade.id === ultimoIdProcessado[asset] → mesmo trade
    // já processado, ignoramos (lastTrade persiste entre ticks).
    // ════════════════════════════════════════════════════════════════════════
    if (lastTrade?.id && lastTrade.id !== ultimoIdProcessado[asset]) {
      // Novo trade finalizado — registar ID para não reprocessar
      ultimoIdProcessado[asset] = lastTrade.id;

      // Aplicar resultado ao setup que tem tradePending === true
      for (const setup of state.setups) {
        if (!setup.tradePending) continue;
        if (setup.phase === "done") {
          setup.tradePending = false;
          continue;
        }

        setup.tradePending = false;

        if (lastTrade.result === "LOSS") {
          setup.lossOccurred = true;
          if (setup.phase === "active") {
            // Primeira derrota → para, aguarda 3ª rejeição
            setup.phase = "waiting_third";
          } else {
            // Derrota na 3ª rejeição → encerra setup
            setup.phase = "done";
          }
        }
        // WIN: tradePending limpo, phase permanece "active"
        // → robô entra na próxima rejeição automaticamente
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // PASSO 1 — Detetar novas Duplas Posições no M10
    // ════════════════════════════════════════════════════════════════════════
    const scanStart = Math.max(1, curM10Idx - setupExpiryM10);
    for (let i = scanStart; i < curM10Idx; i++) {
      const a = m10[i - 1];
      const b = m10[i];
      if (!a || !b) continue;
      if (state.setups.some((s) => s.createdAtM10 === i)) continue;

      const bull = detectDuplaBull(a, b, i);
      if (bull) state.setups.push(bull);

      const bear = detectDuplaBear(a, b, i);
      if (bear) state.setups.push(bear);
    }

    // ════════════════════════════════════════════════════════════════════════
    // PASSO 2 — Verificar rompimento M10
    // ════════════════════════════════════════════════════════════════════════
    for (const setup of state.setups) {
      if (setup.broken) continue;
      if (setup.phase === "done") continue;

      if (curM10Idx - setup.createdAtM10 > setupExpiryM10) {
        setup.phase = "done";
        continue;
      }

      for (let i = setup.createdAtM10 + 1; i < curM10Idx; i++) {
        const brk = m10[i];
        if (!brk) continue;
        const result = checkBreakout(brk, setup, tol);
        if (result) {
          setup.broken        = true;
          setup.breakoutLevel = result.level;
          setup.tradeDir      = result.tradeDir;
          setup.retestLine    = result.retestLine;
          setup.brokenAtM10   = i;
          setup.retestM10     = i + 1;
          setup.phase         = "waiting_first";
          break;
        }
      }
    }

    // ── Limpeza de setups expirados
    state.setups = state.setups.filter((s) => {
      if (s.phase === "done") return false;
      if (!s.broken && curM10Idx - s.createdAtM10 > setupExpiryM10 + 1) return false;
      if (s.broken && curM10Idx - s.retestM10 > 2) {
        s.phase = "done";
        return false;
      }
      return true;
    });

    // ── Resolução de conflito CALL vs PUT simultâneos:
    // Mantém apenas o setup que rompeu mais recentemente.
    const activeDirectional = state.setups.filter(
      (s) => s.broken && s.phase !== "done" && s.phase !== "waiting_breakout"
    );
    const hasCallActive = activeDirectional.some((s) => s.tradeDir === "CALL");
    const hasPutActive  = activeDirectional.some((s) => s.tradeDir === "PUT");
    if (hasCallActive && hasPutActive) {
      const newest = activeDirectional.reduce((a, b) =>
        b.brokenAtM10 > a.brokenAtM10 ? b : a
      );
      state.setups.forEach((s) => {
        if (s.broken && s.tradeDir !== newest.tradeDir && s.phase !== "done") {
          s.phase = "done";
        }
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // PASSO 3 — Bloquear se trade aberto ou resultado ainda pendente
    //
    // hasOpenTrade  → trade ainda está aberto na plataforma
    // tradePending  → emitimos sinal mas lastTrade.id ainda não mudou,
    //                 ou seja, o trade ainda não fechou / resultado não chegou
    // ════════════════════════════════════════════════════════════════════════
    if (hasOpenTrade) return null;

    const hasPendingTrade = state.setups.some((s) => s.tradePending);
    if (hasPendingTrade) return null;

    // ════════════════════════════════════════════════════════════════════════
    // PASSO 4 — Rejeições no M1
    // ════════════════════════════════════════════════════════════════════════
    if (curM1Idx < 2) return null;

    const confirmCandle = m1[curM1Idx - 1];
    if (!confirmCandle) return null;

    for (const setup of state.setups) {
      if (!setup.broken || !setup.tradeDir || setup.retestLine === null) continue;
      if (setup.phase === "done") continue;
      if (setup.tradePending) continue;
      if (
        setup.phase !== "waiting_first" &&
        setup.phase !== "waiting_second" &&
        setup.phase !== "active" &&
        setup.phase !== "waiting_third"
      ) continue;

      const tradeDir   = setup.tradeDir;
      const retestLine = setup.retestLine;

      // ── Janela temporal: retest deve ocorrer na vela M10 de retest
      const inRetestWindow = curM10Idx === setup.retestM10;
      const alreadyStarted =
        setup.phase === "active" || setup.phase === "waiting_third";

      if (!inRetestWindow && !alreadyStarted) {
        setup.phase = "done";
        continue;
      }

      // ── Verificar rejeição na vela confirmCandle
      const rejected = isRejection(
        confirmCandle,
        retestLine,
        tradeDir,
        tol,
        minWickBodyRatio
      );
      if (!rejected) continue;

      // ── Gap mínimo entre rejeições consecutivas
      if (
        setup.lastRejectionM1 >= 0 &&
        curM1Idx - setup.lastRejectionM1 < minGap
      ) continue;

      // ── Sem duplicação na mesma vela
      if (setup.lastSignalM1 === curM1Idx) continue;

      const wickPct =
        tradeDir === "CALL"
          ? Math.round(lowerWickRatio(confirmCandle) * 100)
          : Math.round(upperWickRatio(confirmCandle) * 100);

      const nivelLabel = `Nível ${setup.breakoutLevel}`;
      const linhaLabel =
        setup.retestLine === setup.upper ? "Pavio Superior" :
        setup.retestLine === setup.lower ? "Pavio Inferior" : "Interseção (Mid)";

      // ════════════════════════════════════════════════════════════════════
      // MÁQUINA DE ESTADOS
      // ════════════════════════════════════════════════════════════════════

      // 1ª rejeição → observa, não entra
      if (setup.phase === "waiting_first") {
        setup.retestCount     = 1;
        setup.lastRejectionM1 = curM1Idx;
        setup.phase           = "waiting_second";
        continue;
      }

      // 2ª rejeição → ENTRA
      if (setup.phase === "waiting_second") {
        setup.retestCount++;
        setup.lastRejectionM1 = curM1Idx;
        setup.entriesThisSetup++;
        setup.lastSignalM1    = curM1Idx;
        setup.tradePending    = true;
        setup.phase           = "active";

        return {
          action: tradeDir,
          expiryCandles: 1,
          customStats: {
            direcao:       `${tradeDir} — 2ª Rejeição`,
            nivel:         nivelLabel,
            linhaReteste:  linhaLabel,
            numRejeicao:   `${setup.retestCount}ª`,
            pavioRejeicao: `${wickPct}%`,
            fase:          "waiting_second",
          },
        };
      }

      // Rejeições consecutivas após WIN
      if (setup.phase === "active") {
        setup.retestCount++;
        setup.lastRejectionM1 = curM1Idx;
        setup.entriesThisSetup++;
        setup.lastSignalM1    = curM1Idx;
        setup.tradePending    = true;

        return {
          action: tradeDir,
          expiryCandles: 1,
          customStats: {
            direcao:       `${tradeDir} — Rejeição Consecutiva`,
            nivel:         nivelLabel,
            linhaReteste:  linhaLabel,
            numRejeicao:   `${setup.retestCount}ª`,
            pavioRejeicao: `${wickPct}%`,
            fase:          "active",
          },
        };
      }

      // 3ª rejeição após derrota → entrada final
      if (setup.phase === "waiting_third") {
        setup.retestCount++;
        setup.lastRejectionM1 = curM1Idx;
        setup.entriesThisSetup++;
        setup.lastSignalM1    = curM1Idx;
        setup.tradePending    = true;
        // phase → "done" quando o resultado chegar no Passo 0

        return {
          action: tradeDir,
          expiryCandles: 1,
          customStats: {
            direcao:       `${tradeDir} — 3ª Rejeição (recuperação)`,
            nivel:         nivelLabel,
            linhaReteste:  linhaLabel,
            numRejeicao:   `${setup.retestCount}ª`,
            pavioRejeicao: `${wickPct}%`,
            fase:          "waiting_third",
          },
        };
      }
    }

    return null;
  },
};

export default DuplaPosicao;