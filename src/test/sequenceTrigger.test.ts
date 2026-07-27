import { describe, it, expect } from "vitest";
import { runFullBacktest } from "@/lib/backtest";
import { type Candle } from "@/lib/market";
import { type StrategyContext, type StrategyResult } from "@/strategies";
import type { RiskConfig, ForexConfig } from "@/lib/store";

function c(o: number, c: number, i: number): Candle {
  return { t: i * 60000, o, h: Math.max(o, c) * 1.001, l: Math.min(o, c) * 0.999, c, v: 1000 };
}

function greens(n: number, startIdx: number, base = 100): Candle[] {
  return Array.from({ length: n }, (_, i) => c(base + i, base + i + 1, startIdx + i));
}

function reds(n: number, startIdx: number, base = 110): Candle[] {
  return Array.from({ length: n }, (_, i) => c(base - i, base - i - 1, startIdx + i));
}

function mixed(n: number, startIdx: number): Candle[] {
  return Array.from({ length: n }, (_, i) =>
    i % 2 === 0 ? c(100, 101, startIdx + i) : c(101, 100, startIdx + i)
  );
}

function withWarmup(extra: Candle[]): Candle[] {
  return [...mixed(22, 0), ...extra];
}

const riskConf: RiskConfig = {
  enabled: false, stopLoss: 0, takeProfit: 0, defaultStake: 1, payout: 80,
  martingale: false, martingaleFactor: 2, stopAfterLosses: 0, stopAfterWins: 0,
  entryAfterWin: true, entryAfterLoss: true,
};

const forexConf: ForexConfig = {
  enabled: false, lotSize: 0.01, leverage: 1, stopLossPips: 20, takeProfitPips: 20, spread: 0,
};

describe("sequenceTrigger minConsecutiveCandles", () => {
  it("should trigger sequence with minConsecutiveCandles=3 when enough greens exist", () => {
    // After 22 warmup: 5 mixed + 5 consecutive greens
    const candles = withWarmup([...mixed(5, 22), ...greens(5, 27)]);

    const strategy = {
      id: "test_seq_ok",
      onTick: (ctx: StrategyContext): StrategyResult | null => {
        if (ctx.history.length < 26) return null;
        return {
          action: "CALL",
          expiryCandles: 1,
          sequenceTrigger: { maxEntradas: 3, stopOnLoss: true, minConsecutiveCandles: 3 },
        };
      },
    };

    const trades = runFullBacktest(candles, "R_100", strategy, 1000, riskConf, forexConf, "binary", 60000);

    // At i=26: history=[0..25], last 3 closed=[23,24,25] = mixed,green,green → NOT enough (candle 23 is mixed) → blocked
    // At i=27: history=[0..26], last 3 closed=[24,25,26] = green,green,green → ENOUGH → sequence starts
    // Sequence starts on candle 27 (8th candle after warmup)
    expect(trades.length).toBeGreaterThanOrEqual(1);
  });

  it("should block sequence when not enough consecutive greens", () => {
    // After 22 warmup: 8 mixed + only 2 greens
    const candles = withWarmup([...mixed(8, 22), ...greens(2, 30)]);

    const strategy = {
      id: "test_seq_block",
      onTick: (ctx: StrategyContext): StrategyResult | null => {
        if (ctx.history.length < 26) return null;
        return {
          action: "CALL",
          expiryCandles: 1,
          sequenceTrigger: { maxEntradas: 3, stopOnLoss: true, minConsecutiveCandles: 3 },
        };
      },
    };

    const trades = runFullBacktest(candles, "R_100", strategy, 1000, riskConf, forexConf, "binary", 60000);
    expect(trades.length).toBe(0);
  });

  it("should trigger sequence when minConsecutiveCandles=0 (default)", () => {
    const candles = withWarmup(mixed(8, 22));

    const strategy = {
      id: "test_seq_default",
      onTick: (ctx: StrategyContext): StrategyResult | null => {
        if (ctx.history.length < 26) return null;
        return {
          action: "CALL",
          expiryCandles: 1,
          sequenceTrigger: { maxEntradas: 3, stopOnLoss: true },
        };
      },
    };

    const trades = runFullBacktest(candles, "R_100", strategy, 1000, riskConf, forexConf, "binary", 60000);
    expect(trades.length).toBeGreaterThanOrEqual(1);
  });

  it("should block PUT sequence when not enough consecutive reds", () => {
    const candles = withWarmup([...mixed(5, 22), ...reds(1, 27)]);

    const strategy = {
      id: "test_seq_put_block",
      onTick: (ctx: StrategyContext): StrategyResult | null => {
        if (ctx.history.length < 26) return null;
        return {
          action: "PUT",
          expiryCandles: 1,
          sequenceTrigger: { maxEntradas: 3, stopOnLoss: true, minConsecutiveCandles: 3 },
        };
      },
    };

    const trades = runFullBacktest(candles, "R_100", strategy, 1000, riskConf, forexConf, "binary", 60000);
    expect(trades.length).toBe(0);
  });
});

describe("backtest off-by-one vs serverEngine", () => {
  it("should match serverEngine behavior (closed candles only, no entry candle peek)", () => {
    // ServerEngine at the moment a signal fires:
    //   closedCandles.slice(-minCons) = LAST N CLOSED candles (that the strategy saw)
    //
    // At i=26 in backtest: strategy sees candles[0..25] (26 closed candles)
    //   ServerEngine: closedCandles.slice(-3) = candles[23,24,25]
    //
    // With the ORIGINAL bug: candles.slice(26-3+1, 26+1) = candles[24,25,26]
    //   → drops candle[23], adds entry candle[26] → WRONG
    //
    // With the FIX: candles.slice(26-3, 26) = candles[23,24,25]
    //   → matches serverEngine → CORRECT
    //
    // Test setup:
    //   candles[23] = GREEN  (present in the fix, dropped by bug)
    //   candles[24] = GREEN
    //   candles[25] = GREEN  (last closed candle → strategy fires CALL)
    //   candles[26] = RED    (entry candle → added by bug, absent in fix)
    //
    // ServerEngine: [23,24,25] = all GREEN → ALLOW (expected correct)
    // Bug:          [24,25,26] = [GREEN,GREEN,RED] → BLOCK (WRONG!)
    // Fix:          [23,24,25] = all GREEN → ALLOW (correct, matches serverEngine)

    const warmup = mixed(22, 0);
    const candles = [
      ...warmup,
      c(100, 101, 22),  // green
      c(101, 102, 23),  // green
      c(102, 103, 24),  // green
      c(103, 104, 25),  // green ← last closed — strategy fires CALL
      c(106, 105, 26),  // RED  ← entry candle (should NOT be checked)
      c(105, 106, 27),  // extra candle for trade to expire
    ];

    const strategy = {
      id: "test_divergence",
      onTick: (ctx: StrategyContext): StrategyResult | null => {
        if (ctx.history.length < 26) return null;
        // ctx.history = candles[0..25]
        // Last 3 closed = [23,24,25] → all green → signal
        return {
          action: "CALL",
          expiryCandles: 1,
          sequenceTrigger: { maxEntradas: 3, stopOnLoss: true, minConsecutiveCandles: 3 },
        };
      },
    };

    const trades = runFullBacktest(candles, "R_100", strategy, 1000, riskConf, forexConf, "binary", 60000);

    // With the fix (matches serverEngine): last 3 CLOSED [23,24,25] are all GREEN → ALLOW → sequence starts
    // With the bug: peeks at entry candle [26]=RED → BLOCK → 0 trades
    expect(trades.length).toBeGreaterThanOrEqual(1);
  });
});
