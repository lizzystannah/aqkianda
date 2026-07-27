/**
 * Robot Engine — Autonomous trading loop for production robots.
 *
 * Initialised ONCE at app startup (main.tsx) so it keeps running regardless
 * of which page the user is navigating.  Each active robot gets its own
 * Deriv WS connection, candle feed and strategy-execution loop.
 *
 * Key design decisions:
 * - Trades are added ONLY to robot.trades (isolated history).
 *   Users can import robot trades to global stats manually.
 * - Each trade is tagged with a robotId for proper attribution.
 * - Multi-asset: one robot can trade multiple assets via a shared WS connection.
 * - Candle-boundary synchronisation: trades are only triggered at the close
 *   of a candle (within a short window after a new candle opens).
 * - Timeframe and duration are fully configurable per-robot.
 */

import { DerivAPI } from "./derivCore";
import { useStore, checkVdFilter, type RobotConfig, type Trade } from "./store";
import { type Candle, resampleCandles, computeIndicatorValues } from "./market";
import { buildIndicatorSnapshot } from "./indicatorService";
import { applyFilterLogic, type StrategyContext, type StrategyResult } from "@/strategies";
import { loadStrategyById, findStrategySynchronous, preloadStrategy } from "@/lib/strategyLoader";

// ─── Types ───────────────────────────────────────────────────────────────────

type AssetState = {
  candles: Candle[];
  lastTradeTime: number;
  lastSignalCandleTs: number;
  ready: boolean;
};

type RobotRuntime = {
  api: DerivAPI;
  assetStates: Record<string, AssetState>;
  tickInterval: ReturnType<typeof setInterval> | null;
  isProcessing: boolean;
  /** Contract IDs placed by THIS robot — used to filter onOpenContract events. */
  activeContractIds: Set<string>;
  /** Contract IDs placed during warmup — their results update lastTradeResult only, not PnL. */
  warmupContractIds: Set<string>;
};

const runtimes = new Map<string, RobotRuntime>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Get assets list from a robot config (backward compat with old `asset` field) */
function getRobotAssets(robot: RobotConfig): string[] {
  if (robot.assets && robot.assets.length > 0) return robot.assets;
  // Backward compatibility: old robots had `asset: string`
  const legacyAsset = (robot as Record<string, unknown>).asset;
  if (typeof legacyAsset === "string" && legacyAsset) return [legacyAsset];
  return ["R_100"];
}

function tfToMs(tf: string): number {
  const numeric = parseInt(tf);
  if (!isNaN(numeric) && tf.endsWith("m")) return numeric * 60_000;
  if (!isNaN(numeric) && tf.endsWith("h")) return numeric * 3_600_000;
  if (!isNaN(numeric) && tf.endsWith("d")) return numeric * 86_400_000;

  switch (tf) {
    case "1m": return 60_000;
    case "3m": return 180_000;
    case "5m": return 300_000;
    case "15m": return 900_000;
    case "30m": return 1_800_000;
    case "1h": return 3_600_000;
    case "4h": return 14_400_000;
    case "1d": return 86_400_000;
    default: return 60_000;
  }
}

function tfToGranularity(tf: string): number {
  return tfToMs(tf) / 1000;
}

// ─── Strategy discovery (unified: bundled + dynamic) ─────────────────────────────────

/** Sync lookup: bundled + cache. Use after preloadStrategy(). */
function findStrategyModule(strategyId: string) {
  return findStrategySynchronous(strategyId);
}

/** Async lookup with server fallback. Used during robot startup. */
async function findStrategyModuleAsync(strategyId: string) {
  // Try sync first
  const sync = findStrategySynchronous(strategyId);
  if (sync) return sync;

  // Fallback to server API
  console.log(`[RobotEngine] Strategy "${strategyId}" not in bundle — loading from server...`);
  return await loadStrategyById(strategyId);
}

// ─── VDV pattern helper ───────────────────────────────────────────────────────

function handleVdv(robot: RobotConfig, result: "WIN" | "LOSS"): Partial<RobotConfig> {
  let vdvPaused = robot.vdvPaused;
  let vdvWinsCount = robot.vdvWinsCount;

  if (vdvPaused) {
    if (result === "WIN") {
      vdvWinsCount += 1;
      if (vdvWinsCount >= 2) {
        vdvPaused = false;
        vdvWinsCount = 0;
      }
    } else {
      vdvWinsCount = 0;
    }
  } else {
    const recentResults = (robot.trades || []).slice(0, 4).map((t) => t.result);
    if (
      recentResults[0] === "LOSS" && recentResults[1] === "WIN" &&
      recentResults[2] === "LOSS" && recentResults[3] === "WIN"
    ) {
      vdvPaused = true;
      vdvWinsCount = 0;
    }
  }

  return { vdvPaused, vdvWinsCount };
}

// ─── Stake compounding helper ──────────────────────────────────────────────────

/**
 * Compute the next stake based on staking mode and trade result.
 * - fixed:   always robot.stake
 * - soros:   WIN → compound (current + profit); LOSS → reset to robot.stake
 * - reinvest: WIN → double (current * 2);     LOSS → reset to robot.stake
 * Cap at sorosMaxStake if set (> 0).
 */
function computeNextStake(
  robot: RobotConfig,
  runtime: RobotRuntime,
  result: "WIN" | "LOSS",
  profit: number
): number {
  const base = robot.stake;
  const cap = robot.sorosMaxStake > 0 ? robot.sorosMaxStake : Infinity;

  if (robot.management?.mode === "soros") {
    if (result === "WIN") {
      return Math.min(robot.currentStake + Math.abs(profit), cap);
    }
    return base; // reset on loss
  }

  if (robot.management?.mode === "reinvest") {
    if (result === "WIN") {
      return Math.min(robot.currentStake + Math.abs(profit), cap);
    }
    return base; // reset on loss
  }

  return base; // fixed mode
}

/**
 * Determine whether warmup mode should be active after a trade result.
 * warmupActive = true when entry condition is enabled but NOT yet met.
 */
