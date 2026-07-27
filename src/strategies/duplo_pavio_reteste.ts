import { Strategy, StrategyContext, StrategyResult } from "./index";

// ═══════════════════════════════════════════════════════════════════════════
// ESTRATÉGIA: DUPLO PAVIO & RETESTE (Double Wick Retest)
// Detecta quebras e rejeições por dois pavios consecutivos e opera no reteste.
// ═══════════════════════════════════════════════════════════════════════════

interface Candle {
  o: number;
  c: number;
  h: number;
  l: number;
  t: number;
}

const PARAMS = {
  MIN_CANDLES: 20,
  TOLERANCE_PCT: 0.0005, // Tolerância para toque nas linhas S/R
  MIN_WICK_PCT: 0.40,     // Pavio deve representar no mínimo 40% do tamanho total da vela
};

// Funções Auxiliares
const isGreen = (c: Candle) => c.c > c.o;
const isRed = (c: Candle) => c.c < c.o;
const bodySize = (c: Candle) => Math.abs(c.c - c.o);
const totalRange = (c: Candle) => c.h - c.l;

// Calcular tamanho do pavio superior em porcentagem do tamanho total da vela
function upperWickPct(c: Candle): number {
  const r = totalRange(c);
  if (r === 0) return 0;
  const topOfBody = Math.max(c.o, c.c);
  return (c.h - topOfBody) / r;
}

// Calcular tamanho do pavio inferior em porcentagem do tamanho total da vela
function lowerWickPct(c: Candle): number {
  const r = totalRange(c);
  if (r === 0) return 0;
  const bottomOfBody = Math.min(c.o, c.c);
  return (bottomOfBody - c.l) / r;
}

// Detectar topos e fundos locais recentes como suporte e resistência
function getLocalLevels(candles: Candle[], lookback: number = 30): { supports: number[]; resistances: number[] } {
  const supports: number[] = [];
  const resistances: number[] = [];
  const start = Math.max(0, candles.length - lookback);

  for (let i = start + 2; i < candles.length - 2; i++) {
    const prev2 = candles[i - 2];
    const prev = candles[i - 1];
    const curr = candles[i];
    const next = candles[i + 1];
    const next2 = candles[i + 2];

    // Mínima local (Suporte)
    if (curr.l <= prev.l && curr.l <= prev2.l && curr.l <= next.l && curr.l <= next2.l) {
      supports.push(curr.l);
    }
    // Máxima local (Resistência)
    if (curr.h >= prev.h && curr.h >= prev2.h && curr.h >= next.h && curr.h >= next2.h) {
      resistances.push(curr.h);
    }
  }

  return { supports, resistances };
}

