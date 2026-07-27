import { Strategy, StrategyContext, StrategyResult } from "./index";

/**
 * Grid Strategy
 * Places a grid of orders around a base price.
 * Since the system handles one trade per asset at a time, 
 * this adapted grid logic waits for a fill/expiration to place the next level.
 */
const GridStrategy: Strategy = {
  id: "grid_range",
  name: "Grid Trading (Range)",
  description: "Opera em grades (grade de ordens) baseado em espaçamento percentual.",
  onTick: (context: StrategyContext): StrategyResult | null => {
    const { history, lastPrice } = context;
    if (history.length < 2) return null;

    // Parâmetros da grade (poderiam vir de campos customizados, mas fixamos default)
    const spacing = 0.005; // 0.5%
    const basePrice = history[0].close; // Preço de referência (primeira vela carregada)

    // Lógica simples: se o preço estiver X% abaixo da base, CALL. Se X% acima, PUT.
    // Isso simula a captura de movimentos de retorno ao centro (mean reversion)
    
    if (lastPrice <= basePrice * (1 - spacing)) {
      return { 
        action: "CALL", 
        duration: 60, 
        expiryCandles: 1, 
        comment: `Grid Buy @ ${lastPrice.toFixed(2)}` 
      };
    }

    if (lastPrice >= basePrice * (1 + spacing)) {
      return { 
        action: "PUT", 
        duration: 60, 
        expiryCandles: 1, 
        comment: `Grid Sell @ ${lastPrice.toFixed(2)}` 
      };
    }

    return null;
  }
};

export default GridStrategy;
