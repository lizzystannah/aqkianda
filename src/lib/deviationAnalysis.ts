import type { RobotConfig } from "./store";

// ─── Overall Stats ───────────────────────────────────────────────────────────

export type OverallStats = {
  meanWinRate: number;
  stdDev: number;
  meanDeviation: number;
  medianWinRate: number;
  minWinRate: number;
  maxWinRate: number;
  qualifyingRobots: number;
  totalTradesAnalyzed: number;
};

export type RobotDeviationData = {
  robotId: string;
  robotName: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  zScore: number;
};

// ─── Rolling Deviation Simulation ────────────────────────────────────────────

export type DeviationFilter = {
  entryAfterWin: boolean;
  entryAfterLoss: boolean;
  vdFilter: boolean;
  dailyStopLoss: number;
  dailyStopGain: number;
};

export type DeviationSimConfig = {
  learningSize: number; // first N trades used to calculate base WR and std dev
  windowSize: number;
  threshold: number; // σ threshold (e.g. -2, -1.5, 1, 2)
  thresholdMode: "below" | "above" | "both";
  stake: number;
  payout: number;
  invertOnPositive: boolean; // when rolling WR is above threshold, invert the trade direction
  filters: DeviationFilter;
};

export type DeviationSimTrade = {
  index: number;
  originalIndex: number;
  asset: string;
  type: "CALL" | "PUT";
  result: "WIN" | "LOSS";
  stake: number;
  pnl: number;
  rollingWinRate: number;
  deviation: number; // z-score: (rollingWR - overallWR) / σ
  triggered: boolean;
  skipped?: boolean;
  skipReason?: string;
};

export type DeviationSimResult = {
  robotName: string;
  robotWR: number;
  baseWR: number;          // win rate from the learning phase
  learningSize: number;
  totalHistoricalTrades: number;
  totalSimulatedTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  finalPnl: number;
  maxDrawdown: number;
  drawdownPercent: number;
  trades: DeviationSimTrade[];
};

// ─── Calculate overall stats across all robots ───────────────────────────────

export function calculateOverallStats(robots: RobotConfig[]): OverallStats {
  const MIN_TRADES = 600;

  const qualifying = robots
    .map((r) => ({
      robot: r,
      closed: (r.trades || []).filter(
        (t) => t.result === "WIN" || t.result === "LOSS",
      ),
    }))
    .filter(({ closed }) => closed.length >= MIN_TRADES);

  if (qualifying.length === 0) {
    return {
      meanWinRate: 0,
      stdDev: 0,
      meanDeviation: 0,
      medianWinRate: 0,
      minWinRate: 0,
      maxWinRate: 0,
      qualifyingRobots: 0,
      totalTradesAnalyzed: 0,
    };
  }

  const winRates = qualifying.map(({ closed }) => {
    const wins = closed.filter((t) => t.result === "WIN").length;
    return (wins / closed.length) * 100;
  });

  const totalTrades = qualifying.reduce(
    (sum, { closed }) => sum + closed.length,
    0,
  );
  const totalWins = qualifying.reduce(
    (sum, { closed }) =>
      sum + closed.filter((t) => t.result === "WIN").length,
    0,
  );
  const meanWinRate = (totalWins / totalTrades) * 100;

  // Population standard deviation of win rates
  const squaredDiffs = winRates.map((wr) => Math.pow(wr - meanWinRate, 2));
  const variance =
    squaredDiffs.reduce((a, b) => a + b, 0) / winRates.length;
  const stdDev = Math.sqrt(variance);

  // Mean absolute deviation
  const absDiffs = winRates.map((wr) => Math.abs(wr - meanWinRate));
  const meanDeviation =
    absDiffs.reduce((a, b) => a + b, 0) / winRates.length;

  // Median
  const sorted = [...winRates].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianWinRate =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];

  return {
    meanWinRate: Number(meanWinRate.toFixed(2)),
    stdDev: Number(stdDev.toFixed(2)),
    meanDeviation: Number(meanDeviation.toFixed(2)),
    medianWinRate: Number(medianWinRate.toFixed(2)),
    minWinRate: Number(Math.min(...winRates).toFixed(2)),
    maxWinRate: Number(Math.max(...winRates).toFixed(2)),
    qualifyingRobots: qualifying.length,
    totalTradesAnalyzed: totalTrades,
  };
}

