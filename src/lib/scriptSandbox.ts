import type { Candle } from "./market";
import { rsi, sma, ema, bollinger, adx, macd, parabolicSar } from "./market";
import type { ScriptAnnotation, AnnotationMeta, ScriptLogEntry } from "./scriptAnnotations";

let logCounter = 0;

function validateIndex(idx: number, len: number) {
  if (idx < 0 || idx >= len) {
    console.warn(`[ScriptSandbox] candleIndex ${idx} is out of bounds (0-${len - 1})`);
  }
}

function clampIndex(idx: number, len: number) {
  return Math.max(0, Math.min(len - 1, Math.round(idx)));
}

/** Check if candle at i is bullish (close > open) */
function isBullishCandle(candles: Candle[], i: number) {
  const c = candles[i];
  return c ? c.c > c.o : false;
}

/** Check if candle at i is bearish (close < open) */
function isBearishCandle(candles: Candle[], i: number) {
  const c = candles[i];
  return c ? c.c < c.o : false;
}

/** Check if candle at i is a swing high: higher than `strength` neighbours on each side */
function isSwingHighCandle(candles: Candle[], i: number, strength: number) {
  const len = candles.length;
  if (i < strength || i >= len - strength) return false;
  const h = candles[i].h;
  for (let s = 1; s <= strength; s++) {
    if (h <= candles[i - s].h || h <= candles[i + s].h) return false;
  }
  return true;
}

/** Check if candle at i is a swing low: lower than `strength` neighbours on each side */
function isSwingLowCandle(candles: Candle[], i: number, strength: number) {
  const len = candles.length;
  if (i < strength || i >= len - strength) return false;
  const l = candles[i].l;
  for (let s = 1; s <= strength; s++) {
    if (l >= candles[i - s].l || l >= candles[i + s].l) return false;
  }
  return true;
}