const DuploPavioRetesteStrategy: Strategy = {
  id: "duplo_pavio_reteste",
  name: "Duplo Pavio & Reteste",
  description: "Detecta rejeição consecutiva por dois pavios e opera no reteste de S/R.",
  category: "auto",

  customStatKeys: [
    { key: "operacao", label: "Operação" },
    { key: "pavioV1", label: "Pavio Vela 1" },
    { key: "pavioV2", label: "Pavio Vela 2" },
    { key: "linhaPreco", label: "Preço Nível S/R" },
  ],

  customFilterKeys: [
    {
      key: "timeframe_analise",
      label: "Timeframe de Análise",
      type: "select",
      options: ["Auto", "1m", "2m", "3m", "5m", "10m", "15m", "30m", "1h"],
    },
    {
      key: "min_wick_pct_filtro",
      label: "Pavio Mínimo (%)",
      type: "range",
      defaultMin: 20,
      defaultMax: 80,
      step: 5,
    },
    {
      key: "tolerance_pct_filtro",
      label: "Tolerância S/R (PPM x10) [1=0.0001, 5=0.0005]",
      type: "range",
      defaultMin: 1,
      defaultMax: 20,
      step: 1,
    },
    {
      key: "lookback_filtro",
      label: "Velas de Lookback S/R",
      type: "range",
      defaultMin: 10,
      defaultMax: 100,
      step: 5,
    }
  ],

  onTick: (ctx: StrategyContext): StrategyResult | null => {
    if (ctx.hasOpenTrade) return null;

    const filters = ctx.activeFilters || {};

    // 1. Resolver Timeframe
    const tfOption = filters.timeframe_analise?.value ?? "Auto";
    let tfMinutes = 0;
    if (tfOption === "1m") tfMinutes = 1;
    else if (tfOption === "2m") tfMinutes = 2;
    else if (tfOption === "3m") tfMinutes = 3;
    else if (tfOption === "5m") tfMinutes = 5;
    else if (tfOption === "10m") tfMinutes = 10;
    else if (tfOption === "15m") tfMinutes = 15;
    else if (tfOption === "30m") tfMinutes = 30;
    else if (tfOption === "1h") tfMinutes = 60;

    let candles = ctx.candles || [];
    if (tfMinutes > 0 && typeof ctx.getMTF === "function") {
      candles = ctx.getMTF(tfMinutes);
    }

    // 2. Resolver Parâmetros dinâmicos
    const minWickPct = filters.min_wick_pct_filtro?.ranges?.[0]?.min !== undefined
      ? filters.min_wick_pct_filtro.ranges[0].min / 100
      : PARAMS.MIN_WICK_PCT;

    const tolerancePct = filters.tolerance_pct_filtro?.ranges?.[0]?.min !== undefined
      ? filters.tolerance_pct_filtro.ranges[0].min / 10000
      : PARAMS.TOLERANCE_PCT;

    const lookback = filters.lookback_filtro?.ranges?.[0]?.min !== undefined
      ? filters.lookback_filtro.ranges[0].min
      : 30;

    const minCandlesRequired = Math.max(PARAMS.MIN_CANDLES, lookback + 5);
    if (!candles || candles.length < minCandlesRequired) return null;

    const currIdx = candles.length - 1;
    const v1 = candles[currIdx - 1]; // Vela fechada mais recente
    const v2 = candles[currIdx - 2]; // Vela anterior

    if (!v1 || !v2) return null;

    // Obter níveis S/R usando o lookback definido
    const { supports, resistances } = getLocalLevels(candles, lookback);

    // 1. Verificar sinais de CALL (Suporte com Pavio Inferior Duplo)
    const v1LowerWick = lowerWickPct(v1);
    const v2LowerWick = lowerWickPct(v2);

    if (v1LowerWick >= minWickPct && v2LowerWick >= minWickPct) {
      // Ambos têm pavio inferior longo. Verificar se estão perto de um suporte
      const avgWickL = (v1.l + v2.l) / 2;
      const supp = supports.find(s => Math.abs(avgWickL - s) / s <= tolerancePct);

      if (supp) {
        // Confirmou duplo pavio no suporte! Sinal de CALL no retorno
        return {
          action: "CALL",
          expiryCandles: 1,
          customStats: {
            operacao: "CALL (Duplo Pavio Inferior)",
            pavioV1: `${Math.round(v1LowerWick * 100)}%`,
            pavioV2: `${Math.round(v2LowerWick * 100)}%`,
            linhaPreco: supp.toFixed(5),
          }
        };
      }
    }

    // 2. Verificar sinais de PUT (Resistência com Pavio Superior Duplo)
    const v1UpperWick = upperWickPct(v1);
    const v2UpperWick = upperWickPct(v2);

    if (v1UpperWick >= minWickPct && v2UpperWick >= minWickPct) {
      // Ambos têm pavio superior longo. Verificar se estão perto de uma resistência
      const avgWickH = (v1.h + v2.h) / 2;
      const resis = resistances.find(r => Math.abs(avgWickH - r) / r <= tolerancePct);

      if (resis) {
        // Confirmou duplo pavio na resistência! Sinal de PUT no retorno
        return {
          action: "PUT",
          expiryCandles: 1,
          customStats: {
            operacao: "PUT (Duplo Pavio Superior)",
            pavioV1: `${Math.round(v1UpperWick * 100)}%`,
            pavioV2: `${Math.round(v2UpperWick * 100)}%`,
            linhaPreco: resis.toFixed(5),
          }
        };
      }
    }

    return null;
  }
};

export default DuploPavioRetesteStrategy;
