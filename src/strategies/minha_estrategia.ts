import { Strategy, StrategyContext, StrategyResult } from "./index";

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────

interface Candle {
  o: number;
  c: number;
  h: number;
  l: number;
}

/**
 * REGRAS DA ESTRATÉGIA:
 *
 * M10 — Identificar "Dupla Posição":
 *   BULL: 2 velas verdes onde o CORPO da 2ª não supera o pavio superior da 1ª
 *         (fechamento de B ≤ máxima de A). A deve ter pavio superior.
 *   BEAR: 2 velas vermelhas onde o CORPO da 2ª não supera o pavio inferior da 1ª
 *         (fechamento de B ≥ mínima de A). A deve ter pavio inferior.
 *
 * Linhas marcadas (usando a 2ª vela do padrão):
 *   upper = pavio superior da 2ª vela
 *   lower = pavio inferior da 2ª vela
 *   mid   = zona de intersecção dos corpos das duas velas
 *
 * M10 — Aguardar rompimento:
 *   BULL → fecha acima de upper → CALL, retest em upper
 *   BULL → fecha acima de mid   → CALL, retest em mid
 *   BEAR → fecha abaixo de lower → PUT, retest em lower
 *   BEAR → fecha abaixo de mid   → PUT, retest em mid
 *
 * M1 — Máquina de estados por rejeição:
 *   waiting_first  → 1ª rejeição detectada → regista, NÃO entra
 *   waiting_second → 2ª rejeição → ENTRA
 *   active         → rejeições seguintes → ENTRA (sem limite)
 *                    se ctx.lastTrade.result === "LOSS" → vai para waiting_third
 *   waiting_third  → 3ª rejeição (com tolerância extra) → ENTRA 1x → done
 *   done           → setup encerrado
 */

// ─────────────────────────────────────────────────────────────────────────────
// FASE DO SETUP
// ─────────────────────────────────────────────────────────────────────────────
type SetupPhase =
  | "waiting_first"   // rompeu, aguarda 1ª rejeição M1 (sem entrada)
  | "waiting_second"  // 1ª rejeição vista, aguarda 2ª para entrar
  | "active"          // entrar a cada rejeição válida; monitorar derrota
  | "waiting_third"   // houve derrota, aguarda 3ª rejeição para 1 entrada final
  | "done";           // setup encerrado

interface DuplaSetup {
  upper: number;
  lower: number;
  mid: number;

  direction: "bull" | "bear";
  broken: "upper" | "lower" | "mid" | null;
  tradeDir: "CALL" | "PUT" | null;
  linePrice: number | null;

  phase: SetupPhase;

  retestCount: number;       // rejeições confirmadas acumuladas
  entriesThisSetup: number;  // trades emitidos neste setup

  // ID do último trade emitido por este setup (para detectar resultado)
  lastTradeId: string | null;

  // Índice M1 da última rejeição detetada (evita gap mínimo)
  lastRejectionM1: number;

  // Índice M1 do último sinal emitido (evita duplicação na mesma vela)
  lastSignalM1: number;

  createdAtM10: number;
  brokenAtM10: number;
}

interface AssetState {
  setups: DuplaSetup[];
}

// ─────────────────────────────────────────────────────────────────────────────
// ESTADO GLOBAL
// ─────────────────────────────────────────────────────────────────────────────

const stateMap: Record<string, AssetState> = {};

