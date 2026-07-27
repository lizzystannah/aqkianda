import { type Candle } from "@/lib/market";
import { type Trade } from "@/lib/store";

export interface StrategyContext {
  asset: string;
  history: { t: number; o: number; h: number; l: number; c: number }[];
  candles: Candle[];
  lastPrice: number;    // Preço da última vela FECHADA
  currentPrice: number; // Preço ATUAL (tick real-time)
  balance: number;
  tradingMode: string;
  isBacktest: boolean;
  intervalMs: number;
  candleTimeRemainingMs: number;
  srLines: { id: string; price: number; type: "support" | "resistance"; asset: string }[];
  srZones: { id: string; p1: number; p2: number; type: "support" | "resistance"; asset: string }[];
  trendLines?: { id: string; t1: number; p1: number; t2: number; p2: number; type: "support" | "resistance"; asset: string }[];
  // Helper to get aggregated candles for other timeframes (MTF)
  getMTF: (minutes: number) => Candle[];
  hasOpenTrade: boolean;
  lastTrade?: Trade; // O último trade completo (WIN/LOSS) obtido para esta estratégia/ativo

  activeFilters?: Record<string, StrategyFilterValue>;
  index: number;
  candle: Candle;
  warmUp: boolean;
  isWarmUp: boolean;
  isLast: boolean;
  updateSR?: (id: string, updates: any) => void;
  updateTrendLine?: (id: string, updates: any) => void;
  toast?: {
    success: (msg: string) => void;
    info: (msg: string) => void;
    error: (msg: string) => void;
  };
  indicators: {
    rsi: (period: number, dataSource?: number[]) => (number | null)[];
    sma: (period: number, dataSource?: number[]) => number[];
    ema: (period: number, dataSource?: number[]) => number[];
    bollinger: (period: number, multiplier: number, dataSource?: number[]) => { upper: number[]; lower: number[] };
    adx: (period: number, dataSource?: Candle[]) => { adx: number[]; plusDi: number[]; minusDi: number[] };
    macd: (fast: number, slow: number, signal: number, dataSource?: number[]) => { macd: number[]; signal: number[]; histogram: number[] };
    parabolicSar: (afStep?: number, afMax?: number, dataSource?: Candle[]) => { sar: number[]; trend: number[]; af: number[] };
  };
}

export interface StrategyResult {
  action: "CALL" | "PUT" | "BUY" | "SELL" | null;
  stake?: number;
  duration?: number;           // Duração em segundos (opcional)
  expiryCandles?: number | string;      // Duração em velas (opcional)
  customStats?: Record<string, any>;
  pendingPrice?: number;       // Trigger price for the order
  pendingExpiryCandles?: number; // How many candles the pending order remains valid
  sequenceTrigger?: {
    maxEntradas?: number;   // máximo de entradas em sequência (default: 50)
    stopOnLoss?: boolean;   // [deprecated] armazenado mas não verificado — a cor da vela já cobre esta condição
    minConsecutiveCandles?: number; // velas consecutivas da mesma cor antes de entrar (default: 0 = entra imediatamente)
  };
}

export interface StrategyFilterDef {
  key: string;
  label: string;
  type: "range" | "select" | "multiselect";
  options?: string[];
  defaultMin?: number;
  defaultMax?: number;
  step?: number;
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  category: "auto" | "semi-auto";
  customStatKeys?: { key: string; label: string; type?: "number" | "string" }[];
  customFilterKeys?: StrategyFilterDef[];
  onTick: (context: StrategyContext) => StrategyResult | null;
}

export interface StrategyFilterRange {
  id: string;
  min: number;
  max: number;
  action: "allow" | "ignore" | "invert";
  direction?: "all" | "buy" | "sell";
}

export interface AssetConfig {
  asset: string;
  direction: "all" | "buy" | "sell";
  action: "allow" | "ignore";
}

export type OptionAction = "allow" | "ignore" | "invert" | "invertBuy" | "invertSell";

export interface OptionConfig {
  option: string;
  action: OptionAction;
  direction?: "all" | "buy" | "sell";
}

export interface StrategyFilterValue {
  enabled: boolean;
  ranges?: StrategyFilterRange[]; // Para filtros do tipo "range"
  value?: string;                // Para filtros do tipo "select"
  values?: string[];             // Para filtros do tipo "multiselect"
  action?: "allow" | "ignore" | "invert"; // Ação global do filtro (para select/multiselect)
  direction?: "all" | "buy" | "sell";    // Filtro específico para comprar/vender ou ambos
  assetConfigs?: AssetConfig[];   // Configurações individuais por ativo
  optionConfigs?: OptionConfig[]; // Configurações individuais por opção (select/multiselect)
}

