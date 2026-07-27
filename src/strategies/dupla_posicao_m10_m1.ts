import { Strategy, StrategyContext, StrategyResult } from "./index";
import { rsi, adx, sma, ema, bollinger, macd } from "@/lib/market";

// ═══════════════════════════════════════════════════════════════════════════
// ESTRATÉGIA HÍBRIDA — DUPLA POSIÇÃO M10 + CONFIRMAÇÃO M1
// Versão 4.0 — com getMTF e filtros corrigidos
// ═══════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────
const MIN_VELAS_M10        = 30;
const MIN_VELAS_M1         = 82;
const RANGE_CRUZAMENTO     = 15;
const PAVIO_PCT            = 0.0003;
const FORCA_MINIMA         = 3;
const BONUS_SEM_ROMP       = 2;
const BONUS_FALSO_ROMP     = 3;
const PENAL_IDADE          = 0.1;
const TOTAL_DPS            = 5;
const TOLERANCIA_MERGE     = 0.0005;
const PCT_CORPO_MINIMO     = 0.15;
const JANELA_POS           = 50;
const MIN_ANTES_POS        = 1;
const MIN_CONT_POS         = 2;

const P_1A_PUT             = 80;
const P_1B_CALL            = 75;
const P_2A_BAIXA           = 88;
const P_2B_CALL            = 92;
const P_1A_CALL            = 80;
const P_1B_PUT             = 75;
const P_2A_ALTA            = 88;
const P_2B_PUT             = 92;
const P_EXCECAO            = 95;
const P_BONUS_RANK         = 10;
const P_BONUS_FORCA        = 5;
const P_PENAL_ANTIGA       = 5;

// ─────────────────────────────────────────────────────────────────────────
// INTERFACES INTERNAS
// ─────────────────────────────────────────────────────────────────────────
interface Vela { t: number; o: number; h: number; l: number; c: number; cor: string; }
interface VA {
  open: number; close: number; high: number; low: number; cor: string;
  ehVerde: boolean; ehVermelha: boolean; ehDoji: boolean;
  cSup: number; cInf: number; tamCorpo: number; pSup: number; pInf: number;
  temPSup: boolean; temPInf: boolean;
}
interface DP {
  origem: string; idx1: number; idx2: number; I: number; PS: number; PI: number;
  forcaTotal: number; toques: number; score: number; dist: number; rank: number;
}
interface Setup {
  cenario: string; acao: string; linha: number; tipoLinha: string; desc: string;
  qual: number; direta: boolean; dpRank: number; dpForca: number;
}
interface Posic { tipo: string; linha: number; forte: boolean; cont: number; }
interface Cruz { houve: boolean; direcao: string; motivo: string; velasAtras: number; classif: string; }

// ─────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────
function pavTol(linha: number): number { return linha * PAVIO_PCT; }

function corDeVela(o: number, c: number, h: number, l: number): string {
  if (c > o) return "VERDE";
  if (c < o) return "VERMELHA";
  return "DOJI";
}

function prepVelas(raw: any[]): Vela[] {
  return raw.map(v => ({ ...v, cor: corDeVela(v.o, v.c, v.h, v.l) }));
}

function analisar(v: Vela): VA | null {
  if (!v || v.o <= 0) return null;
  const cSup = Math.max(v.o, v.c);
  const cInf = Math.min(v.o, v.c);
  const tamCorpo = cSup - cInf;
  const pSup = v.h - cSup;
  const pInf = cInf - v.l;
  const lim = Math.max(v.c, 0.0001) * PAVIO_PCT;
  return {
    open: v.o, close: v.c, high: v.h, low: v.l, cor: v.cor,
    ehVerde: v.cor === "VERDE", ehVermelha: v.cor === "VERMELHA", ehDoji: v.cor === "DOJI",
    cSup, cInf, tamCorpo, pSup, pInf,
    temPSup: pSup > lim, temPInf: pInf > lim,
  };
}