function getState(asset: string): AssetState {
  if (!stateMap[asset]) {
    stateMap[asset] = { setups: [] };
  }
  return stateMap[asset];
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const isBull = (c: Candle) => c.c > c.o;
const isBear = (c: Candle) => c.c < c.o;

const bodyHigh = (c: Candle) => Math.max(c.o, c.c);
const bodyLow  = (c: Candle) => Math.min(c.o, c.c);

const upperWick = (c: Candle) => c.h - bodyHigh(c);
const lowerWick = (c: Candle) => bodyLow(c) - c.l;

const lowerWickRatio = (c: Candle): number => {
  const r = c.h - c.l;
  return r === 0 ? 0 : lowerWick(c) / r;
};

const upperWickRatio = (c: Candle): number => {
  const r = c.h - c.l;
  return r === 0 ? 0 : upperWick(c) / r;
};

// ─────────────────────────────────────────────────────────────────────────────
// DETEÇÃO DA DUPLA POSIÇÃO (M10)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * BULL: duas velas verdes onde fechamento de B ≤ máxima de A.
 * A deve ter pavio superior (condição que gerou a "dupla posição").
 */
function detectDuplaBull(a: Candle, b: Candle, idx: number): DuplaSetup | null {
  if (!isBull(a) || !isBull(b)) return null;
  if (upperWick(a) <= 0) return null; // A precisa de pavio superior
  if (b.c > a.h) return null;         // corpo de B não pode superar pavio de A

  // Zona de intersecção dos corpos
  const overlapTop    = Math.min(bodyHigh(a), bodyHigh(b));
  const overlapBottom = Math.max(bodyLow(a), bodyLow(b));
  const mid = overlapTop >= overlapBottom
    ? (overlapTop + overlapBottom) / 2
    : (a.c + b.o) / 2; // fallback: ponto de transição A→B

  return {
    upper: b.h,
    lower: b.l,
    mid,
    direction: "bull",
    broken: null, tradeDir: null, linePrice: null,
    phase: "waiting_first",
    retestCount: 0, entriesThisSetup: 0,
    lastTradeId: null,
    lastRejectionM1: -1, lastSignalM1: -1,
    createdAtM10: idx, brokenAtM10: -1,
  };
}

/**
 * BEAR: duas velas vermelhas onde fechamento de B ≥ mínima de A.
 * A deve ter pavio inferior.
 */
function detectDuplaBear(a: Candle, b: Candle, idx: number): DuplaSetup | null {
  if (!isBear(a) || !isBear(b)) return null;
  if (lowerWick(a) <= 0) return null; // A precisa de pavio inferior
  if (b.c < a.l) return null;         // corpo de B não pode superar pavio de A

  const overlapTop    = Math.min(bodyHigh(a), bodyHigh(b));
  const overlapBottom = Math.max(bodyLow(a), bodyLow(b));
  const mid = overlapTop >= overlapBottom
    ? (overlapTop + overlapBottom) / 2
    : (a.c + b.o) / 2;

  return {
    upper: b.h,
    lower: b.l,
    mid,
    direction: "bear",
    broken: null, tradeDir: null, linePrice: null,
    phase: "waiting_first",
    retestCount: 0, entriesThisSetup: 0,
    lastTradeId: null,
    lastRejectionM1: -1, lastSignalM1: -1,
    createdAtM10: idx, brokenAtM10: -1,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ROMPIMENTO (M10)
// ─────────────────────────────────────────────────────────────────────────────

function checkBreakout(
  c: Candle,
  setup: DuplaSetup,
  tol: number
): { line: "upper" | "lower" | "mid"; tradeDir: "CALL" | "PUT"; linePrice: number } | null {
  if (setup.direction === "bull") {
    // Prioridade: rompimento do pavio superior (linha mais forte)
    if (c.c > setup.upper + tol) {
      return { line: "upper", tradeDir: "CALL", linePrice: setup.upper };
    }
    if (c.c > setup.mid + tol) {
      return { line: "mid", tradeDir: "CALL", linePrice: setup.mid };
    }
  } else {
    if (c.c < setup.lower - tol) {
      return { line: "lower", tradeDir: "PUT", linePrice: setup.lower };
    }
    if (c.c < setup.mid - tol) {
      return { line: "mid", tradeDir: "PUT", linePrice: setup.mid };
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// REJEIÇÃO NA LINHA (M1)
//
// CALL: mínima toca linha + fecha acima + pavio inferior significativo
// PUT:  máxima toca linha + fecha abaixo + pavio superior significativo
// ─────────────────────────────────────────────────────────────────────────────

function isRejection(
  c: Candle,
  linePrice: number,
  tradeDir: "CALL" | "PUT",
  tol: number,
  minWickRatio: number
): boolean {
  if (c.h - c.l === 0) return false;

  if (tradeDir === "CALL") {
    return (
      c.l <= linePrice + tol &&       // mínima toca a linha
      c.c > linePrice &&              // fecha acima
      lowerWickRatio(c) >= minWickRatio  // pavio inferior significativo
    );
  } else {
    return (
      c.h >= linePrice - tol &&       // máxima toca a linha
      c.c < linePrice &&              // fecha abaixo
      upperWickRatio(c) >= minWickRatio  // pavio superior significativo
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ESTRATÉGIA
// ─────────────────────────────────────────────────────────────────────────────

const DuplaPosicao: Strategy = {
  id: "minha_estrategia",
  name: "Dupla Posição (M10 + M1)",
  description:
    "Dupla Posição no M10 → rompimento → aguarda 1ª rejeição M1 (sem entrar) " +
    "→ 2ª rejeição entra → continua em active → após LOSS aguarda 3ª rejeição " +
    "para 1 entrada final. Setup encerrado após a 3ª.",
  category: "auto",

  customStatKeys: [
    { key: "direcao",       label: "Direção"             },
    { key: "linhaRompida",  label: "Linha Rompida"       },
    { key: "numRejeicao",   label: "Nº da Rejeição"      },
    { key: "pavioRejeicao", label: "% Pavio Rejeição M1" },
    { key: "fase",          label: "Fase do Setup"       },
  ],

  customFilterKeys: [
    {
      key: "min_wick_ratio",
      label: "Pavio Mínimo de Rejeição M1 (%)",
      type: "range",
      defaultMin: 20,
      defaultMax: 70,
      step: 5,
    },
    {
      key: "setup_expiry_m10",
      label: "Validade do Setup (velas M10)",
      type: "range",
      defaultMin: 3,
      defaultMax: 20,
      step: 1,
    },
    {
      key: "min_gap_rejections",
      label: "Gap mínimo entre rejeições M1 (velas)",
      type: "range",
      defaultMin: 1,
      defaultMax: 10,
      step: 1,
    },
  ],

  onTick: (ctx: StrategyContext): StrategyResult | null => {
    const { asset, activeFilters, hasOpenTrade, lastPrice, lastTrade } = ctx;

    // ── Filtros
    const minWickRatio: number =
      (activeFilters?.min_wick_ratio?.ranges?.[0]?.min ?? 25) / 100;
    const setupExpiryM10: number =
      activeFilters?.setup_expiry_m10?.ranges?.[0]?.max ?? 10;
    const minGap: number =
      activeFilters?.min_gap_rejections?.ranges?.[0]?.min ?? 2;

    // Tolerância base (0.02% do preço)
    const tol      = lastPrice * 0.0002;
    // Tolerância ligeiramente maior para 3ª rejeição após derrota (0.1%)
    const tolThird = lastPrice * 0.001;

    const m1  = ctx.candles;
    const m10 = ctx.getMTF(10);

    if (m1.length  < 5) return null;
    if (m10.length < 3) return null;
    if (hasOpenTrade)   return null;

    const state     = getState(asset);
    const curM1Idx  = m1.length - 1;
    const curM10Idx = m10.length - 1;

    // ════════════════════════════════════════════════════════════════════════
    // PASSO 0 — Atualizar resultado do último trade em setups ativos
    //
    // Se ctx.lastTrade existir e o seu ID corresponder ao lastTradeId de um
    // setup em fase "active", verificamos o resultado:
    //   - WIN  → continua em active (aguarda próxima rejeição)
    //   - LOSS → avança para waiting_third
    // ════════════════════════════════════════════════════════════════════════
    if (lastTrade?.id) {
      for (const setup of state.setups) {
        if (setup.phase !== "active") continue;
        if (setup.lastTradeId !== lastTrade.id) continue;

        if (lastTrade.result === "LOSS") {
          // Derrota confirmada → aguardar 3ª rejeição
          setup.phase = "waiting_third";
        }
        // WIN → permanece em active, lastTradeId será atualizado no próximo sinal
        // Limpamos o ID para não reprocessar
        setup.lastTradeId = null;
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // PASSO 1 — Detetar novas Duplas Posições no M10
    // ════════════════════════════════════════════════════════════════════════
    const scanFrom = Math.max(1, curM10Idx - setupExpiryM10);
    for (let i = scanFrom; i < curM10Idx; i++) {
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
    // PASSO 2 — Verificar rompimento no M10
    // ════════════════════════════════════════════════════════════════════════
    for (const setup of state.setups) {
      if (setup.broken !== null) continue;
      if (setup.phase === "done") continue;

      // Expirar setup sem rompimento
      if (curM10Idx - setup.createdAtM10 > setupExpiryM10) {
        setup.phase = "done";
        continue;
      }

      // Procurar primeiro rompimento após o padrão
      // (excluímos curM10Idx pois essa vela pode ainda estar a formar)
      for (let i = setup.createdAtM10 + 1; i < curM10Idx; i++) {
        const brk = m10[i];
        if (!brk) continue;
        const result = checkBreakout(brk, setup, tol);
        if (result) {
          setup.broken      = result.line;
          setup.tradeDir    = result.tradeDir;
          setup.linePrice   = result.linePrice;
          setup.brokenAtM10 = i;
          setup.phase       = "waiting_first";
          break;
        }
      }
    }

    // ── Limpeza de setups expirados / encerrados
    state.setups = state.setups.filter((s) => {
      if (s.phase === "done") return false;
      // Com rompimento: expira após setupExpiryM10*2 velas desde o rompimento
      if (s.broken && curM10Idx - s.brokenAtM10 > setupExpiryM10 * 2) return false;
      return true;
    });

    // ════════════════════════════════════════════════════════════════════════
    // PASSO 3 — Processar rejeições no M1
    //
    // Vela de confirmação = penúltima vela M1 (já fechada).
    // Sinal emitido para a vela ATUAL (a abrir agora).
    // ════════════════════════════════════════════════════════════════════════
    if (curM1Idx < 2) return null;

    const confirmCandle = m1[curM1Idx - 1];
    if (!confirmCandle) return null;

    for (const setup of state.setups) {
      if (!setup.broken || !setup.tradeDir || setup.linePrice === null) continue;
      if (setup.phase === "done") continue;

      const tradeDir  = setup.tradeDir;
      const linePrice = setup.linePrice;

      const linhaLabel =
        setup.broken === "upper" ? "Pavio Superior" :
        setup.broken === "lower" ? "Pavio Inferior" : "Linha do Meio";

      // Tolerância: maior para a 3ª rejeição (após derrota)
      const activeTol =
        setup.phase === "waiting_third" ? tolThird : tol;

      // Verificar rejeição na vela de confirmação
      const rejected = isRejection(
        confirmCandle,
        linePrice,
        tradeDir,
        activeTol,
        minWickRatio
      );

      if (!rejected) continue;

      // Gap mínimo entre rejeições consecutivas
      if (
        setup.lastRejectionM1 >= 0 &&
        curM1Idx - setup.lastRejectionM1 < minGap
      ) continue;

      // Evitar duplicar sinal na mesma vela M1
      if (setup.lastSignalM1 === curM1Idx) continue;

      // % do pavio para stats
      const wickPct =
        tradeDir === "CALL"
          ? Math.round(lowerWickRatio(confirmCandle) * 100)
          : Math.round(upperWickRatio(confirmCandle) * 100);

      // ════════════════════════════════════════════════════════════════════
      // MÁQUINA DE ESTADOS
      // ════════════════════════════════════════════════════════════════════

      // FASE: waiting_first → 1ª rejeição → regista, NÃO entra
      if (setup.phase === "waiting_first") {
        setup.retestCount     = 1;
        setup.lastRejectionM1 = curM1Idx;
        setup.phase           = "waiting_second";
        continue; // sem sinal de trade
      }

      // FASE: waiting_second → 2ª rejeição → ENTRA
      if (setup.phase === "waiting_second") {
        setup.retestCount++;
        setup.lastRejectionM1   = curM1Idx;
        setup.entriesThisSetup++;
        setup.lastSignalM1      = curM1Idx;
        setup.phase             = "active";
        // lastTradeId será preenchido pelo sistema — guardamos null por ora;
        // na próxima tick o lastTrade.id estará disponível se necessário.
        // Aqui não temos o ID ainda; usaremos lastTrade na próxima iteração.

        return {
          action: tradeDir,
          expiryCandles: 1,
          customStats: {
            direcao:       `${tradeDir} — 2ª Rejeição`,
            linhaRompida:  linhaLabel,
            numRejeicao:   `${setup.retestCount}ª Rejeição`,
            pavioRejeicao: `${wickPct}%`,
            fase:          "waiting_second → active",
          },
        };
      }

      // FASE: active → entra a cada rejeição válida; derrota monitorada no Passo 0
      if (setup.phase === "active") {
        setup.retestCount++;
        setup.lastRejectionM1   = curM1Idx;
        setup.entriesThisSetup++;
        setup.lastSignalM1      = curM1Idx;

        // Guardar o ID do último trade emitido para monitorar resultado
        // O ID real não está disponível aqui; usamos lastTrade?.id do tick
        // SEGUINTE (o Passo 0 irá comparar quando o trade fechar).
        // Marcamos com um token temporário para identificar o "trade mais recente"
        setup.lastTradeId = lastTrade?.id ?? null;

        return {
          action: tradeDir,
          expiryCandles: 1,
          customStats: {
            direcao:       `${tradeDir} — Rejeição Consecutiva`,
            linhaRompida:  linhaLabel,
            numRejeicao:   `${setup.retestCount}ª Rejeição`,
            pavioRejeicao: `${wickPct}%`,
            fase:          "active",
          },
        };
      }

      // FASE: waiting_third → 3ª rejeição (após derrota) → 1 entrada final
      if (setup.phase === "waiting_third") {
        setup.retestCount++;
        setup.lastRejectionM1   = curM1Idx;
        setup.entriesThisSetup++;
        setup.lastSignalM1      = curM1Idx;
        setup.phase             = "done"; // setup encerrado

        return {
          action: tradeDir,
          expiryCandles: 1,
          customStats: {
            direcao:       `${tradeDir} — 3ª Rejeição (recuperação)`,
            linhaRompida:  linhaLabel,
            numRejeicao:   `${setup.retestCount}ª Rejeição`,
            pavioRejeicao: `${wickPct}%`,
            fase:          "waiting_third → done",
          },
        };
      }
    }

    return null;
  },
};

export default DuplaPosicao;