export function createScriptAPI(
  candles: Candle[],
  onAnnotation: (a: ScriptAnnotation) => void,
  onLog: (entry: ScriptLogEntry) => void,
  onClear: () => void
) {
  const len = candles.length;

  return {
    candles,

    // ── Low-level geometry ──────────────────────────────

    addLine(candleIndex: number, price: number, label?: string, color?: string, meta?: AnnotationMeta, range?: number) {
      validateIndex(candleIndex, len);
      onAnnotation({
        type: "line", id: crypto.randomUUID(),
        candleIndex: clampIndex(candleIndex, len), price, label, color, meta, range,
      });
    },

    addArrow(candleIndex: number, direction: "up" | "down", label?: string, color?: string, meta?: AnnotationMeta) {
      validateIndex(candleIndex, len);
      onAnnotation({
        type: "arrow", id: crypto.randomUUID(),
        candleIndex: clampIndex(candleIndex, len), direction, label, color, meta,
      });
    },

    addText(candleIndex: number, text: string, position?: "above" | "below", color?: string, meta?: AnnotationMeta) {
      validateIndex(candleIndex, len);
      onAnnotation({
        type: "text", id: crypto.randomUUID(),
        candleIndex: clampIndex(candleIndex, len), text, position: position ?? "above", color, meta,
      });
    },

    addZone(startIdx: number, endIdx: number, priceHigh: number, priceLow: number, label?: string, color?: string, meta?: AnnotationMeta) {
      validateIndex(startIdx, len);
      validateIndex(endIdx, len);
      const s = clampIndex(startIdx, len);
      const e = clampIndex(endIdx, len);
      onAnnotation({
        type: "zone", id: crypto.randomUUID(),
        startIdx: Math.min(s, e), endIdx: Math.max(s, e),
        priceHigh: Math.max(priceHigh, priceLow), priceLow: Math.min(priceHigh, priceLow),
        label, color, meta,
      });
    },

    addTrendLine(idx1: number, price1: number, idx2: number, price2: number, color?: string, meta?: AnnotationMeta) {
      validateIndex(idx1, len);
      validateIndex(idx2, len);
      onAnnotation({
        type: "trendline", id: crypto.randomUUID(),
        idx1: clampIndex(idx1, len), price1,
        idx2: clampIndex(idx2, len), price2,
        color, meta,
      });
    },

    addMarker(candleIndex: number, shape: "circle" | "diamond" | "square", color?: string, meta?: AnnotationMeta) {
      validateIndex(candleIndex, len);
      onAnnotation({
        type: "marker", id: crypto.randomUUID(),
        candleIndex: clampIndex(candleIndex, len), shape, color, meta,
      });
    },

    clear() {
      onClear();
    },

    log(msg: string) {
      onLog({ id: ++logCounter, text: String(msg), ts: Date.now() });
    },

    // ── Candle helpers ──────────────────────────────────

    isBullish(i: number): boolean {
      return isBullishCandle(candles, i);
    },

    isBearish(i: number): boolean {
      return isBearishCandle(candles, i);
    },

    isSwingHigh(i: number, strength: number = 2): boolean {
      return isSwingHighCandle(candles, i, strength);
    },

    isSwingLow(i: number, strength: number = 2): boolean {
      return isSwingLowCandle(candles, i, strength);
    },

    // ── Semantic trading ────────────────────────────────

    addResistance(i: number, label?: string) {
      validateIndex(i, len);
      const c = candles[clampIndex(i, len)];
      if (!c) return;
      const price = c.h;
      onAnnotation({
        type: "line", id: crypto.randomUUID(),
        candleIndex: clampIndex(i, len), price,
        label: label ?? `R ${price.toFixed(2)}`,
        color: "#ef4444",
        meta: { layer: "resistance", reason: "swing_high" },
      });
      onAnnotation({
        type: "marker", id: crypto.randomUUID(),
        candleIndex: clampIndex(i, len), shape: "circle", color: "#ef4444",
        meta: { layer: "resistance" },
      });
    },

    addSupport(i: number, label?: string) {
      validateIndex(i, len);
      const c = candles[clampIndex(i, len)];
      if (!c) return;
      const price = c.l;
      onAnnotation({
        type: "line", id: crypto.randomUUID(),
        candleIndex: clampIndex(i, len), price,
        label: label ?? `S ${price.toFixed(2)}`,
        color: "#22c55e",
        meta: { layer: "support", reason: "swing_low" },
      });
      onAnnotation({
        type: "marker", id: crypto.randomUUID(),
        candleIndex: clampIndex(i, len), shape: "diamond", color: "#22c55e",
        meta: { layer: "support" },
      });
    },

    markEntry(i: number, direction: "buy" | "sell", meta?: AnnotationMeta) {
      validateIndex(i, len);
      const c = candles[clampIndex(i, len)];
      if (!c) return;
      const isBuy = direction === "buy";
      const color = isBuy ? "#22c55e" : "#ef4444";
      const label = isBuy ? "ENTRADA BUY" : "ENTRADA SELL";
      onAnnotation({
        type: "arrow", id: crypto.randomUUID(),
        candleIndex: clampIndex(i, len), direction: isBuy ? "up" : "down",
        label, color,
        meta: { ...meta, layer: "entry" },
      });
    },

    markRejection(i: number, direction: "up" | "down", meta?: AnnotationMeta) {
      validateIndex(i, len);
      const c = candles[clampIndex(i, len)];
      if (!c) return;
      const color = direction === "up" ? "#22c55e" : "#ef4444";
      const label = direction === "up" ? "REJEITOU BAIXA" : "REJEITOU TOPO";
      const price = direction === "up" ? c.l : c.h;
      onAnnotation({
        type: "line", id: crypto.randomUUID(),
        candleIndex: clampIndex(i, len), price, label, color,
        meta: { ...meta, layer: "analysis", reason: "rejection" },
      });
      onAnnotation({
        type: "arrow", id: crypto.randomUUID(),
        candleIndex: clampIndex(i, len), direction,
        color,
        meta: { ...meta, layer: "analysis", reason: "rejection" },
      });
    },

    markBreakout(i: number, direction: "up" | "down", meta?: AnnotationMeta) {
      validateIndex(i, len);
      const c = candles[clampIndex(i, len)];
      if (!c) return;
      const color = direction === "up" ? "#8b5cf6" : "#f59e0b";
      const label = direction === "up" ? "RESISTÊNCIA ROMPIDA ↑" : "SUPORTE ROMPIDO ↓";
      onAnnotation({
        type: "text", id: crypto.randomUUID(),
        candleIndex: clampIndex(i, len), text: label,
        position: direction === "up" ? "below" : "above", color,
        meta: { ...meta, layer: "analysis", reason: "breakout" },
      });
    },

    markZone(startIdx: number, endIdx: number, type: "support" | "resistance", meta?: AnnotationMeta) {
      validateIndex(startIdx, len);
      validateIndex(endIdx, len);
      const s = clampIndex(startIdx, len);
      const e = clampIndex(endIdx, len);
      const candlesInZone = candles.slice(Math.min(s, e), Math.max(s, e) + 1);
      if (candlesInZone.length === 0) return;
      const priceHigh = Math.max(...candlesInZone.map((c) => c.h));
      const priceLow = Math.min(...candlesInZone.map((c) => c.l));
      const color = type === "resistance" ? "rgba(239, 68, 68, 0.2)" : "rgba(34, 197, 94, 0.2)";
      const borderColor = type === "resistance" ? "rgba(239, 68, 68, 0.5)" : "rgba(34, 197, 94, 0.5)";
      onAnnotation({
        type: "zone", id: crypto.randomUUID(),
        startIdx: Math.min(s, e), endIdx: Math.max(s, e),
        priceHigh, priceLow,
        label: type === "resistance" ? "ZONA RESISTÊNCIA" : "ZONA SUPORTE",
        color: borderColor,
        meta: { ...meta, layer: type },
      });
    },

    // ── Visual debug ────────────────────────────────────

    highlight(i: number, color: string = "rgba(255, 255, 0, 0.25)") {
      validateIndex(i, len);
      onAnnotation({
        type: "highlight", id: crypto.randomUUID(),
        candleIndex: clampIndex(i, len), color,
      });
    },

    // ── Zig Zag ─────────────────────────────────────────

    drawZigZag(strength: number = 2, colorHighs: string = "#ef4444", colorLows: string = "#22c55e") {
      const highs: { idx: number; price: number }[] = [];
      const lows: { idx: number; price: number }[] = [];

      for (let i = 0; i < len; i++) {
        if (isSwingHighCandle(candles, i, strength)) {
          highs.push({ idx: i, price: candles[i].h });
        }
        if (isSwingLowCandle(candles, i, strength)) {
          lows.push({ idx: i, price: candles[i].l });
        }
      }

      // Connect consecutive swing highs (resistance zig)
      for (let j = 1; j < highs.length; j++) {
        const prev = highs[j - 1];
        const curr = highs[j];
        onAnnotation({
          type: "trendline", id: crypto.randomUUID(),
          idx1: clampIndex(prev.idx, len), price1: prev.price,
          idx2: clampIndex(curr.idx, len), price2: curr.price,
          color: colorHighs,
          meta: { layer: "resistance", reason: "zigzag" },
        });
      }

      // Connect consecutive swing lows (support zag)
      for (let j = 1; j < lows.length; j++) {
        const prev = lows[j - 1];
        const curr = lows[j];
        onAnnotation({
          type: "trendline", id: crypto.randomUUID(),
          idx1: clampIndex(prev.idx, len), price1: prev.price,
          idx2: clampIndex(curr.idx, len), price2: curr.price,
          color: colorLows,
          meta: { layer: "support", reason: "zigzag" },
        });
      }
    },
  };
}