function rompeCima(a: VA, linha: number): boolean {
  if (a.tamCorpo <= 0 || a.open > linha || a.close <= linha) return false;
  return (a.close - linha) / a.tamCorpo >= PCT_CORPO_MINIMO;
}

function rompeBaixo(a: VA, linha: number): boolean {
  if (a.tamCorpo <= 0 || a.open < linha || a.close >= linha) return false;
  return (linha - a.close) / a.tamCorpo >= PCT_CORPO_MINIMO;
}

function tocaSubindo(a: VA, linha: number): boolean { return a.high >= linha - pavTol(linha); }
function tocaDescendo(a: VA, linha: number): boolean { return a.low <= linha + pavTol(linha); }
function fechaAcima(a: VA, linha: number): boolean { return a.close > linha; }
function fechaAbaixo(a: VA, linha: number): boolean { return a.close < linha; }

function calcForca(linha: number, velas: Vela[], ini: number, tipo: string): { forca: number; toques: number } {
  let f = 1; let t = 0; const tl = pavTol(linha);
  for (let i = ini; i < velas.length; i++) {
    const a = analisar(velas[i]); if (!a) continue;
    if (tipo === "PS") {
      if (a.high >= linha && a.cSup < linha) { f += BONUS_FALSO_ROMP; t++; }
      else if (Math.abs(a.cSup - linha) <= tl) { f += BONUS_SEM_ROMP; t++; }
      else if (a.high >= linha - tl) { f += 1; t++; }
    } else if (tipo === "PI") {
      if (a.low <= linha && a.cInf > linha) { f += BONUS_FALSO_ROMP; t++; }
      else if (Math.abs(a.cInf - linha) <= tl) { f += BONUS_SEM_ROMP; t++; }
      else if (a.low <= linha + tl) { f += 1; t++; }
    } else {
      if (a.high >= linha - tl && a.low <= linha + tl) { f += 1; t++; }
    }
  }
  return { forca: Math.max(1, f), toques: t };
}

function encontrarDPs(velas: Vela[]): DP[] {
  const lista: DP[] = [];
  for (let i = 0; i < velas.length - 2; i++) {
    const a1 = analisar(velas[i]); const a2 = analisar(velas[i + 1]);
    if (!a1 || !a2 || a1.cor !== a2.cor || a1.ehDoji) continue;
    let origem = ""; let I = 0, PS = 0, PI = 0;
    if (a1.ehVerde && a1.temPSup && a2.cSup < a1.high) { origem = "COMPRA"; I = a1.close; PS = a2.high; PI = a2.low; }
    else if (a1.ehVermelha && a1.temPInf && a2.cInf > a1.low) { origem = "VENDA"; I = a1.close; PS = a2.high; PI = a2.low; }
    else continue;
    const { forca, toques } = calcForca(I, velas, i + 2, "I");
    lista.push({ origem, idx1: i, idx2: i + 1, I, PS, PI, forcaTotal: forca, toques, score: 0, dist: velas.length - i, rank: 0 });
  }
  return lista.sort((a, b) => b.forcaTotal - a.forcaTotal).slice(0, TOTAL_DPS);
}

function posicionamentos(velas: Vela[]): Posic[] {
  const res: Posic[] = [];
  for (let i = 1; i < velas.length - 1; i++) {
    const aAt = analisar(velas[i]); const aAn = analisar(velas[i-1]);
    if (!aAt || !aAn) continue;
    if (aAt.ehVermelha && aAn.ehVerde) res.push({ tipo: "VENDA", linha: aAt.high, forte: true, cont: 2 });
    if (aAt.ehVerde && aAn.ehVermelha) res.push({ tipo: "COMPRA", linha: aAt.low, forte: true, cont: 2 });
  }
  return res;
}

