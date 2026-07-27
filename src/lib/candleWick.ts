/**
 * Candle wick classification relative to trade direction.
 *
 * For each trade, the last closed candle before entry is classified based on
 * its wick structure (pavio = wick) to determine whether the candle's
 * rejection/confirmation aligns with the trade direction or goes against it.
 *
 * Strength tiers: normal → "forte" → "muito forte" based on the dominant
 * wick's share of the total candle range.
 *
 * Doji candles (body < 10% of total range) get a separate "doji" prefix.
 */

export type WickClass = {
  label: string;
  type: "pavio" | "doji";
  direction: "call" | "put" | "contra";
  strength: "" | "forte" | "muito forte";
};

const DOJI_BODY_RATIO = 0.1; // body must be <10% of range to be doji
const STRONG_RATIO = 0.3; // dominant wick >30% of range → "forte"
const VERY_STRONG_RATIO = 0.5; // dominant wick >50% of range → "muito forte"

/**
 * Classify a single candle's wick relative to a trade direction.
 * Returns a human-readable Portuguese label.
 */
export function classifyCandleWick(
  candle: { o: number; h: number; l: number; c: number } | null | undefined,
  tradeType: "CALL" | "PUT" | "BUY" | "SELL" | undefined,
): string {
  if (!candle || !tradeType) return "N/A";

  const { o, h, l, c } = candle;
  const body = Math.abs(c - o);
  const upperWick = h - Math.max(o, c);
  const lowerWick = Math.min(o, c) - l;
  const totalRange = h - l;

  if (totalRange === 0) return "N/A";

  const bodyRatio = body / totalRange;
  const isDoji = bodyRatio < DOJI_BODY_RATIO;

  const isBuy = tradeType === "CALL" || tradeType === "BUY";

  // wickDiff > 0 = lower wick bigger (buying pressure / support rejection)
  // wickDiff < 0 = upper wick bigger (selling pressure / resistance rejection)
  const wickDiff = lowerWick - upperWick;

  // For CALL/BUY:  lower > upper → directional (call), upper > lower → contra
  // For PUT/SELL: upper > lower → directional (put),  lower > upper → contra
  let direction: "call" | "put" | "contra";
  if (wickDiff > 0) {
    // Lower wick is bigger → buying pressure
    direction = isBuy ? "call" : "contra";
  } else if (wickDiff < 0) {
    // Upper wick is bigger → selling pressure
    direction = isBuy ? "contra" : "put";
  } else {
    // Equal wicks → tiebreak in favour of trade direction
    direction = isBuy ? "call" : "put";
  }

  // Strength based on dominant wick ratio
  const dominantWick = Math.max(upperWick, lowerWick);
  const wickRatio = dominantWick / totalRange;

  let strength: "" | "forte" | "muito forte" = "";
  if (wickRatio > VERY_STRONG_RATIO) strength = "muito forte";
  else if (wickRatio > STRONG_RATIO) strength = "forte";

  const prefix = isDoji ? "doji" : "pavio";

  if (strength) {
    return `${prefix} ${strength} ${direction}`;
  }
  return `${prefix} ${direction}`;
}

/**
 * Extract entry candle from a trade's snapshot and classify it.
 * Safe wrapper — returns "N/A" if snapshot or entryCandle is missing.
 */
export function classifyTradeWick(trade: {
  type?: "CALL" | "PUT" | "BUY" | "SELL";
  snapshot?: Record<string, unknown> | null;
}): string {
  const entryCandle = trade.snapshot?.entryCandle as
    | { o: number; h: number; l: number; c: number }
    | undefined
    | null;
  return classifyCandleWick(entryCandle ?? null, trade.type);
}

/** All possible wick classification labels (for ordered stat display). */
export const WICK_CLASSIFICATIONS: string[] = [
  "pavio call",
  "pavio forte call",
  "pavio muito forte call",
  "pavio put",
  "pavio forte put",
  "pavio muito forte put",
  "pavio contra",
  "pavio forte contra",
  "pavio muito forte contra",
  "doji call",
  "doji forte call",
  "doji muito forte call",
  "doji put",
  "doji forte put",
  "doji muito forte put",
  "doji contra",
  "doji forte contra",
  "doji muito forte contra",
];