/**
 * Creates a per-candle scoped API for backtest simulation.
 * `candles` is sliced to `index + 1` so the script cannot see future candles.
 * During warm-up (index < warmUp), markEntry calls are silently blocked.
 */
function createBacktestAPI(
  candles: Candle[],
  index: number,
  warmUp: number,
  onAnnotation: (a: ScriptAnnotation) => void,
  onLog: (entry: ScriptLogEntry) => void,
  onClear: () => void
) {
  const sliced = candles.slice(0, index + 1);
  const base = createScriptAPI(sliced, onAnnotation, onLog, onClear);
  const isWarmUp = index < warmUp;

  const api: Record<string, unknown> = {
    ...base,
    candles: sliced,
    index,
    candle: sliced[index],
    isLast: index === candles.length - 1,
    isPenultimate: index === candles.length - 2,
    warmUp,
    isWarmUp,
  };

  if (isWarmUp) {
    api.markEntry = () => {
      onLog({
        id: ++logCounter,
        text: `⏳ Warm-up (vela ${index}): entrada bloqueada — análise inicial`,
        ts: Date.now(),
      });
    };
  }

  return api;
}

/**
 * Creates indicator wrappers matching ctx.indicators interface from StrategyContext.
 * Uses the provided candle history as the default data source.
 */
