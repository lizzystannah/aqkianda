import { Strategy, StrategyContext, StrategyResult } from "./index";

// ═══════════════════════════════════════════════════════════════════════════
// UTILITÁRIO — Parabolic SAR (autossuficiente, sem imports externos)
// ═══════════════════════════════════════════════════════════════════════════
function calcParabolicSAR(
  highs: number[],
  lows: number[],
  afStep: number,
  afMax: number
): { sar: number[]; trend: number[]; af: number[] } {
  const len   = highs.length;
  const sar   = new Array(len).fill(0);
  const trend = new Array(len).fill(1);
  const af    = new Array(len).fill(afStep);

  if (len < 3) return { sar, trend, af };

  let cTrend = 1;
  let cSAR   = lows[0];
  let cEP    = highs[0];
  let cAF    = afStep;

  sar[0]   = cSAR;
  trend[0] = cTrend;
  af[0]    = cAF;

  for (let i = 1; i < len; i++) {
    const h = highs[i];
    const l = lows[i];

    let newSAR = cSAR + cAF * (cEP - cSAR);

    if (cTrend === 1) {
      if (i >= 2) newSAR = Math.min(newSAR, lows[i - 1], lows[i - 2]);
      else        newSAR = Math.min(newSAR, lows[i - 1]);

      if (l < newSAR) {
        cTrend = -1;
        newSAR = cEP;
        cEP    = l;
        cAF    = afStep;
      } else {
        if (h > cEP) {
          cEP = h;
          cAF = Math.min(cAF + afStep, afMax);
        }
      }
    } else {
      if (i >= 2) newSAR = Math.max(newSAR, highs[i - 1], highs[i - 2]);
      else        newSAR = Math.max(newSAR, highs[i - 1]);

      if (h > newSAR) {
        cTrend = 1;
        newSAR = cEP;
        cEP    = h;
        cAF    = afStep;
      } else {
        if (l < cEP) {
          cEP = l;
          cAF = Math.min(cAF + afStep, afMax);
        }
      }
    }

    cSAR     = newSAR;
    sar[i]   = cSAR;
    trend[i] = cTrend;
    af[i]    = cAF;
  }

  return { sar, trend, af };
}