function computeWarmupActive(robot: RobotConfig, lastResult: "WIN" | "LOSS"): boolean {
  // Se pausado por VD, warmup ativo independentemente do lastResult
  if (robot.managementState?.isPausedByVD) return true;
  // Depois de vitória, continua sempre operando real
  if (lastResult === "WIN") return false;
  // Depois de derrota, só faz sombra se entryAfterWin estiver ativo (filtro verde)
  const entryAfterWin = robot.management?.active ? robot.management.entryAfterWin : (robot as any).entryAfterWin;
  if (entryAfterWin) return true;
  return false;
}

// ─── Sequence trigger logic ───────────────────────────────────────────────────────────────

/**
 * Process an active sequence for a given asset.
 * Called BEFORE the strategy onTick — sequence has priority.
 * Returns true if the sequence placed a trade (and thus onTick should be skipped).
 */
function processSequenceForAsset(
  robot: RobotConfig,
  runtime: RobotRuntime,
  assetState: AssetState,
  asset: string,
  intervalMs: number,
  closedCandles: Candle[],
  // Fix F: pass current warmup state so sequence #2..N respects entryAfterWin/entryAfterLoss/VD
  shouldWarmup: boolean
): boolean {
  const seq = robot.sequenceState?.[asset];
  if (!seq?.active) return false;

  const store = useStore.getState();
  const ultimoCandle = closedCandles[closedCandles.length - 1];
  // Fix C: enforce 1-candle gap (same as backtest) so we don't fire two sequence entries in the same candle
  const sameCandle = (seq as any).ultimoEntryCandleTs !== undefined && (seq as any).ultimoEntryCandleTs === ultimoCandle?.t;
  const corActual = ultimoCandle.c > ultimoCandle.o ? "verde" : "vermelha";
  const pararPorCor = corActual !== seq.corEsperada;
  const pararPorMax = seq.totalEntradas >= seq.maxEntradas;

  if (pararPorCor || pararPorMax) {
    store.updateRobot(robot.id, {
      sequenceState: {
        ...(robot.sequenceState || {}),
        [asset]: { ...seq, active: false }
      }
    });
    console.log(`[RobotEngine] Sequence stopped for ${robot.name}@${asset}: ${pararPorCor ? "wrong candle color" : "max entries"}`);
    return false; // Don't block onTick
  }

  if (sameCandle) {
    // Fix C: wait for next candle to fire the next sequence entry
    console.log(`[RobotEngine] Sequence waiting for next candle for ${robot.name}@${asset} (current totalEntradas=${seq.totalEntradas})`);
    return true; // Block onTick this tick
  }

  // F3.1: skip puro se startLevel > 1 e totalEntradas < startLevel, ou onlyReal e totalEntradas !== startLevel
  // A sequência avança (totalEntradas + ultimoEntryCandleTs) mas a trade NÃO é aberta.
  // A gestão fica intacta — a próxima trade que REALMENTE for executada respeita-a normalmente.
  seq.totalEntradas++;
  const startLevel = robot.sequenceConfig?.startLevel ?? 1;
  const onlyReal = robot.sequenceConfig?.onlyReal ?? false;
  const isSkipped = seq.totalEntradas < startLevel
    || (onlyReal && seq.totalEntradas !== startLevel);

  if (isSkipped) {
    // Mark as traded to prevent duplicate evaluation on the same candle
    assetState.lastTradeTime = Date.now();
    assetState.lastSignalCandleTs = ultimoCandle.t ?? Date.now();
    // Persist the new totalEntradas + candle ts
    store.updateRobot(robot.id, {
      sequenceState: {
        ...(robot.sequenceState || {}),
        [asset]: { ...seq, totalEntradas: seq.totalEntradas, ultimoEntryCandleTs: ultimoCandle?.t }
      }
    });
    console.log(`[RobotEngine] Sequence #${seq.totalEntradas} SKIPPED for ${robot.name}@${asset} (startLevel=${startLevel}, onlyReal=${onlyReal})`);
    return true; // Block onTick this candle
  }

  // Open next trade in sequence (gestão aplica-se normalmente aqui)
  // F3.1: sequenceInvert inverte CALL↔PUT nas entradas #2..N (trigger mantém acção original)
  const baseAction = seq.action;
  const effectiveAction = (robot.sequenceConfig?.sequenceInvert && seq.totalEntradas >= 2)
    ? (baseAction === "CALL" ? "PUT" : "CALL")
    : baseAction;

  const sequenceResult: StrategyResult = {
    action: effectiveAction,
    stake: seq.stake,
    customStats: {
      setupTipo: `Sequência #${seq.totalEntradas} (${effectiveAction})`,
    },
  };

  // Mark as traded to prevent duplicates
  assetState.lastTradeTime = Date.now();
  assetState.lastSignalCandleTs = ultimoCandle.t ?? Date.now();

  // Update sequence state — Fix C: record candle ts of this sequence entry to enforce 1-candle gap
  store.updateRobot(robot.id, {
    sequenceState: {
      ...(robot.sequenceState || {}),
      [asset]: { ...seq, totalEntradas: seq.totalEntradas, ultimoEntryCandleTs: ultimoCandle?.t }
    }
  });

  // Place the order (gestão aplica-se normalmente através de shouldWarmup)
  placeRobotOrder(robot, runtime, assetState, asset, sequenceResult, intervalMs, shouldWarmup);
  return true; // Block onTick
}

// ─── Start a single robot ─────────────────────────────────────────────────────────────────