function matchesDirection(action: "CALL" | "PUT" | "BUY" | "SELL" | null, permitted: "all" | "buy" | "sell" | undefined): boolean {
  if (!action) return false;
  if (!permitted || permitted === "all") return true;
  const isBuy = action === "CALL" || action === "BUY";
  const isSell = action === "PUT" || action === "SELL";
  if (permitted === "buy" && isBuy) return true;
  if (permitted === "sell" && isSell) return true;
  return false;
}

/**
 * Applies multi-range filter logic (ignore/invert) and global inversion to a strategy signal.
 */
export function applyFilterLogic(
  rawResult: StrategyResult | null,
  filters: Record<string, StrategyFilterValue> | undefined,
  indicatorValues: Record<string, any>,
  globalInvert: boolean,
  strategyDirection?: "all" | "buy" | "sell"
): StrategyResult | null {
  if (!rawResult || !rawResult.action) return null;

  let action = rawResult.action;

  // Check strategy overall direction FIRST — before any filter inversion
  // This ensures strategyDirection constrains the RAW signal, not the post-inversion signal
  if (strategyDirection && strategyDirection !== "all") {
    if (!matchesDirection(action, strategyDirection)) {
      return null;
    }
  }

  if (filters) {
    for (const [key, filter] of Object.entries(filters)) {
      if (!filter.enabled) continue;

      // Check if current action is supported by this filter's allowed direction
      if (filter.direction && filter.direction !== "all") {
        if (!matchesDirection(action, filter.direction)) {
          return null; // The whole filter blocks this direction
        }
      }

      const val = indicatorValues[key] ?? indicatorValues[key.replace(/^_/, "")];
      if (val === undefined || val === null) continue;

      if (key === "_asset") {
        // --- Novo formato: optionConfigs ---
        if (filter.optionConfigs && filter.optionConfigs.length > 0) {
          const optCfg = filter.optionConfigs.find(oc => oc.option === val);
          if (optCfg) {
            // Check per-option direction
            if (optCfg.direction && optCfg.direction !== "all") {
              if (!matchesDirection(action, optCfg.direction)) return null;
            }
            // Apply per-option action
            if (optCfg.action === "ignore") return null;
            if (optCfg.action === "invert") action = invertAction(action);
            if (optCfg.action === "invertBuy" && (action === "CALL" || action === "BUY")) action = invertAction(action);
            if (optCfg.action === "invertSell" && (action === "PUT" || action === "SELL")) action = invertAction(action);
          } else {
            // Fallback to global action for non-configured assets
            const globalAction = filter.action || "allow";
            if (globalAction === "ignore") return null;
            if (filter.direction && filter.direction !== "all") {
              if (!matchesDirection(action, filter.direction)) return null;
            }
          }
        }
        // --- Formato antigo: assetConfigs (backward compat) ---
        else if (filter.assetConfigs && filter.assetConfigs.length > 0) {
          const custom = filter.assetConfigs?.find(ac => ac.asset === val);
          if (custom) {
            if (custom.action === "ignore") return null;
            if (custom.direction && custom.direction !== "all") {
              if (!matchesDirection(action, custom.direction)) return null;
            }
          } else {
            const globalAction = filter.action || "allow";
            if (globalAction === "ignore") return null;
            if (filter.direction && filter.direction !== "all") {
              if (!matchesDirection(action, filter.direction)) return null;
            }
          }
        }
        // --- Sem configs individuais: usa ação global ---
        else {
          const globalAction = filter.action || "allow";
          if (globalAction === "ignore") return null;
          if (filter.direction && filter.direction !== "all") {
            if (!matchesDirection(action, filter.direction)) return null;
          }
        }
        continue; // asset filter is completely processed, skip range logic
      }

      // --- Handle select/multiselect with per-option configs ---
      if (filter.optionConfigs && filter.optionConfigs.length > 0) {
        const valStr = String(val).trim();
        const optCfg = filter.optionConfigs.find(oc => oc.option === val || String(oc.option).trim() === valStr);
        if (optCfg) {
          // Check per-option direction
          if (optCfg.direction && optCfg.direction !== "all") {
            if (!matchesDirection(action, optCfg.direction)) return null;
          }
          // Apply per-option action
          if (optCfg.action === "ignore") return null;
          if (optCfg.action === "invert") action = invertAction(action);
          if (optCfg.action === "invertBuy" && (action === "CALL" || action === "BUY")) {
            action = invertAction(action);
          }
          if (optCfg.action === "invertSell" && (action === "PUT" || action === "SELL")) {
            action = invertAction(action);
          }
          // "allow" = pass through — matched this optionConfig
          continue;
        }
        // No config for this value: if there are explicitly allowed or inverted options, block unconfigured ones
        const hasAllowConfigs = filter.optionConfigs.some(oc => oc.action === "allow" || oc.action === "invert" || oc.action === "invertBuy" || oc.action === "invertSell" || !oc.action);
        if (hasAllowConfigs) {
          return null;
        }
        continue;
      }

      // --- Handle select type filter (single value match, legacy) ---
      if (filter.value !== undefined && filter.value !== null) {
        const matches = val === filter.value || String(val).trim() === String(filter.value).trim();
        const act = filter.action || "allow";
        if (act === "ignore" && matches) return null;
        if (act === "invert" && matches) action = invertAction(action);
        if (act === "allow" && !matches) return null;
        continue; // processed, skip range logic
      }

      // --- Handle multiselect type filter (values array match) ---
      if (filter.values && filter.values.length > 0) {
        const valStr = String(val).trim();
        const matches = filter.values.some(v => v === val || String(v).trim() === valStr);
        const act = filter.action || "allow";
        if (act === "ignore" && matches) return null;
        if (act === "invert" && matches) action = invertAction(action);
        if (act === "allow" && !matches) return null;
        continue; // processed, skip range logic
      }

      const ranges = filter.ranges || [];
      if (ranges.length === 0) continue;

      // If there are ANY "allow" ranges, we must match at least one of them to proceed
      const hasAllowRanges = ranges.some(r => (r.action as string) === "allow");
      let matchedAllow = !hasAllowRanges; // If no allow ranges, we are "allowed" by default

      for (const range of ranges) {
        if (range.direction && range.direction !== "all") {
          if (!matchesDirection(action, range.direction)) {
            continue; // Skip this range's logic since it doesn't apply to this direction
          }
        }

        const isInside = val >= range.min && val <= range.max;
        if (isInside) {
          if (range.action === "ignore") return null;
          if (range.action === "invert") {
            action = invertAction(action);
          }
          if ((range.action as string) === "allow") {
            matchedAllow = true;
          }
        }
      }

      if (!matchedAllow) return null;
    }
  }

  if (globalInvert) {
    action = invertAction(action);
  }

  return { ...rawResult, action };
}