// ─── Per-robot deviation (z-score) ───────────────────────────────────────────

export function calculateRobotDeviations(
  robots: RobotConfig[],
  overall: OverallStats,
): RobotDeviationData[] {
  const result: RobotDeviationData[] = [];

  for (const robot of robots) {
    const closed = (robot.trades || []).filter(
      (t) => t.result === "WIN" || t.result === "LOSS",
    );
    if (closed.length < 600) continue;

    const wins = closed.filter((t) => t.result === "WIN").length;
    const winRate = (wins / closed.length) * 100;

    const zScore =
      overall.stdDev > 0
        ? Number((winRate - overall.meanWinRate) / overall.stdDev)
        : 0;

    result.push({
      robotId: robot.id,
      robotName: robot.name,
      totalTrades: closed.length,
      wins,
      losses: closed.length - wins,
      winRate: Number(winRate.toFixed(2)),
      zScore: Number(zScore.toFixed(2)),
    });
  }

  result.sort((a, b) => b.zScore - a.zScore);
  return result;
}

// ─── Deviation Simulation ────────────────────────────────────────────────────

export function runDeviationSimulation(
  robot: RobotConfig,
  config: DeviationSimConfig,
): DeviationSimResult {
  const closedTrades = (robot.trades || []).filter(
    (t) => t.result === "WIN" || t.result === "LOSS",
  );

  const { learningSize, windowSize, threshold, thresholdMode, stake, payout, filters } = config;
  const payoutMultiplier = payout / 100;

  // ── FASE 1: APRENDIZADO ──────────────────────────────────────────────────
  // Usa as primeiras `learningSize` operações para calcular a taxa base
  const learningTrades = closedTrades.slice(0, learningSize);
  const learningWins = learningTrades.filter((t) => t.result === "WIN").length;
  const baseWR = learningTrades.length > 0 ? learningWins / learningTrades.length : 0;

  // ── FASE 2: SIMULAÇÃO ────────────────────────────────────────────────────
  // Roda apenas sobre as operações APÓS o aprendizado
  const simTrades = closedTrades.slice(learningSize);

  // Normalize threshold
  const effectiveThreshold =
    thresholdMode === "below"
      ? -Math.abs(threshold)
      : thresholdMode === "above"
        ? Math.abs(threshold)
        : threshold;

  const simulatedTrades: DeviationSimTrade[] = [];

  // Management filter state
  let lastTradeResult: "WIN" | "LOSS" | null = null;
  let vdCycle = "";
  let totalPnl = 0;
  let peakPnl = 0;
  let maxDrawdown = 0;
  let wins = 0;
  let losses = 0;
  let dailyPnl = 0;
  let lastResetDate = "";

  for (let i = windowSize; i < simTrades.length; i++) {
    const trade = simTrades[i];

    // Rolling win rate over the last windowSize trades (dentro da fase de simulação)
    const windowTrades = simTrades.slice(i - windowSize, i);
    const windowWins = windowTrades.filter(
      (t) => t.result === "WIN",
    ).length;
    const rollingWR = windowWins / windowSize;

    // Bernoulli std dev — calculado contra a média BASE (não a média total)
    const bernoulliStdDev = Math.sqrt(
      (baseWR * (1 - baseWR)) / windowSize,
    );
    const deviation =
      bernoulliStdDev > 0
        ? (rollingWR - baseWR) / bernoulliStdDev
        : 0;

    // Check if deviation triggers a trade
    let triggered = false;

    if (thresholdMode === "below" && deviation <= effectiveThreshold) {
      triggered = true;
    } else if (
      thresholdMode === "above" &&
      deviation >= effectiveThreshold
    ) {
      triggered = true;
    } else if (
      thresholdMode === "both" &&
      Math.abs(deviation) >= Math.abs(effectiveThreshold)
    ) {
      triggered = true;
    }

    // If triggered, apply management-style filters
    let skipped = false;
    let skipReason = "";

    if (triggered) {
      if (filters.entryAfterWin && lastTradeResult !== "WIN") {
        skipped = true;
        skipReason = "Aguardando vitória";
      } else if (filters.entryAfterLoss && lastTradeResult !== "LOSS") {
        skipped = true;
        skipReason = "Aguardando derrota";
      }

      if (filters.vdFilter && !skipped) {
        if (vdCycle.includes("DVD")) {
          skipped = true;
          skipReason = "Filtro VD";
        }
      }

      if (!skipped) {
        const today = new Date(trade.ts || Date.now())
          .toISOString()
          .split("T")[0];
        if (today !== lastResetDate) {
          dailyPnl = 0;
          lastResetDate = today;
        }
        if (filters.dailyStopLoss > 0 && dailyPnl <= -filters.dailyStopLoss) {
          skipped = true;
          skipReason = "Stop Loss diário";
        }
        if (filters.dailyStopGain > 0 && dailyPnl >= filters.dailyStopGain) {
          skipped = true;
          skipReason = "Stop Gain diário";
        }
      }

      if (!skipped) {
        // Execute the trade
        const tradeResult = trade.result as "WIN" | "LOSS";
        const tradeType = trade.type as "CALL" | "PUT";
        const effectiveType =
          config.invertOnPositive && deviation >= 0
            ? tradeType === "CALL"
              ? "PUT"
              : "CALL"
            : tradeType;

        const pnl =
          tradeResult === "WIN"
            ? stake * payoutMultiplier
            : -stake;

        totalPnl += pnl;
        dailyPnl += pnl;

        if (tradeResult === "WIN") wins++;
        else losses++;

        if (filters.vdFilter) {
          vdCycle += tradeResult === "WIN" ? "V" : "D";
          if (vdCycle.length > 4) vdCycle = vdCycle.slice(-4);
        }

        lastTradeResult = tradeResult;

        if (totalPnl > peakPnl) peakPnl = totalPnl;
        const drawdown = peakPnl - totalPnl;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;

        simulatedTrades.push({
          index: simulatedTrades.length,
          originalIndex: learningSize + i,
          asset: trade.asset || "",
          type: effectiveType,
          result: tradeResult,
          stake,
          pnl,
          rollingWinRate: Number((rollingWR * 100).toFixed(1)),
          deviation: Number(deviation.toFixed(2)),
          triggered: true,
        });
      } else {
        // Triggered but skipped by filter
        simulatedTrades.push({
          index: simulatedTrades.length,
          originalIndex: learningSize + i,
          asset: trade.asset || "",
          type: trade.type as "CALL" | "PUT",
          result: "WIN",
          stake: 0,
          pnl: 0,
          rollingWinRate: Number((rollingWR * 100).toFixed(1)),
          deviation: Number(deviation.toFixed(2)),
          triggered: true,
          skipped: true,
          skipReason,
        });
      }
    }

    // Track last result for management filters even when not triggered
    if (!triggered && trade.result) {
      lastTradeResult = trade.result as "WIN" | "LOSS";
    }
  }

  const totalSimulated = wins + losses;
  const finalWinRate =
    totalSimulated > 0 ? (wins / totalSimulated) * 100 : 0;
  const drawdownPercent =
    peakPnl > 0 ? (maxDrawdown / peakPnl) * 100 : 0;

  return {
    robotName: robot.name,
    robotWR: Number((closedTrades.length > 0
      ? (closedTrades.filter(t => t.result === "WIN").length / closedTrades.length) * 100
      : 0).toFixed(1)),
    baseWR: Number((baseWR * 100).toFixed(1)),
    learningSize,
    totalHistoricalTrades: closedTrades.length,
    totalSimulatedTrades: totalSimulated,
    wins,
    losses,
    winRate: Number(finalWinRate.toFixed(1)),
    finalPnl: Number(totalPnl.toFixed(2)),
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    drawdownPercent: Number(drawdownPercent.toFixed(1)),
    trades: simulatedTrades,
  };
}