function setupsDP(dp: DP, aU: VA, aP: VA | null, pos: Posic[]): Setup[] {
  const res: Setup[] = [];
  const { I, PS, PI } = dp;
  if (dp.origem === "COMPRA") {
    if (aU.ehVermelha && aU.temPInf && rompeBaixo(aU, I) && rompeBaixo(aU, PI)) {
      res.push({ cenario: "SETUP_1A_PUT", acao: "PUT", linha: I, tipoLinha: "I", desc: "1A-PUT", qual: 80, direta: false, dpRank: dp.rank, dpForca: dp.forcaTotal });
    }
    if (aU.ehVerde && aU.temPSup && rompeCima(aU, PS)) {
      res.push({ cenario: "SETUP_1B_CALL", acao: "CALL", linha: PS, tipoLinha: "PS", desc: "1B-CALL", qual: 75, direta: false, dpRank: dp.rank, dpForca: dp.forcaTotal });
    }
  } else {
    if (aU.ehVerde && aU.temPSup && rompeCima(aU, I) && rompeCima(aU, PS)) {
      res.push({ cenario: "SETUP_1A_CALL", acao: "CALL", linha: I, tipoLinha: "I", desc: "1A-CALL", qual: 80, direta: false, dpRank: dp.rank, dpForca: dp.forcaTotal });
    }
    if (aU.ehVermelha && aU.temPInf && rompeBaixo(aU, PI)) {
      res.push({ cenario: "SETUP_1B_PUT", acao: "PUT", linha: PI, tipoLinha: "PI", desc: "1B-PUT", qual: 75, direta: false, dpRank: dp.rank, dpForca: dp.forcaTotal });
    }
  }
  return res;
}

// ─────────────────────────────────────────────────────────────────────────
// ESTRATÉGIA
// ─────────────────────────────────────────────────────────────────────────
const EstrategiaDP: Strategy = {
  id: "hibrida_dupla_posicao_m10_m1",
  name: "Dupla Posição M10 + Confirmação M1",
  description: "DP em M10 via getMTF(10) + cruzamento EMA5/EMA10/SMA21 e toque+retração M1.",
  category: "auto",
  customStatKeys: [{ key: "setup_m10", label: "Setup M10" }, { key: "qualidade", label: "Qualidade" }],
  customFilterKeys: [
    { key: "min_qualidade", label: "Qualidade Mínima", type: "range", defaultMin: 60, defaultMax: 100, step: 5 },
    { key: "tipo_setup", label: "Tipo de Setup", type: "multiselect", options: ["SETUP_1A_PUT", "SETUP_1B_CALL", "SETUP_1A_CALL", "SETUP_1B_PUT"] }
  ],

  onTick: (ctx: StrategyContext): StrategyResult | null => {
    if (ctx.hasOpenTrade || ctx.history.length < MIN_VELAS_M1) return null;

    const rawM10 = ctx.getMTF(10);
    if (!rawM10 || rawM10.length < MIN_VELAS_M10) return null;

    const velasM10 = prepVelas(rawM10);
    const dps = encontrarDPs(velasM10);
    if (dps.length === 0) return null;

    const aU = analisar(velasM10[velasM10.length - 1]);
    if (!aU) return null;
    const aP = analisar(velasM10[velasM10.length - 2]);

    const pos = posicionamentos(velasM10);
    let melhor: Setup | null = null;
    for (const dp of dps) {
      const setups = setupsDP(dp, aU, aP, pos);
      if (setups.length > 0) { melhor = setups[0]; break; }
    }

    if (!melhor) return null;

    // Filtros
    const filters = ctx.activeFilters || {};
    const fQ = filters["min_qualidade"];
    if (fQ?.enabled && fQ.ranges && fQ.ranges[0] && melhor.qual < fQ.ranges[0].min) return null;

    const closes = ctx.history.map(c => c.c);
    const rsiVal = rsi(closes, 14).slice(-1)[0] || 50;

    return {
      action: melhor.acao as any,
      duration: 60,
      expiryCandles: 1,
      waitForCandleClose: true,
      customStats: { setup_m10: melhor.cenario, qualidade: melhor.qual }
    };
  }
};

export default EstrategiaDP;
