import type { RobotConfig, Trade } from "@/lib/store";

// ─── Types ──────────────────────────────────────────────────────────────────

export type SimulationFilter = {
  vdFilter: boolean;
  entryAfterWin: boolean;
  entryAfterLoss: boolean;
  /** After a loss, wait N consecutive wins before executing again (0 = disabled) */
  waitForWinsAfterLoss: number;
  /** Daily stop loss (0 = disabled). Skips trades when daily PnL ≤ -dailyStopLoss */
  dailyStopLoss: number;
  /** Daily stop gain (0 = disabled). Skips trades when daily PnL ≥ dailyStopGain */
  dailyStopGain: number;
};

export type SimulatedTrade = {
  /** Index of the original trade in the robot's history */
  index: number;
  asset: string;
  ts: number;
  originalResult: "WIN" | "LOSS";
  /** Whether management skipped this trade (shadow mode) */
  skipped: boolean;
  skipReason?: string;
  /** Stake used if executed */
  stake: number;
  /** PnL if executed */
  pnl: number;
};

export type SimulationModeResult = {
  mode: "fixed" | "soros" | "reinvest";
  label: string;
  finalPnl: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  maxDrawdown: number;
  drawdownPercent: number;
  trades: SimulatedTrade[];
};

export type SimulationOutput = {
  robotId: string;
  robotName: string;
  totalHistoricalTrades: number;
  filter: SimulationFilter;
  fixed: SimulationModeResult;
  soros: SimulationModeResult;
  reinvest: SimulationModeResult;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getPayoutMultiplier(payout: number): number {
  return payout / 100;
}

/** Recalculate PnL based on management stake instead of the original trade amount */
function calculatePnl(
  result: "WIN" | "LOSS",
  stake: number,
  payout: number
): number {
  if (result === "WIN") return Number((stake * getPayoutMultiplier(payout)).toFixed(2));
  return -stake;
}

/**
 * Compute the next stake after a trade result.
 * Mirrors serverEngine.ts computeNextStake().
 */
function computeNextStake(
  mode: "fixed" | "soros" | "reinvest",
  currentStake: number,
  result: "WIN" | "LOSS",
  profit: number,
  baseStake: number,
  maxStake: number
): number {
  const cap = maxStake > 0 ? maxStake : Infinity;

  if (mode === "soros") {
    if (result === "WIN") return Math.min(Number((currentStake + Math.abs(profit)).toFixed(2)), cap);
    return baseStake;
  }
  if (mode === "reinvest") {
    if (result === "WIN") return Math.min(Number((currentStake + Math.abs(profit)).toFixed(2)), cap);
    return baseStake;
  }
  return baseStake;
}

// ─── Simulation ──────────────────────────────────────────────────────────────

function simulateMode(
  mode: "fixed" | "soros" | "reinvest",
  label: string,
  trades: Trade[],
  baseStake: number,
  payout: number,
  maxStake: number,
  filter: SimulationFilter
): SimulationModeResult {
  let currentStake = baseStake;
  let wins = 0;
  let losses = 0;
  let finalPnl = 0;
  let lastResult: "WIN" | "LOSS" | null = null;

  // Drawdown tracking
  let peakCapital = 0;
  let maxDrawdown = 0;

  // VD filter state
  let vdCycle = "";
  let isPausedByVD = false;
  let waitingForWins = 0;

  // Wait-for-wins-after-loss state
  let consecutiveWinsAfterLoss = 0;
  let recoveringAfterLoss = false;

  // Daily stop loss/gain state
  let currentDailyPnl = 0;
  let currentTradingDay = "";

  const simulated: SimulatedTrade[] = [];

  // ── Group trades by minute (trades at same minute share the same stake) ──
  const groups: Trade[][] = [];
  let currentGroup: Trade[] = [];
  for (const trade of trades) {
    if (trade.result !== "WIN" && trade.result !== "LOSS") continue;

    if (currentGroup.length === 0 || Math.abs(trade.ts - currentGroup[0].ts) < 60000) {
      currentGroup.push(trade);
    } else {
      groups.push(currentGroup);
      currentGroup = [trade];
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup);

  if (mode === "fixed") {
    console.log(`[Simulation] ${trades.length} input trades, ${groups.length} groups, mode=${mode}, waitForWins=${filter.waitForWinsAfterLoss}, dailySL=${filter.dailyStopLoss}, dailySG=${filter.dailyStopGain}`);
    if (groups.length > 0) {
      console.log(`[Simulation] first group has ${groups[0].length} trades, first ts=${groups[0][0].ts}, first result=${groups[0][0].result}`);
    }
  }

  // ── Process each batch ──
  let tradeIndex = 0;
  for (const group of groups) {
    // All trades in this batch share the SAME stake
    const batchStake = currentStake;
    let batchHasLoss = false;
    let batchHadExecution = false;
    let batchPnl = 0;

    // Reset daily PnL when day changes
    const dayStr = new Date(group[0].ts).toISOString().slice(0, 10);
    if (dayStr !== currentTradingDay) {
      currentTradingDay = dayStr;
      currentDailyPnl = 0;
    }

    for (const trade of group) {
      // ── Per-trade filter evaluation based on lastResult from PREVIOUS individual trade ──
      let skipped = false;
      let skipReason: string | undefined;

      // Entry-after-win / entry-after-loss filter (per-trade)
      if (filter.entryAfterWin && lastResult !== "WIN") {
        skipped = true;
        skipReason = "Aguardando vitória (entryAfterWin)";
      } else if (filter.entryAfterLoss && lastResult !== "LOSS") {
        skipped = true;
        skipReason = "Aguardando derrota (entryAfterLoss)";
      }

      // Wait-for-wins-after-loss filter (per-trade)
      if (!skipped && filter.waitForWinsAfterLoss > 0 && recoveringAfterLoss) {
        skipped = true;
        skipReason = `Aguardando ${filter.waitForWinsAfterLoss} vitórias após derrota`;
      }

      // VD pause check (per-trade)
      if (!skipped && isPausedByVD) {
        skipped = true;
        skipReason = "Pausado por filtro VD (VDVD)";
      }

      // Daily stop loss check (per-trade)
      if (!skipped && filter.dailyStopLoss > 0 && currentDailyPnl <= -filter.dailyStopLoss) {
        skipped = true;
        skipReason = `Stop loss diário (-$${filter.dailyStopLoss}) atingido`;
      }

      // Daily stop gain check (per-trade)
      if (!skipped && filter.dailyStopGain > 0 && currentDailyPnl >= filter.dailyStopGain) {
        skipped = true;
        skipReason = `Stop gain diário ($${filter.dailyStopGain}) atingido`;
      }

      if (skipped) {
        // Update VD recovery even when skipped
        if (filter.vdFilter && isPausedByVD && trade.result === "WIN") {
          waitingForWins++;
          if (waitingForWins >= 2) {
            isPausedByVD = false;
            waitingForWins = 0;
            vdCycle = "";
          }
        } else if (filter.vdFilter && isPausedByVD) {
          waitingForWins = 0;
        }

        simulated.push({
          index: tradeIndex++,
          asset: trade.asset,
          ts: trade.ts,
          originalResult: trade.result,
          skipped: true,
          skipReason,
          stake: 0,
          pnl: 0,
        });
      } else {
        // Execute trade with batchStake
        batchHadExecution = true;
        const pnl = calculatePnl(trade.result, batchStake, payout);
        finalPnl = Number((finalPnl + pnl).toFixed(2));
        batchPnl += pnl;
        currentDailyPnl = Number((currentDailyPnl + pnl).toFixed(2));

        // Track drawdown
        if (finalPnl > peakCapital) peakCapital = finalPnl;
        const drawdown = peakCapital - finalPnl;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;

        if (trade.result === "WIN") wins++;
        else { losses++; batchHasLoss = true; }

        // VD tracking per trade
        if (filter.vdFilter && !isPausedByVD) {
          const resultChar = trade.result === "WIN" ? "V" : "D";
          vdCycle = (vdCycle + resultChar).slice(-4);
          if (vdCycle === "VDVD") {
            isPausedByVD = true;
            waitingForWins = 0;
          }
        }

        simulated.push({
          index: tradeIndex++,
          asset: trade.asset,
          ts: trade.ts,
          originalResult: trade.result,
          skipped: false,
          stake: batchStake,
          pnl,
        });
      }

      // Update lastResult AFTER each individual trade for sequential filter evaluation
      lastResult = trade.result;
    }

    // ── Update stake state AFTER the batch (only if any trade actually executed) ──
    if (batchHadExecution) {
      const batchResult: "WIN" | "LOSS" = batchHasLoss ? "LOSS" : "WIN";
      const aggregatePnl = Number(batchPnl.toFixed(2));
      currentStake = computeNextStake(mode, currentStake, batchResult, aggregatePnl, baseStake, maxStake);
    }

    // ── Wait-for-wins-after-loss tracking ──
    // Runs even on skipped batches so recovery can eventually complete (otherwise deadlock:
    // recovering skips all trades → nothing executes → recovery never advances).
    if (filter.waitForWinsAfterLoss > 0) {
      if (batchHasLoss) {
        // Actual loss executed — reset recovery
        recoveringAfterLoss = true;
        consecutiveWinsAfterLoss = 0;
      } else if (recoveringAfterLoss) {
        // Batch without loss (possibly all skipped) counts toward recovery
        consecutiveWinsAfterLoss++;
        if (consecutiveWinsAfterLoss >= filter.waitForWinsAfterLoss) {
          recoveringAfterLoss = false;
          consecutiveWinsAfterLoss = 0;
        }
      }
    }
  }

  const total = wins + losses;
  const drawdownPercent = peakCapital > 0 ? Number(((maxDrawdown / peakCapital) * 100).toFixed(1)) : 0;
  return {
    mode,
    label,
    finalPnl,
    totalTrades: total,
    wins,
    losses,
    winRate: total > 0 ? Number(((wins / total) * 100).toFixed(1)) : 0,
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    drawdownPercent,
    trades: simulated,
  };
}

// ─── Main entry point ────────────────────────────────────────────────────────

/**
 * Run management simulation over a robot's historical trades.
 * Takes ALL closed trades and applies management rules to simulate
 * what would have happened if management had been active.
 */
export function runManagementSimulation(
  robot: RobotConfig,
  filter: SimulationFilter
): SimulationOutput {
  const mgmt = robot.management;
  const baseStake = mgmt?.stake || 10;
  const payout = mgmt?.payout || 87;
  const maxStake = mgmt?.sorosMaxStake || 0;

  // Sort trades chronologically (oldest first)
  const closedTrades = (robot.trades || [])
    .filter(t => t.result === "WIN" || t.result === "LOSS")
    .sort((a, b) => a.ts - b.ts);

  const fixed = simulateMode("fixed", "Fixo", closedTrades, baseStake, payout, maxStake, filter);
  const soros = simulateMode("soros", "Soros", closedTrades, baseStake, payout, maxStake, filter);
  const reinvest = simulateMode("reinvest", "Reinvest", closedTrades, baseStake, payout, maxStake, filter);

  return {
    robotId: robot.id,
    robotName: robot.name,
    totalHistoricalTrades: closedTrades.length,
    filter,
    fixed,
    soros,
    reinvest,
  };
}
