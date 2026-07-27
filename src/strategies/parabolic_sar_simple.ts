import { Strategy, StrategyContext, StrategyResult } from "./index";

/**
 * Parabolic SAR Simple Strategy
 * 
 * Segue a tendência do Parabolic SAR.
 * Compra (CALL) quando o SAR inverte para baixo (suporte) e a tendência vira de alta.
 * Vende (PUT) quando o SAR inverte para cima (resistência) e a tendência vira de baixa.
 */
const ParabolicSarSimple: Strategy = {
  id: "parabolic_sar_simple",
  name: "Parabolic SAR (Seguimento)",
  description: "Estratégia pura de seguimento de tendência baseada no Parabolic SAR. Entra no exato momento da reversão do indicador.",
  category: "auto",

  customStatKeys: [
    { key: "sar_val", label: "SAR no Sinal" },
    { key: "af_atual", label: "AF Atual" },
    { key: "tendencia", label: "Tendência" },
  ],

  customFilterKeys: [
    {
      key: "af_step",
      label: "Incremento AF (÷1000)",
      type: "range",
      defaultMin: 10,
      defaultMax: 50,
      step: 5,
    },
    {
      key: "af_max",
      label: "Máximo AF (÷100)",
      type: "range",
      defaultMin: 10,
      defaultMax: 40,
      step: 5,
    },
  ],

  onTick: (ctx: StrategyContext): StrategyResult | null => {
    const history = ctx.history;
    const n = history.length;

    if (n < 20) return null;
    if (ctx.hasOpenTrade) return null;

    const filters = ctx.activeFilters || {};
    const afStep = (filters.af_step?.ranges?.[0]?.min ?? 20) / 1000;
    const afMax = (filters.af_max?.ranges?.[0]?.min ?? 20) / 100;

    // Calculamos o SAR nos dados históricos
    const sarData = ctx.indicators.parabolicSar(afStep, afMax);
    const nSar = sarData.sar.length;
    
    if (nSar < 2) return null;

    const currentTrend = sarData.trend[nSar - 1];
    const prevTrend = sarData.trend[nSar - 2];
    const currentSAR = sarData.sar[nSar - 1];
    const currentAF = sarData.af[nSar - 1];

    // SINAL CALL: SAR inverteu de Baixa para Alta no fechamento da última vela
    if (currentTrend === 1 && prevTrend === -1) {
      return {
        action: "CALL",
        expiryCandles: 1,
        customStats: {
          sar_val: currentSAR,
          af_atual: currentAF,
          tendencia: "ALTA",
        }
      };
    }

    // SINAL PUT: SAR inverteu de Alta para Baixa no fechamento da última vela
    if (currentTrend === -1 && prevTrend === 1) {
      return {
        action: "PUT",
        expiryCandles: 1,
        customStats: {
          sar_val: currentSAR,
          af_atual: currentAF,
          tendencia: "BAIXA",
        }
      };
    }

    return null;
  }
};

export default ParabolicSarSimple;