async function startRobot(robot: RobotConfig) {
  if (runtimes.has(robot.id)) return;

  const stratMod = await findStrategyModuleAsync(robot.strategyId);
  if (!stratMod || (stratMod as any).error || typeof stratMod.onTick !== "function") {
    console.error(`[RobotEngine] Strategy "${robot.strategyId}" not found or invalid for robot "${robot.name}".`);
    return;
  }

  const store = useStore.getState();
  const token = robot.mode === "demo" ? store.demoToken : store.realToken;

  // Enforce R assets only (restrict from operating binary options on forex)
  const rawAssets = getRobotAssets(robot).filter(sym => sym?.startsWith("R_"));
  const assets = rawAssets.length > 0 ? rawAssets : ["R_100"];

  const api = new DerivAPI();
  api.accountType = robot.mode === "real" ? "real" : "demo";
  api.currency = robot.mode === "real" ? "USDT" : "USD";
  const assetStates: Record<string, AssetState> = {};
  for (const asset of assets) {
    assetStates[asset] = {
      candles: [],
      lastTradeTime: 0,
      lastSignalCandleTs: 0,
      ready: false,
    };
  }

  const runtime: RobotRuntime = {
    api,
    assetStates,
    tickInterval: null,
    isProcessing: false,
    activeContractIds: new Set(),
    warmupContractIds: new Set(),
  };

  runtimes.set(robot.id, runtime);

  api.connect(token || undefined);

  const intervalMs = tfToMs(robot.timeframe);
  const granularity = 60; // Always use 1m candles as the base for high resolution

  // ── Handle settled contracts → update robot trade history ──
  api.onOpenContract = (contract: Record<string, unknown>) => {
    const contractId = String(contract.contract_id);
    const status = contract.status as string | undefined;
    const profit = (contract.profit as number) ?? 0;

    // Ignore contracts not placed by this robot
    if (!runtime.activeContractIds.has(contractId)) return;

    // Update entry_tick if available
    if (contract.entry_tick && Number(contract.entry_tick) > 0) {
      const store = useStore.getState();
      const currentRobotPre = store.robots.find((r) => r.id === robot.id);
      const robotTrade = currentRobotPre?.trades?.find(t => t.id === contractId);
      if (robotTrade && robotTrade.entry !== Number(contract.entry_tick)) {
        store.updateRobotTrade(robot.id, contractId, {
          entry: Number(contract.entry_tick)
        });
      }
    }

    if (status === "won" || status === "lost" || status === "sold") {
      const tradeResult: "WIN" | "LOSS" = profit > 0 ? "WIN" : "LOSS";
      const isWarmup = runtime.warmupContractIds.has(contractId);

      // Always update the trade record with the real result
      const store = useStore.getState();
      const currentRobotPre = store.robots.find((r) => r.id === robot.id);
      const robotTrade = currentRobotPre?.trades?.find(t => t.id === contractId);

      store.updateRobotTrade(robot.id, contractId, {
        result: tradeResult,
        pnl: profit,  // warmup trades also record real PnL for demo tracking
        exit: (contract.exit_tick ?? contract.sell_price) as number | undefined,
      });

      let nextMetaControl = currentRobotPre?.metaControl;
      if (robotTrade?.metaActive && nextMetaControl) {
        nextMetaControl = { ...nextMetaControl, balance: (nextMetaControl.balance || 0) + profit };
      }

      if (!isWarmup) {
        // Update robot daily/total PnL only for real trades
        const currentRobot = store.robots.find((r) => r.id === robot.id);
        if (currentRobot) {
          // Compute next stake based on stakingMode
          const nextStake = computeNextStake(currentRobot, runtime, tradeResult, profit);

          // Update warmupActive: re-enter warmup if condition broken
          const warmupActive = computeWarmupActive(currentRobot, tradeResult);

          const currentDailyPnl = (currentRobot.managementState?.currentDailyPnl || 0) + profit;
          const totalPnl = (currentRobot.managementState?.totalPnl || 0) + profit;

          // Gestão: se perdeu em modo real → volta para demo
          let lastDemoResult = currentRobot.managementState?.lastDemoResult ?? null;
          if (tradeResult !== "WIN") lastDemoResult = "LOSS";

          // Filtro VD — escaneia últimos 15 trades
          let isPausedByVD = currentRobot.managementState?.isPausedByVD ?? false;
          let waitingForWins = currentRobot.managementState?.waitingForWins ?? 0;
          let vdCycle = currentRobot.managementState?.vdCycle ?? "";
          if (currentRobot.management?.vdFilter) {
            const vdResult = checkVdFilter(currentRobot.trades || []);
            vdCycle = vdResult.vdCycle;
            isPausedByVD = vdResult.isPausedByVD;
            waitingForWins = vdResult.waitingForWins;
            if (vdResult.isPausedByVD) lastDemoResult = null;
          }

          store.updateRobot(robot.id, {
            managementState: {
              ...(currentRobot.managementState || {
                lastDemoResult: null,
                vdCycle: "",
                isPausedByVD: false,
                waitingForWins: 0,
                lastResetDate: new Date().toISOString().split("T")[0],
              }),
              currentDailyPnl,
              totalPnl,
              lastDemoResult,
              vdCycle,
              isPausedByVD,
              waitingForWins,
            },
            warmupActive,
            metaControl: nextMetaControl,
            currentStake: nextStake,
            lastTradeResult: tradeResult,
            ...(currentRobot.vdvFilter ? handleVdv(currentRobot, tradeResult) : {}),
          });
        }
      } else {
        // Warmup trade settled: check if condition now met to exit warmup
        const currentRobot = store.robots.find((r) => r.id === robot.id);
        if (currentRobot) {
          const warmupActive = computeWarmupActive(currentRobot, tradeResult);
          // Atualiza lastDemoResult para que a gestão saiba o resultado do demo
          const lastDemoResult = tradeResult;
          // Filtro VD também no warmup — escaneia trades reais para estado VD
          let isPausedByVD = currentRobot.managementState?.isPausedByVD ?? false;
          let waitingForWins = currentRobot.managementState?.waitingForWins ?? 0;
          let vdCycle = currentRobot.managementState?.vdCycle ?? "";
          if (currentRobot.management?.vdFilter) {
            const vdResult = checkVdFilter(currentRobot.trades || []);
            vdCycle = vdResult.vdCycle;
            isPausedByVD = vdResult.isPausedByVD;
            waitingForWins = vdResult.waitingForWins;
          }
          store.updateRobot(robot.id, {
            warmupActive,
            metaControl: nextMetaControl,
            lastTradeResult: tradeResult,
            managementState: {
              ...(currentRobot.managementState || {
                lastDemoResult: null,
                vdCycle: "",
                isPausedByVD: false,
                waitingForWins: 0,
                lastResetDate: new Date().toISOString().split("T")[0],
              }),
              lastDemoResult,
              vdCycle,
              isPausedByVD,
              waitingForWins,
            },
          });
        }
      }

      runtime.activeContractIds.delete(contractId);
      runtime.warmupContractIds.delete(contractId);
    }
  };

  // ── Initialise candles and tick subscriptions for ALL assets ──
  const init = async () => {
    try {
      if (api.readyPromise) await api.readyPromise;

      for (const asset of assets) {
        try {
          const candlesData = await api.getCandles(asset, 1000, granularity);
          if (candlesData && candlesData.length) {
            assetStates[asset].candles = candlesData.map((c: Record<string, number>) => ({
              t: c.epoch * 1000,
              o: c.open,
              h: c.high,
              l: c.low,
              c: c.close,
            }));
          }
          await api.subscribeTicks(asset);
          assetStates[asset].ready = true;
          console.log(`[RobotEngine] ${robot.name}: subscribed to ${asset}`);
        } catch (e) {
          console.error(`[RobotEngine] ${robot.name}: failed to init asset ${asset}:`, e);
        }
      }

      // Handle ticks for all assets
      api.onTick = (tick) => {
        if (!tick) return;
        const asset = tick.symbol;
        const state = assetStates[asset];
        if (!state) return;

        const cs = state.candles;
        if (cs.length === 0) return;

        const last = { ...cs[cs.length - 1] };
        const now = tick.epoch * 1000;
        const baseIntervalMs = 60000; // Always 1m for internal state

        if (now - last.t >= baseIntervalMs) {
          const newCandle: Candle = {
            t: last.t + baseIntervalMs,
            o: last.c,
            h: tick.quote,
            l: tick.quote,
            c: tick.quote,
          };
          state.candles = [...cs.slice(-9999), newCandle];
        } else {
          last.c = tick.quote;
          last.h = Math.max(last.h, tick.quote);
          last.l = Math.min(last.l, tick.quote);
          state.candles = [...cs.slice(0, -1), last];
        }
      };

      // ── Strategy loop — runs every second, iterates all assets ──
      runtime.tickInterval = setInterval(() => {
        for (const asset of assets) {
          if (!assetStates[asset]?.ready) continue;
          tickRobotForAsset(
            robot.id,
            asset,
            stratMod as { onTick: (ctx: StrategyContext) => StrategyResult },
            intervalMs
          );
        }
      }, 1000);

      console.log(
        `[RobotEngine] Robot "${robot.name}" started | assets: ${assets.join(", ")} | TF: ${robot.timeframe} | durationCandles: ${robot.durationCandles} | mode: ${robot.mode}`
      );
    } catch (e) {
      console.error(`[RobotEngine] Failed to initialise robot "${robot.name}":`, e);
    }
  };

  init();
}

