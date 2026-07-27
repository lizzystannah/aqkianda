import { Strategy, StrategyContext, StrategyResult } from "./index";

const BollingerSqueezeMacd: Strategy = {
  id: "bollinger_squeeze_macd",
  name: "Bollinger Squeeze + MACD",
  description: "Compressão de volatilidade nas BB seguida de breakout confirmado pelo histograma MACD.",
  category: "auto",

  customStatKeys: [
    { key: "direcao", label: "Direção" },
    { key: "velasSqueeeze", label: "Velas Squeeze" },
    { key: "ratioBW", label: "BW Ratio" },
    { key: "histMACD", label: "Histograma MACD" },
    { key: "crossRecente", label: "Cross Recente" },
    { key: "ratioCorpo", label: "Corpo Breakout" },
  ],

  customFilterKeys: [
    { key: "min_velas_squeeze", label: "Mín. Velas em Squeeze", type: "range", defaultMin: 2, defaultMax: 15, step: 1 },
    { key: "exigir_cross", label: "Exigir Cross MACD Recente", type: "multiselect", options: ["SIM", "NAO"] },
    { key: "direcao_sinal", label: "Direção do Sinal", type: "multiselect", options: ["CALL", "PUT"] },
  ],

  onTick: (ctx: StrategyContext): StrategyResult | null => {
    const velas = ctx.history;
    const n = velas.length;
    if (n < 80) return null;
    if (ctx.hasOpenTrade) return null;

    const filters = ctx.activeFilters || {};

    // ── Indicadores ──────────────────────────────────────────────────────
    const bb      = ctx.indicators.bollinger(20, 2);
    const sma20   = ctx.indicators.sma(20);
    const macdData = ctx.indicators.macd(12, 26, 9);

    const bbUpper = bb.upper;
    const bbLower = bb.lower;
    const hist    = macdData.histogram;

    if (!bbUpper?.length || !bbLower?.length || !sma20?.length || !hist?.length) return null;

    const iLast = bbUpper.length - 1;

    // ── PASSO 1: Squeeze ─────────────────────────────────────────────────
    // Bandwidth = (upper - lower) / sma
    const bwAtual = sma20[iLast] > 0 ? (bbUpper[iLast] - bbLower[iLast]) / sma20[iLast] : 0;
    if (bwAtual === 0) return null;

    // Média histórica de bandwidth (últimas 50 velas)
    let somaBw = 0; let countBw = 0;
    const bwInicio = Math.max(0, iLast - 50);
    for (let i = bwInicio; i <= iLast; i++) {
      if (sma20[i] > 0) { somaBw += (bbUpper[i] - bbLower[i]) / sma20[i]; countBw++; }
    }
    if (countBw === 0) return null;

    const bwMedia  = somaBw / countBw;
    const ratioBW  = bwAtual / bwMedia;
    if (ratioBW > 0.75) return null; // não está em squeeze

    // Contar velas consecutivas em squeeze
    let velasSqueeeze = 0;
    for (let i = iLast; i >= bwInicio; i--) {
      if (sma20[i] > 0) {
        const bwI = (bbUpper[i] - bbLower[i]) / sma20[i];
        if (bwI / bwMedia <= 0.75) velasSqueeeze++;
        else break;
      }
    }

    const minVelasSq = filters.min_velas_squeeze?.enabled ? (filters.min_velas_squeeze.min ?? 3) : 3;
    if (velasSqueeeze < minVelasSq) return null;
    if (velasSqueeeze > 30) return null;

    // ── PASSO 2: Breakout (últimas 3 velas, excluindo a última = confirmação) ──
    let direcao: "CALL" | "PUT" | null = null;
    let ratioCorpo = 0;

    for (let i = n - 2; i >= Math.max(1, n - 4); i--) {
      const v = velas[i];
      const upper = bbUpper[i];
      const lower = bbLower[i];
      if (!v || !isFinite(upper) || !isFinite(lower)) continue;
      const range = v.h - v.l;
      if (range === 0) continue;
      const rc = Math.abs(v.c - v.o) / range;
      if (rc < 0.45) continue;
      if (v.c > upper && v.c > v.o) { direcao = "CALL"; ratioCorpo = rc; break; }
      if (v.c < lower && v.c < v.o) { direcao = "PUT";  ratioCorpo = rc; break; }
    }

    if (!direcao) return null;

    if (filters.direcao_sinal?.enabled && filters.direcao_sinal.values) {
      if (!filters.direcao_sinal.values.includes(direcao)) return null;
    }

    // ── PASSO 3: MACD histograma na direção ──────────────────────────────
    const histAtual = hist[hist.length - 1];
    if (!isFinite(histAtual)) return null;
    if (direcao === "CALL" && histAtual <= 0) return null;
    if (direcao === "PUT"  && histAtual >= 0) return null;

    // Cross recente (nas últimas 4 velas mudou de sinal)
    let crossRecente = false;
    for (let i = hist.length - 2; i >= Math.max(0, hist.length - 5); i--) {
      const hA = hist[i];
      if (!isFinite(hA)) continue;
      if (direcao === "CALL" && hA <= 0 && histAtual > 0) { crossRecente = true; break; }
      if (direcao === "PUT"  && hA >= 0 && histAtual < 0) { crossRecente = true; break; }
    }

    const exigirCross = filters.exigir_cross?.enabled && filters.exigir_cross.values?.includes("SIM");
    if (exigirCross && !crossRecente) return null;

    // ── PASSO 4: Vela atual confirma ─────────────────────────────────────
    const vc = velas[n - 1];
    if (!vc) return null;
    if (direcao === "CALL" && vc.c <= vc.o) return null;
    if (direcao === "PUT"  && vc.c >= vc.o) return null;

    // ✅ SINAL CONFIRMADO
    return {
      action: direcao,
      expiryCandles: 2,
      waitForCandleClose: true,
      customStats: {
        direcao,
        velasSqueeeze,
        ratioBW: Math.round(ratioBW * 100) / 100,
        histMACD: Math.round(histAtual * 100000) / 100000,
        crossRecente: crossRecente ? "SIM" : "NAO",
        ratioCorpo: Math.round(ratioCorpo * 100) / 100,
      }
    };
  }
};

export default BollingerSqueezeMacd;