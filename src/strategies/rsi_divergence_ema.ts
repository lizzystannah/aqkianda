import { Strategy, StrategyContext, StrategyResult } from "./index";

const RsiDivergenceEma: Strategy = {
  id: "rsi_divergence_ema",
  name: "RSI Divergence + EMA",
  description: "Divergências RSI bullish/bearish confirmadas por EMA9/21 e ADX.",
  category: "auto",

  customStatKeys: [
    { key: "tipoDivergencia", label: "Tipo Divergência" },
    { key: "rsiP1", label: "RSI Pivot 1" },
    { key: "rsiP2", label: "RSI Pivot 2" },
    { key: "adxAtual", label: "ADX" },
    { key: "emaAlign", label: "EMA Alinhamento" },
    { key: "ratioCorpo", label: "Ratio Corpo" },
  ],

  customFilterKeys: [
    { key: "min_adx", label: "ADX Mínimo", type: "range", defaultMin: 15, defaultMax: 40, step: 1 },
    { key: "tipo_div", label: "Tipo de Divergência", type: "multiselect", options: ["BULLISH", "BEARISH"] },
  ],

  onTick: (ctx: StrategyContext): StrategyResult | null => {
    const velas = ctx.history;
    const n = velas.length;
    if (n < 60) return null;
    if (ctx.hasOpenTrade) return null;

    const filters = ctx.activeFilters || {};

    // ── Indicadores ──────────────────────────────────────────────────────
    const rsi = ctx.indicators.rsi(14);
    const ema9 = ctx.indicators.ema(9);
    const ema21 = ctx.indicators.ema(21);
    const adxData = ctx.indicators.adx(14);

    const lastRsi   = rsi[rsi.length - 1];
    const lastEma9  = ema9[ema9.length - 1];
    const lastEma21 = ema21[ema21.length - 1];
    const lastAdx   = adxData.adx[adxData.adx.length - 1];

    if (!isFinite(lastRsi) || !isFinite(lastEma9) || !isFinite(lastEma21) || !isFinite(lastAdx)) return null;

    // ── Filtro ADX ───────────────────────────────────────────────────────
    const minAdx = filters.min_adx?.enabled ? (filters.min_adx.min ?? 18) : 18;
    if (lastAdx < minAdx) return null;

    // ── EMA Alinhamento ──────────────────────────────────────────────────
    const emaAlign = lastEma9 > lastEma21 ? "ALTA" : lastEma9 < lastEma21 ? "BAIXA" : "NEUTRA";

    // ── Janela de pivots (últimas 25 velas, exclui última = confirmação) ─
    const jInicio = Math.max(1, n - 26);
    const jFim    = n - 2;

    // Encontrar topos locais com RSI
    const topos: Array<{ idx: number; preco: number; rsiVal: number }> = [];
    for (let i = jInicio + 1; i <= jFim - 1; i++) {
      const vP = velas[i - 1]; const vC = velas[i]; const vN = velas[i + 1];
      if (!vP || !vC || !vN) continue;
      if (!isFinite(rsi[i])) continue;
      if (vC.h > vP.h && vC.h > vN.h) topos.push({ idx: i, preco: vC.h, rsiVal: rsi[i] });
    }

    // Encontrar fundos locais com RSI
    const fundos: Array<{ idx: number; preco: number; rsiVal: number }> = [];
    for (let i = jInicio + 1; i <= jFim - 1; i++) {
      const vP = velas[i - 1]; const vC = velas[i]; const vN = velas[i + 1];
      if (!vP || !vC || !vN) continue;
      if (!isFinite(rsi[i])) continue;
      if (vC.l < vP.l && vC.l < vN.l) fundos.push({ idx: i, preco: vC.l, rsiVal: rsi[i] });
    }

    // ── Vela de confirmação ──────────────────────────────────────────────
    const vc = velas[n - 1];
    const range = vc.h - vc.l;
    const ratioCorpo = range > 0 ? Math.abs(vc.c - vc.o) / range : 0;
    if (ratioCorpo < 0.35) return null;

    const tipoBearish = !filters.tipo_div?.enabled || filters.tipo_div.values?.includes("BEARISH");
    const tipoBullish = !filters.tipo_div?.enabled || filters.tipo_div.values?.includes("BULLISH");

    // ── BEARISH DIVERGENCE → PUT ─────────────────────────────────────────
    // Preço faz topo mais alto, RSI faz topo mais baixo
    if (tipoBearish && emaAlign !== "ALTA" && vc.c < vc.o && topos.length >= 2) {
      const ord = [...topos].sort((a, b) => b.idx - a.idx);
      const p2 = ord[0]; const p1 = ord[1];
      if (p2.idx - p1.idx >= 3) {
        const precoSubiu = p2.preco > p1.preco + p1.preco * 0.0005;
        const rsiDesceu  = p1.rsiVal - p2.rsiVal > 2;
        const rsiAlto    = p2.rsiVal >= 55;
        if (precoSubiu && rsiDesceu && rsiAlto) {
          return {
            action: "PUT",
            expiryCandles: 2,
            waitForCandleClose: true,
            customStats: {
              tipoDivergencia: "BEARISH",
              rsiP1: Math.round(p1.rsiVal * 10) / 10,
              rsiP2: Math.round(p2.rsiVal * 10) / 10,
              adxAtual: Math.round(lastAdx * 10) / 10,
              emaAlign,
              ratioCorpo: Math.round(ratioCorpo * 100) / 100,
            }
          };
        }
      }
    }

    // ── BULLISH DIVERGENCE → CALL ────────────────────────────────────────
    // Preço faz fundo mais baixo, RSI faz fundo mais alto
    if (tipoBullish && emaAlign !== "BAIXA" && vc.c > vc.o && fundos.length >= 2) {
      const ord = [...fundos].sort((a, b) => b.idx - a.idx);
      const p2 = ord[0]; const p1 = ord[1];
      if (p2.idx - p1.idx >= 3) {
        const precoDesceu = p1.preco - p2.preco > p1.preco * 0.0005;
        const rsiSubiu    = p2.rsiVal - p1.rsiVal > 2;
        const rsiBaixo    = p2.rsiVal <= 45;
        if (precoDesceu && rsiSubiu && rsiBaixo) {
          return {
            action: "CALL",
            expiryCandles: 2,
            waitForCandleClose: true,
            customStats: {
              tipoDivergencia: "BULLISH",
              rsiP1: Math.round(p1.rsiVal * 10) / 10,
              rsiP2: Math.round(p2.rsiVal * 10) / 10,
              adxAtual: Math.round(lastAdx * 10) / 10,
              emaAlign,
              ratioCorpo: Math.round(ratioCorpo * 100) / 100,
            }
          };
        }
      }
    }

    return null;
  }
};

export default RsiDivergenceEma;