// ─── Stop a single robot ──────────────────────────────────────────────────────

function stopRobot(robotId: string) {
  const runtime = runtimes.get(robotId);
  if (!runtime) return;
  if (runtime.tickInterval) clearInterval(runtime.tickInterval);
  runtime.api.disconnect();
  runtimes.delete(robotId);
  console.log(`[RobotEngine] Robot "${robotId}" stopped.`);
}

// ─── One execution tick for a robot on a specific asset ──────────────────────

function tickRobotForAsset(
  robotId: string,
  asset: string,
  stratMod: { onTick: (ctx: StrategyContext) => StrategyResult },
  intervalMs: number
) {
  const runtime = runtimes.get(robotId);
  if (!runtime || runtime.isProcessing) return;

  const assetState = runtime.assetStates[asset];
  if (!assetState || !assetState.ready) return;

  const store = useStore.getState();
  const robot = store.robots.find((r) => r.id === robotId);
  if (!robot || !robot.active) {
    stopRobot(robotId);
    return;
  }

  // ── Daily reset check ──
  const today = new Date().toISOString().split("T")[0];
  if (robot.managementState?.lastResetDate !== today) {
    store.resetRobotDaily(robotId);
    return;
  }

  // ── Management guards ──
  const mState = robot.managementState;
  
  // 1. Verificações do Robô Principal (Main Goal & Stop Loss)
  if (robot.dailyGoal && (mState?.currentDailyPnl || 0) >= robot.dailyGoal) return;
  if (robot.dailyStopLoss && (mState?.currentDailyPnl || 0) <= -robot.dailyStopLoss) return;

  // 2. Verificações da Gestão (Shadow Trading Goal & Stop Loss)
  if (robot.management?.active) {
    if (robot.management?.dailyGoal && (mState?.currentDailyPnl || 0) >= robot.management.dailyGoal) return;
    if (robot.management?.dailyStopLoss && (mState?.currentDailyPnl || 0) <= -robot.management.dailyStopLoss) return;
  }
  
  // ── Entry-sequence: determine if this trade is a warmup trade ──
  // Instead of skipping, we place warmup trades on DEMO with base stake.
  // They update robot.lastTradeResult but don’t count toward real PnL.
  const lastRes = robot.lastTradeResult;

  // Usa campos da gestão se management.active, senão robot-level
  const cfgEntryAfterWin = robot.management?.active ? robot.management.entryAfterWin : (robot as any).entryAfterWin;
  const cfgEntryAfterLoss = robot.management?.active ? robot.management.entryAfterLoss : (robot as any).entryAfterLoss;

  const isWarmup = robot.warmupActive ||
    (cfgEntryAfterWin && lastRes !== "WIN" && lastRes !== null) ||
    mState?.isPausedByVD === true;

  // On very first trade (lastResult = null) with entry condition set, also warmup
  const isFirstTradeWarmup = lastRes === null &&
    (cfgEntryAfterWin || cfgEntryAfterLoss);

  const shouldWarmup = isWarmup || isFirstTradeWarmup;

  // F3.1: with startLevel > 1, the trigger (#1) is SKIPPED — não é executado, a sequência apenas avança.
  // A gestão NÃO é tocada — a próxima trade executada (#2) respeita a gestão normalmente.
  const startLevelCfg = robot.sequenceConfig?.startLevel ?? 1;
  const onlyRealCfg = robot.sequenceConfig?.onlyReal ?? false;
  const isSkippedTrigger = robot.sequenceConfig?.enabled
    && (startLevelCfg > 1 || onlyRealCfg)
    && !(startLevelCfg === 1 && !onlyRealCfg);
  // Quando o trigger é skipped, a gestão fica intacta — só a trade que realmente executar é que respeita shouldWarmup.
  // Mantemos shouldWarmup como está (gestão normal) — o skip acontece no bloco do trigger abaixo.

  // ── No double-entry on this asset ──
  // Check both store and runtime local tracking for maximum safety
  const hasOpenTrade = (robot.trades || []).some((t) => t.result === "OPEN" && t.asset === asset);
  const isWaitingSettlement = runtime.activeContractIds.size > 0; // Extra safety
  if (hasOpenTrade || isWaitingSettlement) return;

  // ── Multi-Timeframe Resampling ──
  // The robot's internal state (assetState.candles) is ALWAYS 1m for maximum resolution.
  // We resample these 1m candles to the robot's configured timeframe (e.g., 2m) for the strategy.
  const robotTimeframeMinutes = intervalMs / 60000;
  const robotCandles = resampleCandles(assetState.candles, robotTimeframeMinutes);

  // Use only CLOSED candles of the ROBOT'S timeframe for analysis
  const closedCandles = robotCandles.slice(0, -1);
  if (closedCandles.length < 30) return;

  const now = Date.now();
  const lastCandle = robotCandles[robotCandles.length - 1];
  const lastCandleTs = lastCandle?.t ?? now;

  // ── Candle-boundary synchronization ──
  // Check if we just crossed into a new candle of the robot's timeframe
  const msSinceNewCandle = now - lastCandleTs;

  // We want to evaluate the strategy IMMEDIATELY after a new candle opens (the previous one is now closed)
  // We avoid repeating calculation for the SAME candle if we already checked it.
  if (lastCandleTs === assetState.lastSignalCandleTs) return;

  // Robustness: Only trigger if we are within the first 15 seconds of the new candle 
  const isWithinWindow = msSinceNewCandle < 15000;
  if (!isWithinWindow) return;

  // ── Global cooldown (extra safety: no more than one trade per candle on this asset) ──
  // This ensures the "personality" is fixed: one analysis per trigger/candle.
  if (now - assetState.lastTradeTime < intervalMs * 0.8) return;

  // Mark this candle as ATTEMPTED/EVALUATED immediately to prevent race conditions
  assetState.lastSignalCandleTs = lastCandleTs;

  runtime.isProcessing = true;

  try {
    // ── Sequence has priority: check if we need to advance the sequence ──
    if (processSequenceForAsset(robot, runtime, assetState, asset, intervalMs, closedCandles, shouldWarmup)) {
      runtime.isProcessing = false;
      return; // Sequence handled the tick, skip strategy onTick
    }

    const candleTimeRemainingMs = Math.max(0, (lastCandleTs + intervalMs) - now);
    const closedCloses = closedCandles.map((c) => c.c);

    const context: StrategyContext = {
      asset,
      history: closedCandles.map((c) => ({ t: c.t, o: c.o, h: c.h, l: c.l, c: c.c })),
      candles: closedCandles,
      lastPrice: lastCandle?.c ?? 0,
      currentPrice: lastCandle?.c ?? 0,
      balance: store.balance,
      tradingMode: robot.mode,
      isBacktest: false,
      intervalMs,
      candleTimeRemainingMs,
      getMTF: (minutes: number) => {
        // We use the full history to resample
        return resampleCandles(assetState.candles, minutes);
      },
      srLines: store.srLines.filter((l) => l.asset === asset).map((l) => ({
        id: l.id, price: l.price, type: l.kind as "support" | "resistance", asset: l.asset,
      })),
      srZones: store.srZones.filter((z) => z.asset === asset).map((z) => ({
        id: z.id, p1: z.topPrice, p2: z.bottomPrice,
        type: z.kind === "buy_zone" ? "support" : "resistance" as const, asset: z.asset,
      })),
      trendLines: (store.trendLines || []).filter((l) => l.asset === asset).map((l) => ({
        id: l.id, t1: l.t1, p1: l.p1, t2: l.t2, p2: l.p2, type: l.kind as "support" | "resistance", asset: l.asset,
      })),
      hasOpenTrade: hasOpenTrade,
      lastTrade: (() => {
        const finished = (robot.trades || []).filter(t => t.result !== "OPEN" && t.asset === asset);
        return finished.length > 0 ? finished[finished.length - 1] : undefined;
      })(),
      activeFilters: robot.filters,
      updateSR: store.updateSR,
      updateTrendLine: store.updateTrendLine,
      toast: {
        success: (msg) => console.log(`[RobotEngine] ${robot.name}: ${msg}`),
        info: (msg) => console.log(`[RobotEngine] ${robot.name}: ${msg}`),
        error: (msg) => console.error(`[RobotEngine] ${robot.name}: ${msg}`)
      },
      indicators: {
        rsi: (period) => rsi(closedCloses, period),
        sma: (period) => sma(closedCloses, period).map((v) => v ?? 0),
        ema: (period) => ema(closedCloses, period).map((v) => v ?? 0),
        bollinger: (period, multiplier) => bollinger(closedCloses, period, multiplier) as never,
        adx: (period) => adx(closedCandles, period) as never,
        macd: (fast, slow, signal) => macd(closedCloses, fast, slow, signal) as never,
        parabolicSar: (afStep, afMax) => {
          return parabolicSar(closedCandles.map(c => c.h), closedCandles.map(c => c.l), afStep, afMax);
        }
      },
    };

    const rawResult = (stratMod.onTick as (ctx: StrategyContext) => StrategyResult)(context);

    if (rawResult && rawResult.action) {
      // ── Apply per-robot filters ──
      const indicatorValues = computeIndicatorValues(closedCandles, asset, rawResult);

      const effectiveInvert = robot.globalInvert || (robot.metaControl?.active && robot.metaControl?.invert);
      const result = applyFilterLogic(rawResult, robot.filters, indicatorValues, effectiveInvert, robot.strategyDirection);

      if (result && result.action) {
        // ── minConsecutiveCandles: check enough same-color candles before sequence ──
        const minCons = result.sequenceTrigger?.minConsecutiveCandles ?? 0;
        if (minCons > 0) {
          const enough = closedCandles.length >= minCons &&
            closedCandles.slice(-minCons).every(c =>
              (result.action === "CALL" || result.action === "BUY") ? c.c > c.o : c.c < c.o
            );
          if (!enough) {
            console.log(`[RobotEngine] ⏳ Sequence block: not enough consecutive candles for ${robot.name}@${asset} (need ${minCons})`);
            continue;
          }
        }

        // F3.1: skip puro do trigger (#1) se startLevel > 1 ou onlyReal.
        // A sequência é activada mas a trade do trigger não é aberta; a #2 (e seguintes) executam normalmente.
        if (isSkippedTrigger) {
          console.log(`[RobotEngine] Sequence #1 SKIPPED for ${robot.name}@${asset} (startLevel=${startLevelCfg}, onlyReal=${onlyRealCfg})`);
          // Inicializa sequenceState para que a próxima entrada (vela seguinte) seja avaliada como #2
          const store = useStore.getState();
          store.updateRobot(robot.id, {
            sequenceState: {
              ...(robot.sequenceState || {}),
              [asset]: {
                active: true,
                action: result.action as "CALL" | "PUT" | "BUY" | "SELL",
                corEsperada: (result.action === "CALL" || result.action === "BUY") ? "verde" : "vermelha",
                stake: result.stake ?? robot.currentStake ?? robot.stake,
                maxEntradas: result.sequenceTrigger?.maxEntradas ?? (robot.sequenceConfig?.enabled ? Math.min(Math.max(1, robot.sequenceConfig.maxEntradas), 5) : 50),
                totalEntradas: 1,
                ultimoEntryCandleTs: closedCandles[closedCandles.length - 1]?.t,
              }
            }
          });
          assetState.lastSignalCandleTs = closedCandles[closedCandles.length - 1]?.t ?? Date.now();
          continue;
        }

        // Mark as traded BEFORE the async order to prevent duplicated signals due to network latency
        assetState.lastTradeTime = now;
        placeRobotOrder(robot, runtime, assetState, asset, result, intervalMs, shouldWarmup);
      }
    }
  } catch (e) {
    console.error(`[RobotEngine] Error in tick for robot "${robot.name}" on ${asset}:`, e);
  } finally {
    runtime.isProcessing = false;
  }
}