/** Lookup map: filter key → display label (português) */
export const BUILTIN_FILTER_LABELS: Record<string, string> = {
  _asset: "Ativos Específicos",
  _rsi: "Faixa RSI",
  _adx: "Faixa ADX",
  _macd: "MACD Histograma",
  _maTrend: "Tendência de Médias",
  _pattern: "Padrão de Velas",
  _expiryCandles: "Expiração (candles)",
  _sar: "Parabolic SAR (Tendência)",
  _williams: "Williams %R Bands",
  _atr: "Volatilidade ATR",
  _fibLevel: "Proximidade Fibonacci",
  _pivotLevel: "Proximidade Níveis Pivot",
  _marketMoment: "Momento de Mercado",
  _marketStructure: "Estrutura de Mercado",
  _candleSize: "Tamanho de Candle",
  _preEntryMomentum: "Força Pré-Entrada",
  _bollingerState: "Estado de Bollinger",
  _indicatorCrossover: "Cruzamento de Médias",
  _pavioClass: "Classificação do Pavio",
};

/** Lookup map: filter key → type for type-aware rendering */
export const BUILTIN_FILTER_TYPES: Record<string, string> = {
  _asset: "multiselect",
  _rsi: "range",
  _adx: "range",
  _macd: "select",
  _maTrend: "select",
  _pattern: "multiselect",
  _expiryCandles: "range",
  _sar: "select",
  _williams: "select",
  _atr: "select",
  _fibLevel: "multiselect",
  _pivotLevel: "multiselect",
  _marketMoment: "multiselect",
  _marketStructure: "select",
  _candleSize: "select",
  _preEntryMomentum: "select",
  _bollingerState: "select",
  _indicatorCrossover: "select",
  _pavioClass: "select",
};

function invertAction(action: "CALL" | "PUT" | "BUY" | "SELL"): "CALL" | "PUT" | "BUY" | "SELL" {
  if (action === "CALL") return "PUT";
  if (action === "PUT") return "CALL";
  if (action === "BUY") return "SELL";
  if (action === "SELL") return "BUY";
  return action;
}