function createStrategyIndicators(history: Candle[]) {
  const closes = () => history.map(c => c.c);
  return {
    rsi(period: number, dataSource?: number[]): (number | null)[] {
      return rsi(dataSource ?? closes(), period);
    },
    sma(period: number, dataSource?: number[]): number[] {
      return sma(dataSource ?? closes(), period);
    },
    ema(period: number, dataSource?: number[]): (number | null)[] {
      return ema(dataSource ?? closes(), period);
    },
    bollinger(period: number, multiplier: number, dataSource?: number[]): { upper: number[]; lower: number[] } {
      return bollinger(dataSource ?? closes(), period, multiplier);
    },
    adx(period: number, dataSource?: Candle[]): { adx: number[]; plusDi: number[]; minusDi: number[] } {
      return adx(period, dataSource ?? history);
    },
    macd(fast: number, slow: number, signal: number, dataSource?: number[]): { macd: number[]; signal: number[]; histogram: number[] } {
      return macd(dataSource ?? closes(), fast, slow, signal);
    },
    parabolicSar(afStep?: number, afMax?: number, dataSource?: Candle[]): { sar: number[]; trend: number[]; af: number[] } {
      const src = dataSource ?? history;
      return parabolicSar(
        src.map(c => c.h),
        src.map(c => c.l),
        afStep ?? 0.02,
        afMax ?? 0.2
      );
    },
  };
}

/** Remove markEntry from the full API — entries are ONLY via return { action } in strategy mode */
function omitMarkEntry(api: ReturnType<typeof createScriptAPI>) {
  const { markEntry: _, ...rest } = api;
  return rest;
}

/**
 * Strategy backtest mode — executes a script defining onTick(ctx).
 *
 * The script format MATCHES the Strategy interface from strategies/index.ts:
 * - ctx.history / ctx.candles:  closed candles only
 * - ctx.indicators.rsi(14):     technical indicators
 * - ctx.api.addLine():          visual annotations (NO markEntry)
 * - return { action: "CALL" }:  signal on the NEXT candle (identical to live engine)
 *
 * During warm-up (index < warmUp), entry signals are silently blocked.
 * Annotations from ctx.api are always collected.
 */