async function placeRobotOrder(
  robot: RobotConfig,
  runtime: RobotRuntime,
  assetState: AssetState,
  asset: string,
  result: StrategyResult,
  intervalMs: number,
  isWarmup: boolean = false
) {
  if (!result.action) return;

  let dir = result.action;
  if (dir === "BUY") dir = "CALL";
  if (dir === "SELL") dir = "PUT";

  // ── Compute effective duration ──
  const { parseDuration } = await import("./utils");
  const expiryCount = parseDuration(robot.durationCandles);
  const intervalMs = tfToMs(robot.timeframe);
  const ts = Date.now();

  const lastCandle = assetState.candles[assetState.candles.length - 1];

  let finalDuration: number;
  let durationS: number;

  if (Math.floor(expiryCount) !== expiryCount) { // Fractional - exactly proportional time
    const durationSeconds = Math.max(15, Math.min(3600, Math.ceil(expiryCount * (intervalMs / 1000))));
    finalDuration = durationSeconds;
    durationS = durationSeconds;
  } else { // Integer - candle aligned
    const currentCandleOpenTs = lastCandle ? lastCandle.t : (Math.floor(ts / intervalMs) * intervalMs);
    let targetEndTs = currentCandleOpenTs + expiryCount * intervalMs;
    // If outstanding duration is too small (< 15 seconds), roll over by adding one candle
    if (targetEndTs - ts < 15000) {
      targetEndTs += intervalMs;
    }
    finalDuration = Math.floor(targetEndTs / 1000); // Unix epoch in seconds
    durationS = Math.max(15, Math.floor((targetEndTs - ts) / 1000)); // actual duration in seconds
  }

  // ── Compute effective stake ──
  // Warmup trades always use base stake; real trades use compounded stake.
  const finalStake = isWarmup
    ? robot.stake
    : (result.stake ?? robot.currentStake);

  // ── Effective mode: warmup always goes to DEMO ──
  const effectiveMode: "demo" | "real" = isWarmup ? "demo" : robot.mode;

  const store = useStore.getState();
  const token = effectiveMode === "demo" ? store.demoToken : store.realToken;
  const entry = assetState.candles[assetState.candles.length - 1]?.c ?? 0;

  let tradeId = `${robot.id}_${crypto.randomUUID()}`;
  let isApiOrder = false;

  // ── Try to place via Deriv API ──
  if (token && runtime.api.ws?.readyState === WebSocket.OPEN) {
    try {
      const buyRes = await runtime.api.buyContract(
        asset, finalStake, dir as "CALL" | "PUT", finalDuration, "s"
      );
      if (buyRes && buyRes.contract_id) {
        tradeId = String(buyRes.contract_id);
        isApiOrder = true;
        // Register in this robot's active contract set for attribution
        runtime.activeContractIds.add(tradeId);
        if (isWarmup) runtime.warmupContractIds.add(tradeId);

        const candleEntry = assetState.candles[assetState.candles.length - 1]?.c ?? entry;
        const actualEntryFromBuy = Number((buyRes as any).entry_spot || (buyRes as any).entry_tick || (buyRes as any).barrier || candleEntry);
        if (!isNaN(actualEntryFromBuy) && actualEntryFromBuy > 0) {
          entry = actualEntryFromBuy;
        }

        console.log(
          `[RobotEngine] ${robot.name}${isWarmup ? " [WARMUP]" : ""}: ${dir} ${asset} $${finalStake} for ${finalDuration}s | contract ${tradeId} | entry: ${entry}`
        );
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[RobotEngine] ${robot.name}: API order failed — ${msg}`);
      return;
    }
  }

  // ── Build trade record ──
  // ── Compute indicator snapshot ──
  const closedCandles = assetState.candles.slice(0, -1);
  const closedCloses = closedCandles.map(c => c.c);
  const snapshotObj = buildIndicatorSnapshot(closedCandles, closedCloses, entry);

  const trade: Trade = {
    id: tradeId,
    asset,
    type: dir as "CALL" | "PUT",
    amount: finalStake,
    entry,
    result: "OPEN",
    ts,
    entryTime: ts,
    durationS,
    mode: effectiveMode,
    strategyId: robot.strategyId,
    timeframe: robot.timeframe,
    customStats: result.customStats,
    snapshot: snapshotObj,
    robotId: robot.id,
    warmup: isWarmup || undefined,
    metaActive: robot.metaControl?.active || undefined,
  };

  // Store ONLY in robot's own history (isolated)
  useStore.getState().addRobotTrade(robot.id, trade);

  // ── Initialize sequence trigger (only if not already active for this asset) ──
  // Fix E: bake effectiveInvert into seq.action so all #2..N entries honour inversion.
  // F2.4: allow sequence to start even with shadow trigger (startLevel>1/onlyReal) — first entry will be warmup.
  const seqJaAtiva = useStore.getState().robots.find(r => r.id === robot.id)?.sequenceState?.[asset]?.active;
  if (!seqJaAtiva && (result.sequenceTrigger || robot.sequenceConfig?.enabled) && !isWarmup) {
    const effectiveInvert = robot.globalInvert || (robot.metaControl?.active && robot.metaControl?.invert);
    const corEsperada = (dir === "CALL" || dir === "BUY") ? "verde" : "vermelha";
    const seqAction = effectiveInvert
      ? (dir === "CALL" || dir === "BUY" ? "PUT" : "CALL")
      : (dir as "CALL" | "PUT" | "BUY" | "SELL");
    const store = useStore.getState();
    store.updateRobot(robot.id, {
      sequenceState: {
        ...(robot.sequenceState || {}),
        [asset]: {
          active: true,
          action: seqAction,
          corEsperada,
          stake: finalStake,
          maxEntradas: result.sequenceTrigger?.maxEntradas ?? (robot.sequenceConfig?.enabled ? Math.min(Math.max(1, robot.sequenceConfig.maxEntradas), 5) : 50),
          totalEntradas: 1,
          // Fix C: record candle ts of trigger to enforce 1-candle gap for #2..N
          ultimoEntryCandleTs: assetState.candles[assetState.candles.length - 1]?.t,
        }
      }
    });
    console.log(`[RobotEngine] Sequence started for ${robot.name}@${asset}: ${dir}${effectiveInvert ? " (inverted→" + seqAction + ")" : ""} | max=${result.sequenceTrigger?.maxEntradas ?? (robot.sequenceConfig?.enabled ? Math.min(Math.max(1, robot.sequenceConfig.maxEntradas), 5) : 50)}`);
  }

  // ── Simulate settlement for non-API orders ──
  if (!isApiOrder) {
    setTimeout(() => {
      const rt = runtimes.get(robot.id);
      if (!rt) return;

      const cs = rt.assetStates[asset]?.candles ?? [];
      const currentStore = useStore.getState();
      const currentRobot = currentStore.robots.find((r) => r.id === robot.id);
      if (!currentRobot) return;

      const robotTrade = (currentRobot.trades || []).find((t) => t.id === tradeId);
      if (!robotTrade || robotTrade.result !== "OPEN") return;

      // Para trades da sequência: resultado pela cor do candle de entrada
      // Para trades normais: comparação de preço (lógica antiga)
      const seqEntryIdx = cs.length >= 2 ? cs.length - 2 : cs.length - 1;
      const entryCandle = cs[seqEntryIdx];
      const isSeqTrade = robot.sequenceState?.[asset]?.active && (currentRobot.trades || []).filter(t => t.id === tradeId).length > 0;
      let win: boolean;
      if (isSeqTrade && entryCandle) {
        win = dir === "CALL" ? entryCandle.c > entryCandle.o : entryCandle.c < entryCandle.o;
      } else {
        const exitPrice = cs[cs.length - 1]?.c ?? entry;
        win = dir === "CALL" ? exitPrice > entry : exitPrice < entry;
      }
      const tradeResult: "WIN" | "LOSS" = win ? "WIN" : "LOSS";
      const rawPnl = win ? finalStake * (currentRobot.payout / 100) : -finalStake;
      const recordedPnl = rawPnl;  // warmup trades also record real PnL for demo tracking

      currentStore.updateRobotTrade(robot.id, tradeId, {
        exit: exitPrice, result: tradeResult, pnl: recordedPnl
      });

      let nextMetaControl = currentRobot.metaControl;
      if (robotTrade.metaActive && nextMetaControl) {
        nextMetaControl = { ...nextMetaControl, balance: (nextMetaControl.balance || 0) + rawPnl };
      }

      if (!isWarmup) {
        // Update stake compounding based on mode
        const nextStake = computeNextStake(currentRobot, rt, tradeResult, rawPnl);

        // Re-evaluate warmupActive for next trade
        const warmupActive = computeWarmupActive(currentRobot, tradeResult);

        const currentDailyPnl = (currentRobot.managementState?.currentDailyPnl || 0) + rawPnl;
        const totalPnl = (currentRobot.managementState?.totalPnl || 0) + rawPnl;

        // Gestão: se perdeu em modo real → volta para demo
        let lastDemoResult = currentRobot.managementState?.lastDemoResult ?? null;
        if (tradeResult !== "WIN") lastDemoResult = "LOSS";

        // Filtro VD — escaneia últimos 15 trades
        let isPausedByVD = currentRobot.managementState?.isPausedByVD ?? false;
        let waitingForWins = currentRobot.managementState?.waitingForWins ?? 0;
        let vdCycle = currentRobot.managementState?.vdCycle ?? "";
        if (currentRobot.management?.vdFilter) {
          const vdResult = checkVdFilter(currentRobot.trades || []);
          vdCycle = vdResult.vdCycle;
          isPausedByVD = vdResult.isPausedByVD;
          waitingForWins = vdResult.waitingForWins;
          if (vdResult.isPausedByVD) lastDemoResult = null;
        }

        currentStore.updateRobot(robot.id, {
          managementState: {
            ...(currentRobot.managementState || {
              lastDemoResult: null,
              vdCycle: "",
              isPausedByVD: false,
              waitingForWins: 0,
              lastResetDate: new Date().toISOString().split("T")[0],
            }),
            currentDailyPnl,
            totalPnl,
            lastDemoResult,
            vdCycle,
            isPausedByVD,
            waitingForWins,
          },
          warmupActive,
          metaControl: nextMetaControl,
          currentStake: nextStake,
          lastTradeResult: tradeResult,
          ...(currentRobot.vdvFilter ? handleVdv(currentRobot, tradeResult) : {}),
        });
      } else {
        // Warmup settled — check if condition now met to exit warmup
        const warmupActive = computeWarmupActive(currentRobot, tradeResult);
        const lastDemoResult = tradeResult;
        // Filtro VD também no warmup
        let isPausedByVD = currentRobot.managementState?.isPausedByVD ?? false;
        let waitingForWins = currentRobot.managementState?.waitingForWins ?? 0;
        let vdCycle = currentRobot.managementState?.vdCycle ?? "";
        if (currentRobot.management?.vdFilter) {
          const vdResult = checkVdFilter(currentRobot.trades || []);
          vdCycle = vdResult.vdCycle;
          isPausedByVD = vdResult.isPausedByVD;
          waitingForWins = vdResult.waitingForWins;
        }
        currentStore.updateRobot(robot.id, {
          warmupActive,
          metaControl: nextMetaControl,
          lastTradeResult: tradeResult,
          managementState: {
            ...(currentRobot.managementState || {
              lastDemoResult: null,
              vdCycle: "",
              isPausedByVD: false,
              waitingForWins: 0,
              lastResetDate: new Date().toISOString().split("T")[0],
            }),
            lastDemoResult,
            vdCycle,
            isPausedByVD,
            waitingForWins,
          },
        });
      }

      console.log(
        `[RobotEngine] ${currentRobot.name}${isWarmup ? " [WARMUP]" : ""}: ${tradeResult} | ${asset} | ${recordedPnl >= 0 ? "+" : ""}$${recordedPnl.toFixed(2)}`
      );
    }, durationS * 1000);
  }
}

// ─── Engine lifecycle ─────────────────────────────────────────────────────────

/** Compute a fingerprint of the parts of a robot config that require an engine restart. */
function robotFingerprint(r: RobotConfig): string {
  return [
    r.active,
    r.mode,
    r.timeframe,
    r.strategyId,
    (r.assets ?? []).slice().sort().join(","),
    r.stakingMode,
    r.stake,
    r.durationCandles,
    r.dailyGoal,
    r.dailyStopLoss,
    r.payout,
    r.sorosMaxStake,
    r.entryAfterWin,
    r.entryAfterLoss,
    r.vdvFilter,
    r.globalInvert,
    JSON.stringify(r.filters || {})
  ].join("|");
}

// Track last-seen fingerprint per robot so we can detect real config changes
const _fingerprints = new Map<string, string>();

/** Reconcile running runtimes with the current store state.
 *  Only starts/stops/restarts based on operational config — ignores trade/PnL changes. */
export function syncRobotEngine() {
  const robots = useStore.getState().robots || [];

  // Start robots that are active but not yet running,
  // OR restart robots whose operational config changed
  for (const robot of robots) {
    const fp = robotFingerprint(robot);
    const prevFp = _fingerprints.get(robot.id);

    if (robot.active) {
      if (!runtimes.has(robot.id)) {
        // Not running — start it
        _fingerprints.set(robot.id, fp);
        startRobot(robot);
      } else if (prevFp !== undefined && prevFp !== fp) {
        // Config changed while running — restart
        console.log(`[RobotEngine] Config changed for "${robot.name}" — restarting.`);
        stopRobot(robot.id);
        _fingerprints.set(robot.id, fp);
        startRobot(robot);
      } else {
        // Already running, no change
        _fingerprints.set(robot.id, fp);
      }
    } else {
      // Robot is inactive — stop if running
      if (runtimes.has(robot.id)) {
        stopRobot(robot.id);
      }
      _fingerprints.delete(robot.id);
    }
  }

  // Stop runtimes for robots that no longer exist
  for (const [id] of runtimes) {
    if (!robots.find((r) => r.id === id)) {
      stopRobot(id);
      _fingerprints.delete(id);
    }
  }
}

let _unsubscribe: (() => void) | null = null;

/**
 * Call once at app startup (main.tsx).
 * Sets up an initial sync and watches the store for robot changes.
 */
export function initRobotEngine() {
  if (_unsubscribe) return;

  // On startup: recover any stale OPEN trades from previous sessions via Deriv API
  const store = useStore.getState();
  const robotsList = store.robots || [];
  for (const robot of robotsList) {
    const staleOpenTrades = (robot.trades || []).filter((t) => t.result === "OPEN");
    if (staleOpenTrades.length > 0) {
      console.log(`[RobotEngine] Triggering Deriv API recovery for ${staleOpenTrades.length} open trade(s) for robot "${robot.name}"`);
      fetch("/api/trades/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ robotId: robot.id }),
      })
        .then(res => res.json())
        .then(() => store.refreshRobots())
        .catch(err => console.warn("[RobotEngine] Failed startup recovery:", err));
    }
  }

  syncRobotEngine();

  _unsubscribe = useStore.subscribe((state, prevState) => {
    // Only react when the number of robots changes OR when any robot's
    // operational fingerprint changes — NOT for trade/PnL updates.
    const prevRobots = prevState.robots || [];
    const nextRobots = state.robots || [];

    if (prevRobots === nextRobots) return;

    // Fast path: length changed (robot added or removed)
    if (prevRobots.length !== nextRobots.length) {
      syncRobotEngine();
      return;
    }

    // Check if any operational field changed
    const operationalChange = nextRobots.some((r) => {
      const prev = prevRobots.find((p) => p.id === r.id);
      if (!prev) return true;
      return robotFingerprint(r) !== robotFingerprint(prev);
    });

    if (operationalChange) {
      syncRobotEngine();
    }
  });

  console.log("[RobotEngine] Initialised — watching for robot changes.");
}

export function destroyRobotEngine() {
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
  for (const [id] of runtimes) {
    stopRobot(id);
  }
  console.log("[RobotEngine] Destroyed.");
}

/** Expose runtime status to the UI. */
export function getRobotRuntime(robotId: string): {
  connected: boolean;
  candleCount: number;
  ready: boolean;
  assetCount: number;
} | null {
  const rt = runtimes.get(robotId);
  if (!rt) return null;
  const totalCandles = Object.values(rt.assetStates).reduce((sum, s) => sum + s.candles.length, 0);
  const allReady = Object.values(rt.assetStates).every((s) => s.ready);
  return {
    connected: rt.api.ws?.readyState === WebSocket.OPEN,
    candleCount: totalCandles,
    ready: allReady,
    assetCount: Object.keys(rt.assetStates).length,
  };
}
