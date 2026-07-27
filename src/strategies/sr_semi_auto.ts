import { Strategy, StrategyContext, StrategyResult } from "./index";

const lastProcessedTimes: Record<string, number> = {};

const strategy: Strategy = {
  id: "sr-semi-auto",
  name: "Suporte e Resistência (Semi-Auto)",
  description: "Detecta toques e rompimentos em linhas de S/R traçadas manualmente no gráfico. Aguarde o fechamento da vela para confirmação.",
  category: "semi-auto",
  onTick: (context: StrategyContext): StrategyResult | null => {
    const history = context.history;
    if (history.length < 2) return null;

    const currentAsset = context.asset;
    const lastProcessedTime = lastProcessedTimes[currentAsset] || 0;

    // No backtest o último elemento do array history é a vela que acabou de fechar.
    // Em tempo real (robotEngine no client), a última vela ainda está se formando, então usamos a penúltima.
    // Porém, no serverEngine SEMPRE recebemos um array de velas fechadas. Ou seja, a última já fechou.
    // Assim usamos a última vela fechada em qualquer caso (backtest ou server)
    const lastCandle = history[history.length - 1];

    if (!lastCandle || lastProcessedTime === lastCandle.t) return null;

    const lines = context.srLines || [];
    const zones = context.srZones || [];
    const trendLines = context.trendLines || [];
    const hasOpenTrade = context.hasOpenTrade;

    let result: StrategyResult | null = null;
    let actedOnCandle = false;

    const getTrendPrice = (tInfo: any, timestamp: number) => {
      if (tInfo.t1 === tInfo.t2) return tInfo.p1;
      return tInfo.p1 + (timestamp - tInfo.t1) * (tInfo.p2 - tInfo.p1) / (tInfo.t2 - tInfo.t1);
    };

    const combinedLines = [
      ...lines.map(l => ({ ...l, isTrend: false, currentPrice: l.price })),
      ...trendLines.map(t => ({ ...t, isTrend: true, currentPrice: getTrendPrice(t, lastCandle.t) }))
    ];

    // Estratégia de Linhas (Suporte e Resistência, incluindo Trendlines)
    for (const line of combinedLines) {
      if (hasOpenTrade) break;

      const linePrice = line.currentPrice;
      const openedAbove = lastCandle.o > linePrice;
      const openedBelow = lastCandle.o < linePrice;

      const updateLineType = (id: string, kind: "support" | "resistance", isTrend: boolean) => {
        if (isTrend) {
          context.updateTrendLine?.(id, { kind });
        } else {
          context.updateSR?.(id, { kind });
        }
      };

      // COMPRA (Suporte)
      if (openedAbove) {
        const touched = lastCandle.l <= linePrice;
        const closedAbove = lastCandle.c > linePrice;
        const closedBelow = lastCandle.c < linePrice;

        if (touched && closedAbove) {
          context.toast?.success(`Suporte respeitado em ${linePrice.toFixed(2)}. Toque e fechamento confirmados.`);
          result = { action: "CALL" };
          actedOnCandle = true;
          // Se estava marcada como resistência, atualiza para suporte
          if (line.type === "resistance") updateLineType(line.id, "support", line.isTrend);
          break;
        } else if (closedBelow) {
          // Rompimento: se fechou abaixo, vira resistência para a próxima
          updateLineType(line.id, "resistance", line.isTrend);
          context.toast?.info(`Suporte em ${linePrice.toFixed(2)} rompido. Virou Resistência.`);
          actedOnCandle = true;
        }
      }
      // VENDA (Resistência)
      else if (openedBelow) {
        const touched = lastCandle.h >= linePrice;
        const closedBelow = lastCandle.c < linePrice;
        const closedAbove = lastCandle.c > linePrice;

        if (touched && closedBelow) {
          context.toast?.success(`Resistência respeitada em ${linePrice.toFixed(2)}. Toque e fechamento confirmados.`);
          result = { action: "PUT" };
          actedOnCandle = true;
          // Se estava marcada como suporte, atualiza para resistência
          if (line.type === "support") updateLineType(line.id, "resistance", line.isTrend);
          break;
        } else if (closedAbove) {
          // Rompimento: se fechou acima, vira suporte para a próxima
          updateLineType(line.id, "support", line.isTrend);
          context.toast?.info(`Resistência em ${linePrice.toFixed(2)} rompida. Virou Suporte.`);
          actedOnCandle = true;
        }
      }
    }

    // Strategy 2: Zones (Strict entry detection)
    if (!actedOnCandle && !hasOpenTrade) {
      for (const zone of zones) {
        if (zone.type === "support" || zone.type === "buy_zone") { // Using "support" or "buy_zone" based on backwards compat
          const bottomPrice = zone.p2 || zone.bottomPrice || 0;
          const topPrice = zone.p1 || zone.topPrice || 0;
          const touchedTop = lastCandle.l <= topPrice;
          const closedAboveBottom = lastCandle.c >= bottomPrice;

          if (touchedTop && closedAboveBottom) {
            context.toast?.success(`Zona de COMPRA respeitada.`);
            result = { action: "CALL" };
            actedOnCandle = true;
            break;
          }
        } else if (zone.type === "resistance" || zone.type === "sell_zone") {
          const bottomPrice = zone.p2 || zone.bottomPrice || 0;
          const topPrice = zone.p1 || zone.topPrice || 0;
          const touchedBottom = lastCandle.h >= bottomPrice;
          const closedBelowTop = lastCandle.c <= topPrice;

          if (touchedBottom && closedBelowTop) {
            context.toast?.success(`Zona de VENDA respeitada.`);
            result = { action: "PUT" };
            actedOnCandle = true;
            break;
          }
        }
      }
    }

    if (actedOnCandle) {
      lastProcessedTimes[currentAsset] = lastCandle.t;
    }

    return result;
  }
};

export default strategy;