export function executeStrategyBacktest(
  scriptText: string,
  candles: Candle[],
  warmUp: number,
  onAnnotation: (a: ScriptAnnotation) => void,
  onLog: (entry: ScriptLogEntry) => void,
  onClear: () => void,
): { success: boolean; error: string | null; entryCount: number } {
  let entryCount = 0;

  try {
    const wrapped =
      scriptText +
      "\n;return typeof onTick !== 'undefined' ? onTick : null;";
    const factory = new Function(wrapped);
    const onTick: ((ctx: Record<string, unknown>) => Record<string, unknown> | null) | null = factory();

    if (typeof onTick !== "function") {
      return { success: false, error: null, entryCount: 0 };
    }

    for (let i = 0; i < candles.length; i++) {
      const history = candles.slice(0, i + 1);
      const lastCandle = history[history.length - 1];
      const isWarmUp = i < warmUp;

      // Per-step annotation collector
      const stepAnn: ScriptAnnotation[] = [];

      const api = omitMarkEntry(
        createScriptAPI(
          history,
          (a) => stepAnn.push(a),
          (log) => onLog(log),
          () => {}
        )
      );

      const indicators = createStrategyIndicators(history);

      const ctx: Record<string, unknown> = {
        history,
        candles: history,
        lastPrice: lastCandle.c,
        currentPrice: lastCandle.c,
        isBacktest: true,
        intervalMs: 60000,
        candleTimeRemainingMs: 0,
        indicators,
        api,
        hasOpenTrade: false,
        index: i,
        candle: lastCandle,
        isLast: i === candles.length - 1,
        warmUp,
        isWarmUp,
      };

      const result = onTick(ctx);

      // Emit step annotations (lines, text, zones — always visual)
      for (const a of stepAnn) onAnnotation(a);

      // Handle entry signal — ONLY via return { action }
      if (result && result.action && !isWarmUp) {
        const nextIdx = i + 1;
        if (nextIdx < candles.length) {
          entryCount++;
          const isBuy = result.action === "CALL" || result.action === "BUY";
          const color = isBuy ? "#22c55e" : "#ef4444";
          const label = isBuy ? "ENTRADA BUY" : "ENTRADA SELL";
          onAnnotation({
            type: "arrow", id: crypto.randomUUID(),
            candleIndex: nextIdx,
            direction: isBuy ? "up" as const : "down" as const,
            label, color,
            meta: { layer: "entry", reason: "strategy_signal" },
          });
          onAnnotation({
            type: "text", id: crypto.randomUUID(),
            candleIndex: nextIdx,
            text: `${String(result.action)}`,
            position: isBuy ? "below" as const : "above" as const,
            color,
            meta: { layer: "entry", reason: "strategy_signal" },
          });
        }
      }

      // Log warm-up signal blocking
      if (result && result.action && isWarmUp) {
        onLog({
          id: ++logCounter,
          text: `⏳ Warm-up (vela ${i}): sinal ${String(result.action)} bloqueado — análise inicial`,
          ts: Date.now(),
        });
      }
    }

    return { success: true, error: null, entryCount };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message, entryCount: 0 };
  }
}

/**
 * Auto-detect execution mode and run the appropriate backtest engine.
 * Priority: onTick (strategy mode) → onCandle (legacy mode).
 */
export function executeBacktest(
  scriptText: string,
  candles: Candle[],
  warmUp: number,
  onAnnotation: (a: ScriptAnnotation) => void,
  onLog: (entry: ScriptLogEntry) => void,
  onClear: () => void
): { success: boolean; error: string | null; entryCount: number } {
  // Priority 1: onTick (strategy mode) — matches the Strategy interface format
  if (/\bfunction\s+onTick\b/.test(scriptText)) {
    const result = executeStrategyBacktest(scriptText, candles, warmUp, onAnnotation, onLog, onClear);
    return { success: result.success, error: result.error, entryCount: result.entryCount };
  }

  // Priority 2: onCandle (legacy mode) — candle-by-candle with api.markEntry
  try {
    // Wrap the user script to extract onCandle
    const wrapped =
      scriptText +
      "\n;return typeof onCandle !== 'undefined' ? onCandle : null;";
    const factory = new Function(wrapped);
    const onCandle: ((api: Record<string, unknown>) => void) | null = factory();

    if (typeof onCandle !== "function") {
      return {
        success: false,
        error:
          'O script precisa definir uma função onCandle(api). Exemplo:\n\nfunction onCandle(api) {\n  if (api.index < 2) return;\n  const prev = api.candles[api.index - 1];\n  // ...\n}',
      };
    }

    for (let i = 0; i < candles.length; i++) {
      const api = createBacktestAPI(candles, i, warmUp, onAnnotation, onLog, onClear);
      onCandle(api as any);
    }

    return { success: true, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Executes a user-provided script in a sandboxed Function context.
 * The script receives an `api` object (the ScriptSandboxAPI).
 *
 * @deprecated Use `executeBacktest` for candle-by-candle simulation.
 */
export function executeScript(
  scriptText: string,
  api: Record<string, unknown>
): { success: boolean; error: string | null } {
  try {
    const fn = new Function("api", scriptText);
    fn(api);
    return { success: true, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