// ═══════════════════════════════════════════════════════════════════════════
// ESTRATÉGIA
// ═══════════════════════════════════════════════════════════════════════════
const SarZoneReversal: Strategy = {
  id: "sar_zone_reversal",
  name: "SAR + Zone Reversal",
  description:
    "Entra na reversão quando o preço toca zona de suporte/resistência E o Parabolic SAR vira de lado simultaneamente. Expira no fechamento da vela que gerou o sinal.",
  category: "auto",

  customStatKeys: [
    { key: "tipo_zona",      label: "Tipo de Zona"          },
    { key: "distancia_zona", label: "Distância da Zona (%)" },
    { key: "sar_valor",      label: "SAR no Sinal"          },
    { key: "sar_af",         label: "AF do SAR"             },
    { key: "confluencia",    label: "Confluência"           },
    { key: "rsi_atual",      label: "RSI no Sinal"          },
    { key: "retracao_baixa", label: "Retração Baixa (%)"    },
    { key: "retracao_alta",  label: "Retração Alta (%)"     },
  ],

  customFilterKeys: [
    {
      key: "zone_tolerance",
      label: "Tolerância da Zona (÷1000)",
      type: "range",
      defaultMin: 1,
      defaultMax: 10,
      step: 1,
    },
    {
      key: "af_step",
      label: "SAR AF Step (÷1000)",
      type: "range",
      defaultMin: 10,
      defaultMax: 40,
      step: 5,
    },
    {
      key: "af_max",
      label: "SAR AF Máximo (÷100)",
      type: "range",
      defaultMin: 10,
      defaultMax: 30,
      step: 5,
    },
    {
      key: "min_confluence",
      label: "Confluência Mínima",
      type: "range",
      defaultMin: 1,
      defaultMax: 4,
      step: 1,
    },
    {
      key: "min_candle_remaining",
      label: "Tempo Mínimo Restante na Vela (s)",
      type: "range",
      defaultMin: 5,
      defaultMax: 45,
      step: 5,
    },
    {
      key: "usar_sr_zones",
      label: "Usar Zonas S/R",
      type: "select",
      options: ["Sim", "Não"],
    },
    {
      key: "direcao",
      label: "Direção Permitida",
      type: "select",
      options: ["Ambas", "Apenas CALL", "Apenas PUT"],
    },
  ],

  onTick: (ctx: StrategyContext): StrategyResult | null => {
    const velas = ctx.history;
    const n     = velas.length;

    // ─── Segurança ────────────────────────────────────────────────────────────
    if (n < 40)            return null;
    if (ctx.hasOpenTrade)  return null;

    const filters = ctx.activeFilters || {};

    // ─── Filtros ──────────────────────────────────────────────────────────────
    const zoneTolerance =
      (filters.zone_tolerance?.ranges?.[0]?.min ?? 3) / 1000;

    const afStep =
      (filters.af_step?.ranges?.[0]?.min ?? 20) / 1000;

    const afMax =
      (filters.af_max?.ranges?.[0]?.min ?? 20) / 100;

    const minConfluence =
      filters.min_confluence?.ranges?.[0]?.min ?? 2;

    const minCandleRemainingSec =
      filters.min_candle_remaining?.ranges?.[0]?.min ?? 10;

    const usarZonas =
      (filters.usar_sr_zones?.value ?? "Sim") === "Sim";

    const direcaoPermitida =
      filters.direcao?.value ?? "Ambas";

    // ─── Tempo restante na vela (só bloqueia em live/demo) ───────────────────
    const tempoRestanteSec = (ctx.candleTimeRemainingMs ?? 0) / 1000;
    if (!ctx.isBacktest && tempoRestanteSec < minCandleRemainingSec) {
      return null;
    }

    // ─── Calcular Parabolic SAR ───────────────────────────────────────────────
    const sarData = ctx.indicators.parabolicSar(afStep, afMax);
    const nSar = sarData.sar.length;
    const currentSAR   = sarData.sar[nSar - 1];
    const currentTrend = sarData.trend[nSar - 1];
    const prevTrend    = sarData.trend[nSar - 2];
    const currentAF    = sarData.af[nSar - 1];

    if (currentSAR === null || currentSAR === 0) return null;

    // ─── Condição principal: SAR virou NESTA vela ─────────────────────────────
    const sarVirouAltista  = currentTrend ===  1 && prevTrend === -1;
    const sarVirouBaixista = currentTrend === -1 && prevTrend ===  1;

    // Se o SAR não virou, não há sinal de reversão
    if (!sarVirouAltista && !sarVirouBaixista) return null;

    // ─── Preço atual ──────────────────────────────────────────────────────────
    const price = ctx.lastPrice;
    const vc = velas[n - 1];

    // ─── Toque em linhas S/R ──────────────────────────────────────────────────
    const getTrendPrice = (tInfo: any, timestamp: number) => {
      if (tInfo.t1 === tInfo.t2) return tInfo.p1;
      return tInfo.p1 + (timestamp - tInfo.t1) * (tInfo.p2 - tInfo.p1) / (tInfo.t2 - tInfo.t1);
    };

    const combinedLines = [
      ...ctx.srLines.map(l => ({ ...l, currentPrice: l.price })),
      ...(ctx.trendLines || []).map(t => ({ ...t, currentPrice: getTrendPrice(t, vc.t) }))
    ];

    const tocouLinhaSuporte = combinedLines.some(
      (l) =>
        l.type === "support" &&
        Math.abs(price - l.currentPrice) / l.currentPrice <= zoneTolerance
    );

    const tocouLinhaResistencia = combinedLines.some(
      (l) =>
        l.type === "resistance" &&
        Math.abs(price - l.currentPrice) / l.currentPrice <= zoneTolerance
    );

    // ─── Toque em zonas S/R ───────────────────────────────────────────────────
    let tocouZonaSuporte     = false;
    let tocouZonaResistencia = false;

    if (usarZonas && ctx.srZones?.length) {
      tocouZonaSuporte = ctx.srZones.some(
        (z) =>
          ((z as any).type === "buy" || z.type === "support" || (z as any).type === "buy_zone") &&
          price >= Math.min(z.p1, z.p2) * (1 - zoneTolerance) &&
          price <= Math.max(z.p1, z.p2) * (1 + zoneTolerance)
      );
      tocouZonaResistencia = ctx.srZones.some(
        (z) =>
          ((z as any).type === "sell" || z.type === "resistance" || (z as any).type === "sell_zone") &&
          price >= Math.min(z.p1, z.p2) * (1 - zoneTolerance) &&
          price <= Math.max(z.p1, z.p2) * (1 + zoneTolerance)
      );
    }

    const emZonaSuporte     = tocouLinhaSuporte     || tocouZonaSuporte;
    const emZonaResistencia = tocouLinhaResistencia || tocouZonaResistencia;

    // Se "usarZonas" for Sim, exigimos o toque. Se for Não, permitimos sinal só pelo SAR.
    if (usarZonas && !emZonaSuporte && !emZonaResistencia) return null;

    // ─── Cálculo de Retração (Shadow length) ──────────────────────────────────
    // Retração é a distância entre a máxima/mínima e o fechamento
    const retracaoAlta = vc.h - Math.max(vc.o, vc.c);
    const retracaoBaixa = Math.min(vc.o, vc.c) - vc.l;
    const totalVela = vc.h - vc.l;
    const pctRetracaoAlta = totalVela > 0 ? (retracaoAlta / totalVela) * 100 : 0;
    const pctRetracaoBaixa = totalVela > 0 ? (retracaoBaixa / totalVela) * 100 : 0;

    // ─── Indicadores para confluência ─────────────────────────────────────────
    const rsiArr = ctx.indicators.rsi(14);
    const ema20  = ctx.indicators.ema(20);
    const bb     = ctx.indicators.bollinger(20, 2);

    const lastRsi   = rsiArr[rsiArr.length - 1] || 50;
    const lastEma20 = ema20[ema20.length - 1] || price;
    const lowerBB   = bb.lower[bb.lower.length - 1] || price;
    const upperBB   = bb.upper[bb.upper.length - 1] || price;

    // ─── Vela de confirmação ──────────────────────────────────────────────────
    const range    = vc.h - vc.l;
    const ratioCorpo = range > 0 ? Math.abs(vc.c - vc.o) / range : 0;

    // ─── Zona de referência para log ──────────────────────────────────────────
    const zonaRef = emZonaSuporte
      ? (combinedLines.find((l) => l.type === "support")?.currentPrice  ?? price)
      : (combinedLines.find((l) => l.type === "resistance")?.currentPrice ?? price);

    const distanciaZona = Math.abs(price - zonaRef) / zonaRef * 100;

    // ═══════════════════════════════════════════════════════════════════════
    // SINAL CALL — Suporte + SAR virou altista
    // ═══════════════════════════════════════════════════════════════════════
    if (
      sarVirouAltista &&
      emZonaSuporte   &&
      direcaoPermitida !== "Apenas PUT"
    ) {
      let confluencia = 2; // SAR virou + tocou suporte

      if (lastRsi < 40)                          confluencia++;
      if (price <= lowerBB * 1.003)              confluencia++;
      if (price <= lastEma20 * 1.002)            confluencia++;
      if (ratioCorpo > 0.4 && vc.c > vc.o)      confluencia++; // vela de alta
      if (tocouLinhaSuporte && tocouZonaSuporte) confluencia++; // dupla confirmação

      if (confluencia < minConfluence) return null;

      return {
        action: "CALL",
        duration: ctx.isBacktest ? 60 : -1,
        expiryCandles: 1,
        waitForCandleClose: false,
        customStats: {
          tipo_zona:      emZonaSuporte ? (tocouZonaSuporte ? "Zona_Suporte" : "Linha_Suporte") : "Nenhum",
          distancia_zona: Math.round(distanciaZona * 1000) / 1000,
          sar_valor:      Math.round(currentSAR * 100000) / 100000,
          sar_af:         Math.round(currentAF * 10000)   / 10000,
          confluencia,
          rsi_atual:      Math.round(lastRsi * 10) / 10,
          retracao_baixa: Math.round(pctRetracaoBaixa * 10) / 10,
          retracao_alta:  Math.round(pctRetracaoAlta * 10) / 10,
        },
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SINAL PUT — Resistência + SAR virou baixista
    // ═══════════════════════════════════════════════════════════════════════
    if (
      sarVirouBaixista  &&
      emZonaResistencia &&
      direcaoPermitida !== "Apenas CALL"
    ) {
      let confluencia = 2; // SAR virou + tocou resistência

      if (lastRsi > 60)                                    confluencia++;
      if (price >= upperBB * 0.997)                        confluencia++;
      if (price >= lastEma20 * 0.998)                      confluencia++;
      if (ratioCorpo > 0.4 && vc.c < vc.o)                confluencia++; // vela de baixa
      if (tocouLinhaResistencia && tocouZonaResistencia)   confluencia++; // dupla confirmação

      if (confluencia < minConfluence) return null;

      return {
        action: "PUT",
        duration: ctx.isBacktest ? 60 : -1,
        expiryCandles: 1,
        waitForCandleClose: false,
        customStats: {
          tipo_zona:      emZonaResistencia ? (tocouZonaResistencia ? "Zona_Resistencia" : "Linha_Resistencia") : "Nenhum",
          distancia_zona: Math.round(distanciaZona * 1000) / 1000,
          sar_valor:      Math.round(currentSAR * 100000) / 100000,
          sar_af:         Math.round(currentAF * 10000)   / 10000,
          confluencia,
          rsi_atual:      Math.round(lastRsi * 10) / 10,
          retracao_baixa: Math.round(pctRetracaoBaixa * 10) / 10,
          retracao_alta:  Math.round(pctRetracaoAlta * 10) / 10,
        },
      };
    }

    return null;
  },
};

export default SarZoneReversal;