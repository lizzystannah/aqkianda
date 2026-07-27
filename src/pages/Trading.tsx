import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { AppShell } from "@/components/AppShell";
import { CandlestickChart } from "@/components/CandlestickChart";
import { ASSETS, bollinger, fmtPrice, generateCandles, nextCandle, rsi, sma, ema, adx, macd, getPattern, type Candle, getInternalSymbol, resampleCandles, atr, williamsR, getFibonacciLevel, getPivotPoints, classifyMarketMomentum, detectMarketStructure, parabolicSar, computeIndicatorValues } from "@/lib/market";
import { parseDuration } from "@/lib/utils";

import { runFullBacktest } from "@/lib/backtest";
import { useStore } from "@/lib/store";
import { derivAPI } from "@/lib/deriv";
import { applyFilterLogic } from "@/strategies";
import { loadStrategyById, findStrategySynchronous, preloadStrategy, invalidateStrategyCache } from "@/lib/strategyLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowDown, ArrowUp, Minus, Plus, Trash2, PanelLeftClose, PanelLeftOpen, Bot, Hand, BrainCircuit, Play, Pause, StepForward, StepBack, X, TrendingUp, TrendingDown, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { type Trade } from "@/lib/store";

function tfToMin(tf: string): number {
  const numeric = parseInt(tf);
  if (isNaN(numeric)) return 1;
  if (tf.endsWith("m")) return numeric;
  if (tf.endsWith("h")) return numeric * 60;
  if (tf.endsWith("d")) return numeric * 1440;
  return numeric;
}

type Indicator = "none" | "sma" | "rsi" | "bb";

// Component for rendering a trade row with progress bar
function TradeRow({ t, handleCloseTrade, backtestIdx }: { t: Trade, handleCloseTrade: (id: string, isApi: boolean) => void, backtestIdx: number }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (t.result !== "OPEN") { setProgress(100); return; }
    if (t.marketType === "forex") return;

    if (t.mode === "backtest") {
      if (t.entryCandleIdx != null && t.expiryCandles != null && t.expiryCandles > 0) {
        const elapsed = backtestIdx - t.entryCandleIdx;
        setProgress(Math.min(100, Math.max(0, (elapsed / t.expiryCandles) * 100)));
      }
      return;
    }

    // Live mode
    let aff: number;
    const durationMs = (t.durationS || 1) * 1000;
    const update = () => {
      const elapsed = Date.now() - t.ts;
      const pc = Math.min(100, Math.max(0, (elapsed / durationMs) * 100));
      setProgress(pc);
      if (pc < 100) aff = requestAnimationFrame(update);
    };
    aff = requestAnimationFrame(update);
    return () => cancelAnimationFrame(aff);
  }, [t.result, t.mode, t.marketType, t.entryCandleIdx, t.expiryCandles, t.durationS, t.ts, backtestIdx]);

  return (
    <tr className="border-b border-border/20 hover:bg-[#2a2e39] relative">
      <td className="py-1.5 font-medium cursor-help relative pl-1" title={new Date(t.ts || Date.now()).toLocaleTimeString()}>
        <div className="flex items-center gap-1">
          {t.type === "CALL" || t.type === "BUY" ? <ArrowUp className="h-2.5 w-2.5 text-bull" /> : <ArrowDown className="h-2.5 w-2.5 text-bear" />}
          {t.asset}
        </div>
        {t.result === "OPEN" && (
          <div className="absolute bottom-0 left-0 h-[2px] bg-primary/60 transition-all rounded-r" style={{ width: `${progress}%` }} />
        )}
      </td>
      <td className={`py-1.5 text-center ${(t.result === "OPEN") ? "text-warning" : (t.pnl ?? 0) >= 0 ? "text-bull" : "text-bear"}`}>
        {t.result === "OPEN" ? "--" : `${(t.pnl ?? 0) >= 0 ? "+" : ""}${t.pnl?.toFixed(2)}`}
      </td>
      <td className={`py-1.5 text-center font-bold ${t.result === "WIN" ? "text-bull" : t.result === "LOSS" ? "text-bear" : "text-warning"}`}>
        {t.result === "OPEN" ? (
          <button
            onClick={() => handleCloseTrade(t.id, String(t.id).length < 20)}
            className="inline-flex items-center p-0.5 rounded bg-foreground/10 hover:bg-destructive hover:text-white transition-colors"
            title="Fechar agora"
          >
            <X className="h-3 w-3" />
          </button>
        ) : t.result}
      </td>
    </tr>
  );
}

// ─── Backtest SSE stream reader ──────────────────────────────────────
async function readBacktestSSE<T>(
  res: Response,
  onProgress?: (current: number, total: number, asset: string, trades: number) => void
): Promise<Record<string, T[]>> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = JSON.parse(line.slice(6));
        if (data.type === "progress") {
          onProgress?.(data.current, data.total, data.asset, data.trades);
        } else if (data.type === "done") {
          return data.results || {};
        } else if (data.type === "error") {
          throw new Error(data.message || "Erro no servidor durante backtest.");
        }
      }
    }
  }
  throw new Error("Conexão encerrada sem receber resultado final.");
}

// Fixed starting balance for ALL batch backtests — ensures deterministic, repeatable results
const BACKTEST_START_BALANCE = 10000;

// In-memory cache for backtest results so they persist across page navigations
const backtestResultsCacheRef = { current: new Map<string, { trades: Trade[], timestamp: number }>() };

export default function Trading({ isRobotPerformance = false }: { isRobotPerformance?: boolean } = {}) {
  const [operationsPerBar, setOperationsPerBar] = useState<number>(1);
  const {
    demoToken, realToken,
    tradingMode, marketType, automationMode, setAutomationMode,
    assetsSidebarOpen, toggleAssetsSidebar,
    srLines, srZones, trendLines, clearSR, risk, addTrade, updateTrade, addPnl, balance, setBalance, trades, forex,
    management, setManagement,
    timeframe, activeStrategyId, setActiveStrategyId, customBacktestData, setCustomBacktestData,
    operationalTimeframe, setOperationalTimeframe,
    lastSelectedAsset, setLastSelectedAsset,
    backtestIndices, setBacktestIndex,
    strategyFilters, strategyInvert
  } = useStore();

  const [assetSym, setAssetSym] = useState(lastSelectedAsset || ASSETS[0]?.symbol || "");
  const [indicator, setIndicator] = useState<Indicator>("sma");
  const [stake, setStake] = useState(risk.defaultStake);
  const [duration, setDuration] = useState(60);
  const [lotSize, setLotSize] = useState(forex.lotSize);
  const [slPips, setSlPips] = useState(forex.stopLossPips);
  const [tpPips, setTpPips] = useState(forex.takeProfitPips);

  // Indicators Configuration for Robot Performance
  const [fastMaEnabled, setFastMaEnabled] = useState(true);
  const [fastMaPeriod, setFastMaPeriod] = useState(9);
  const [slowMaEnabled, setSlowMaEnabled] = useState(true);
  const [slowMaPeriod, setSlowMaPeriod] = useState(21);
  const [bbEnabled, setBbEnabled] = useState(false);
  const [bbPeriod, setBbPeriod] = useState(20);
  const [bbStdDev, setBbStdDev] = useState(2);
  const [rsiEnabled, setRsiEnabled] = useState(false);
  const [rsiPeriod, setRsiPeriod] = useState(14);

  const robots = useStore((s) => s.robots);
  const activeRobots = useMemo(() => (robots || []).filter((r) => r.active), [robots]);
  const [activeRobotId, setActiveRobotId] = useState<string | null>(null);
  const [isOperatingLocally, setIsOperatingLocally] = useState(false);

  const parsedActiveRobotsList = useMemo(() => {
    return activeRobots.map((r) => ({
      id: r.id,
      name: r.name,
      strategyId: r.strategyId,
    }));
  }, [activeRobots]);

  // Auto-select first active robot if none is selected
  useEffect(() => {
    if (isRobotPerformance && activeRobots.length > 0) {
      const isStillActive = activeRobots.some((r) => r.id === activeRobotId);
      if (!isStillActive) {
        const firstRobot = activeRobots[0];
        setActiveRobotId(firstRobot.id);
        setActiveStrategyId(firstRobot.strategyId);
      }
    }
  }, [isRobotPerformance, activeRobots, activeRobotId, setActiveStrategyId]);

  useEffect(() => {
    setIsOperatingLocally(false);
  }, [activeRobotId, activeStrategyId, isRobotPerformance]);

  const lastCopiedTradeIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isRobotPerformance || !isOperatingLocally || !activeRobotId || tradingMode === "backtest") return;
    
    const selectedRobotObj = robots.find(r => r.id === activeRobotId);
    if (!selectedRobotObj || !selectedRobotObj.trades || selectedRobotObj.trades.length === 0) return;

    const latestRobotTrade = selectedRobotObj.trades[0];
    if (latestRobotTrade && latestRobotTrade.id !== lastCopiedTradeIdRef.current) {
      lastCopiedTradeIdRef.current = latestRobotTrade.id;
      
      const direction = latestRobotTrade.direction;
      if (direction) {
        toast.info(`🚀 Pegando carona no robô principal: Ordem de ${direction} copiada!`);
        placeOrderRef.current?.(direction as any, true, latestRobotTrade.duration, latestRobotTrade.amount);
      }
    }
  }, [isRobotPerformance, isOperatingLocally, activeRobotId, robots, tradingMode]);

  const lastResultRef = useRef<"WIN" | "LOSS" | null>(null);
  const lastSRCandleProcessedRef = useRef<Record<string, number>>({});
  const allAssetsCandlesRef = useRef<Record<string, Candle[]>>({});

  const trackedSymbolsSet = useMemo(() => {
    const s = new Set<string>();
    srLines.forEach(l => s.add(l.asset));
    srZones.forEach(z => s.add(z.asset));
    s.add(assetSym);
    return Array.from(s);
  }, [srLines, srZones, assetSym]);

  const autoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingOrdersRef = useRef<Record<string, {
    action: "CALL" | "PUT" | "BUY" | "SELL";
    targetPrice: number;
    expiryCandleTs: number;
    stake?: number;
    expiryCandles?: number;
    customStats?: any;
  }>>({});
  const placeOrderRef = useRef<typeof placeOrder | null>(null);
  const timeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});

  useEffect(() => {
    if (assetSym && assetSym !== lastSelectedAsset) {
      setLastSelectedAsset(assetSym);
    }
  }, [assetSym, lastSelectedAsset, setLastSelectedAsset]);

  const asset = ASSETS.find((a) => a.symbol === assetSym) || ASSETS[0];

  // Clean up stale local trades on mount
  useEffect(() => {
    const sTrades = useStore.getState().trades || [];
    sTrades.forEach(t => {
      if (t.result === "OPEN" && t.mode !== "backtest") {
        const isStale = t.durationS ? (Date.now() - t.ts) > (t.durationS * 1000 + 5000) : false;
        if (isStale) {
          updateTrade(t.id, { result: "LOSS", pnl: -t.amount, exit: t.entry });
        }
      }
    });
  }, [updateTrade]);


  const intervalMs = useMemo(() => {
    switch (timeframe) {
      case "1m": return 60_000;
      case "2m": return 120_000;
      case "3m": return 180_000;
      case "5m": return 300_000;
      case "10m": return 600_000;
      case "15m": return 900_000;
      case "30m": return 1_800_000;
      case "1h": return 3_600_000;
      case "4h": return 14_400_000;
      case "1d": return 86_400_000;
      default: return 60_000;
    }
  }, [timeframe]);

  const [liveCandles, setLiveCandles] = useState<Candle[]>(() => generateCandles(asset, 10000, 42, 60000));
  const fallbackMaxBacktest = 10000;
  const backtestData = useMemo(() => {
    // No longer generating mock data for backtest to avoid "simulation" feeling
    return [];
  }, []);

  const currentBacktestData = customBacktestData[assetSym] || backtestData;
  const currentMaxBacktest = currentBacktestData.length;

  const [backtestIdx, setBacktestIdxState] = useState(() => backtestIndices[assetSym] ?? 500);
  const backtestIdxRef = useRef(backtestIdx);
  const lastProcessedOpTimeRef = useRef<Record<string, number>>({});
  useEffect(() => { backtestIdxRef.current = backtestIdx; }, [backtestIdx]);

  const setBacktestIdx = useCallback((val: number | ((prev: number) => number)) => {
    setBacktestIdxState(val);
  }, []);

  // Synchronize index when asset changes
  useEffect(() => {
    const savedIdx = backtestIndices[assetSym] ?? 500;
    setBacktestIdxState(savedIdx);
  }, [assetSym, backtestIndices]);

  useEffect(() => {
    setBacktestIndex(assetSym, backtestIdx);
  }, [assetSym, backtestIdx, setBacktestIndex]);

  const currentModeTrades = useMemo(() => {
    if (isRobotPerformance && !isOperatingLocally) {
      return [];
    }
    let modeTrades = (trades || []).filter(t => t.mode === tradingMode);
    if (tradingMode === "backtest") {
      // Isolate trades to ONLY the active strategy
      modeTrades = modeTrades.filter(t => t.strategyId === (activeStrategyId || "manual"));

      // Filter out trades that haven't occurred yet in the playback
      modeTrades = modeTrades.filter(t => {
        if (t.entryCandleIdx === undefined) return true;
        return t.entryCandleIdx < backtestIdx;
      });

      // For trades that are in progress at the current index, mark them as OPEN
      modeTrades = modeTrades.map(t => {
        if (t.entryCandleIdx === undefined || t.expiryCandles === undefined) return t;
        const exitIdx = t.entryCandleIdx + t.expiryCandles;
        if (backtestIdx < exitIdx) {
          return {
            ...t,
            result: "OPEN",
            pnl: 0,
            exit: undefined
          };
        }
        return t;
      });
    }
    return modeTrades;
  }, [trades, tradingMode, activeStrategyId, backtestIdx, isRobotPerformance, isOperatingLocally]);

  const [backtestPlaying, setBacktestPlaying] = useState(false);
  const [backtestSpeed, setBacktestSpeed] = useState(1);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [isLoadingBacktest, setIsLoadingBacktest] = useState(false);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [allAssetsProgress, setAllAssetsProgress] = useState("");
  const [allAssetsPct, setAllAssetsPct] = useState(0);

  // Deriv connection & Candle init
  const hasHistory = !!customBacktestData[assetSym];

  useEffect(() => {
    let activeToken = undefined;
    if (tradingMode === "demo" && demoToken) activeToken = demoToken;
    else if (tradingMode === "real" && realToken) activeToken = realToken;

    derivAPI.connect(activeToken);

    const loadHistory = async () => {
      setIsLoadingBacktest(true);
      try {
        console.log(`[Trading] Attempting to fetch Node.js cache for ${assetSym}...`);
        // Try to fetch from the server-side cache (10,000 candles)
        const cacheRes = await fetch(`/api/market/history/${assetSym}${tradingMode === "backtest" ? "?isBacktest=true" : ""}`);
        if (cacheRes.ok) {
          const cacheData = await cacheRes.json();
          if (cacheData.success && cacheData.data && cacheData.data.length > 0) {
            console.log(`[Trading] ✅ Received ${cacheData.data.length} candles from Node.js cache (Source: ${cacheData.source})`);
            const parsed: Candle[] = cacheData.data; // Server already returns Candle format
            
            if (tradingMode === "backtest") {
              setCustomBacktestData(assetSym, parsed);
              // Set index to the end so user sees the "exact number of bars in cache"
              setBacktestIdxState(parsed.length);
            } else {
              allAssetsCandlesRef.current[assetSym] = parsed;
              setLiveCandles(parsed);
            }
            setIsLoadingBacktest(false);
            return;
          }
        }

        console.log(`[Trading] Node cache not found, falling back to direct Deriv API for ${assetSym}...`);
        const candlesData = await derivAPI.getCandles(assetSym, 10000, 60);
        if (candlesData && candlesData.length) {
          const parsed: Candle[] = candlesData.map((c: any) => ({
            t: c.epoch * 1000,
            o: c.open, h: c.high, l: c.low, c: c.close
          }));
          
          if (tradingMode === "backtest") {
            setCustomBacktestData(assetSym, parsed);
            setBacktestIdxState(parsed.length);
          } else {
            // In live/demo, update the refs and state
            allAssetsCandlesRef.current[assetSym] = parsed;
            setLiveCandles(parsed);
          }
        }
      } catch (e) {
        console.error("Failed to fetch history", e);
      } finally {
        setIsLoadingBacktest(false);
      }
    };

    if (tradingMode === "backtest") {
      setLiveCandles([]); // Clear live state to avoid overlaps
      setBacktestPlaying(false);
      loadHistory();
    } else {
      // Live/Demo mode: Fetch history when asset changes
      loadHistory();
    }
  }, [assetSym, demoToken, realToken, tradingMode, asset, hasHistory, setCustomBacktestData]);


  // Unified Multi-Asset Tick & Data Handler
  useEffect(() => {
    if (tradingMode === "backtest") return;

    let isSubscribed = true;

    derivAPI.onTick = (tick) => {
      if (!tick) return;
      const symbol = getInternalSymbol(tick.symbol);

      if (allAssetsCandlesRef.current[symbol]) {
        const cs = allAssetsCandlesRef.current[symbol];
        const last = { ...cs[cs.length - 1] };
        const now = tick.epoch * 1000;

        let updated = [...cs];
        const lastTs = last.t;
        
        if (now - lastTs >= 60000) {
          // Fill missing candles if any
          let nextT = lastTs + 60000;
          while (nextT <= now) {
            const lastCandle = updated[updated.length - 1];
            const c: Candle = { 
              t: nextT, 
              o: lastCandle.c, 
              h: nextT + 60000 > now ? Math.max(lastCandle.c, tick.quote) : lastCandle.c, 
              l: nextT + 60000 > now ? Math.min(lastCandle.c, tick.quote) : lastCandle.c, 
              c: nextT + 60000 > now ? tick.quote : lastCandle.c 
            };
            updated.push(c);
            nextT += 60000;
          }
          updated = updated.slice(-10000);
        } else {
          const lastCandle = { ...updated[updated.length - 1] };
          lastCandle.c = tick.quote;
          lastCandle.h = Math.max(lastCandle.h, tick.quote);
          lastCandle.l = Math.min(lastCandle.l, tick.quote);
          updated[updated.length - 1] = lastCandle;
        }
        allAssetsCandlesRef.current[symbol] = updated;

        if (symbol === assetSym) {
          setLiveCandles(updated);
        }
      }
    };

    derivAPI.onBalance = (b) => { setBalance(b); };
    derivAPI.onLatency = (ms) => { 
      setLatencyMs(ms); 
      useStore.getState().setLocalLatency(ms);
    };
    derivAPI.onOpenContract = (contract: { contract_id: number | string, status: string, profit: number, exit_tick?: number, sell_price?: number }) => {
      const id = String(contract.contract_id);
      const st = contract.status;
      const profit = contract.profit;

      if (st === "won" || st === "lost" || st === "sold") {
        updateTrade(id, {
          result: profit > 0 ? "WIN" : "LOSS",
          pnl: profit,
          exit: contract.exit_tick || contract.sell_price
        });
      } else if (st === "open") {
        updateTrade(id, { pnl: profit });
      }
    };

    // Auto-subscribe to tracked symbols
    trackedSymbolsSet.forEach(async (symbol) => {
      if (!allAssetsCandlesRef.current[symbol]) {
        try {
          const candlesData = await derivAPI.getCandles(symbol, 10000, 60);

          if (isSubscribed && candlesData && candlesData.length) {
            const parsed: Candle[] = candlesData.map((c: { epoch: number, open: number, high: number, low: number, close: number }) => ({
              t: c.epoch * 1000,
              o: c.open, h: c.high, l: c.low, c: c.close
            }));
            allAssetsCandlesRef.current[symbol] = parsed;
            if (symbol === assetSym) setLiveCandles(parsed);
          }
        } catch (e) {
          console.error(`Failed background init for ${symbol}`, e);
        }
      } else {
        // Already have data for this symbol, ensure we update the active view if it's the current asset
        if (symbol === assetSym && allAssetsCandlesRef.current[symbol]) {
          setLiveCandles(allAssetsCandlesRef.current[symbol]);
        }
      }
      derivAPI.subscribeTicks(symbol).catch(() => { });
    });

    return () => {
      isSubscribed = false;
      derivAPI.onTick = null;
      derivAPI.onBalance = null;
      derivAPI.onLatency = null;
      derivAPI.onOpenContract = null;
    };
  }, [tradingMode, assetSym, trackedSymbolsSet, setBalance, updateTrade]);

  const [draw, setDraw] = useState<"support" | "resistance" | "buy_zone" | "sell_zone" | "trend_support" | "trend_resistance" | null>(null);

  const handleCloseTrade = async (id: string, isApiOrder: boolean) => {
    const trade = trades.find((t) => t.id === id);
    if (!trade || trade.result !== "OPEN") return;

    if (isApiOrder && derivAPI.token && derivAPI.ws?.readyState === WebSocket.OPEN) {
      try {
        toast.info(`Buscando fechar ordem API Deriv...`);
        await derivAPI.sellContract(Number(id), 0); // sell at market
        toast.success(`Ordem enviada para fechamento!`);
        return;
      } catch (e: unknown) {
        toast.error(`Deriv API Erro: ${(e as Error).message || "Falha ao fechar ordem"}`);
        return;
      }
    }

    // Local manual close
    if (timeoutsRef.current[id]) {
      clearTimeout(timeoutsRef.current[id]);
      delete timeoutsRef.current[id];
    }

    const exitPrice = lastPrice;
    let win = false;
    let pnl = 0;

    if (trade.type === "CALL" || trade.type === "PUT") { // Binary
      if (trade.mode === "backtest" && trade.entryCandleIdx !== undefined && trade.expiryCandles !== undefined) {
        const elapsedCandles = backtestIdx - trade.entryCandleIdx;
        win = trade.type === "CALL" ? exitPrice > trade.entry : exitPrice < trade.entry;
        const proportion = trade.expiryCandles > 0 ? Math.min(elapsedCandles / trade.expiryCandles, 1) : 1;
        if (win) {
          pnl = trade.amount * (risk.payout / 100) * proportion * 0.8;
        } else {
          pnl = -trade.amount * (0.2 + 0.8 * proportion);
        }
        win = pnl > 0;
      } else {
        win = trade.type === "CALL" ? exitPrice > trade.entry : exitPrice < trade.entry;
        const elapsedMs = Date.now() - trade.ts;
        const durationMs = trade.durationS * 1000;
        const proportion = durationMs > 0 ? Math.min(elapsedMs / durationMs, 1) : 1;

        if (win) {
          pnl = trade.amount * (risk.payout / 100) * proportion * 0.8;
        } else {
          pnl = -trade.amount * (0.2 + 0.8 * proportion);
        }
        win = pnl > 0;
      }
    } else { // Forex
      const pipValue = trade.asset.includes("JPY") ? 0.01 : 0.0001;
      const pips = trade.type === "BUY" ? (exitPrice - trade.entry) / pipValue : (trade.entry - exitPrice) / pipValue;
      pnl = pips * (trade.amount * 100000 * pipValue);
      win = pnl > 0;
    }

    lastResultRef.current = win ? "WIN" : "LOSS";
    addPnl(pnl);
    updateTrade(id, { exit: exitPrice, result: win ? "WIN" : "LOSS", pnl });
    toast[win ? "success" : "error"](`${win ? "WIN" : "LOSS"} (Manual) ${trade.asset} · ${pnl > 0 ? "+" : ""}${pnl.toFixed(2)}`);
  };

  // tick
  useEffect(() => {
    if (tradingMode === "backtest") {
      if (!backtestPlaying) return;
      const t = 1000 / backtestSpeed;
      const id = setInterval(() => {
        setBacktestIdx(v => {
          if (v >= currentMaxBacktest) {
            setBacktestPlaying(false);
            return currentMaxBacktest;
          }
          return v + 1;
        });
      }, t);
      return () => clearInterval(id);
    } else {
      // Synthetic fallback if no live data is arriving
      const lastTickLocal = Date.now();
      const id = setInterval(() => {
        // Only run synthetic if Deriv WS is apparently not pushing (simplification)
        if (derivAPI.ws?.readyState === WebSocket.OPEN) return;

        setLiveCandles((cs) => {
          if (!cs || cs.length === 0) return cs;
          const last = cs[cs.length - 1];
          const currentAsset = ASSETS.find((a) => a.symbol === assetSym) || ASSETS[0];
          if (!currentAsset) return cs;
          return [...cs.slice(-9999), nextCandle(last, currentAsset, 60000)];
        });
      }, 1500);
      return () => clearInterval(id);
    }
  }, [assetSym, tradingMode, backtestPlaying, backtestSpeed, currentMaxBacktest, setBacktestIdx]);

  const isLoading = tradingMode === "backtest" && isLoadingBacktest;

  const candles = useMemo(() => {
    if (tradingMode === "backtest") {
      if (isLoading) return [];
      return currentBacktestData.slice(0, backtestIdx);
    }
    return liveCandles;
  }, [tradingMode, currentBacktestData, backtestIdx, liveCandles, isLoading]);

  const displayCandles = useMemo(() => {
    if (isRobotPerformance) {
      if (!activeRobotId) return [];
      const activeBot = Object.values(robots).find(r => r.id === activeRobotId);
      const rTrades = activeBot?.trades ? [...activeBot.trades].sort((a, b) => a.ts - b.ts) : [];
      if (rTrades.length === 0) return [];
      
      const syntheticCandles = [];
      const opBar = operationsPerBar || 1;
      let wins = 0;
      let total = 0;
      let currentWr = 50; // starts at 50% for the open of the very first trade
      let isFirstChunk = true;
      
      for (let i = 0; i < rTrades.length; i += opBar) {
        const chunk = rTrades.slice(i, i + opBar);
        const openWr = currentWr;
        
        let highWr = currentWr;
        let lowWr = currentWr;
        
        let winsInChunk = 0;
        let lossesInChunk = 0;
        let hasClosedTrades = false;
        
        for (const t of chunk) {
          if (t.result && t.result !== "OPEN") {
             total++;
             if (t.result === "WIN") {
                 wins++;
                 winsInChunk++;
             } else if (t.result === "LOSS") {
                 lossesInChunk++;
             }
             const wr = (wins / total) * 100;
             if (wr > highWr) highWr = wr;
             if (wr < lowWr) lowWr = wr;
             currentWr = wr;
             hasClosedTrades = true;
          }
        }
        
        if (!hasClosedTrades) {
            highWr = currentWr;
            lowWr = currentWr;
        }
        
        let closeWr = currentWr;
        
        // If first chunk, ensure high/low includes the artificial openWr (50%)
        if (isFirstChunk) {
            if (openWr > highWr) highWr = openWr;
            if (openWr < lowWr) lowWr = openWr;
            isFirstChunk = false;
        }
        
        // If chunk had no completed trades or perfectly balanced, make a small visual doji or preserve color
        if (openWr === closeWr) {
             if (winsInChunk > lossesInChunk) closeWr += 0.001; // force green
             else if (lossesInChunk > winsInChunk) closeWr -= 0.001; // force red
        }
        
        syntheticCandles.push({
          t: chunk[0].ts,
          o: openWr,
          h: Math.max(openWr, highWr, closeWr),
          l: Math.min(openWr, lowWr, closeWr),
          c: closeWr
        });
      }
      return syntheticCandles;
    }

    const targetTimeframeMin = tfToMin(timeframe);
    return targetTimeframeMin > 1 ? resampleCandles(candles, targetTimeframeMin) : candles;
  }, [candles, timeframe, isRobotPerformance, activeRobotId, robots, operationsPerBar]);

  const latestCandlesRef = useRef(candles);
  latestCandlesRef.current = candles;

  const closes = useMemo(() => displayCandles.map((c) => c.c), [displayCandles]);
  const highs = useMemo(() => displayCandles.map((c) => c.h), [displayCandles]);
  const lows = useMemo(() => displayCandles.map((c) => c.l), [displayCandles]);

  // Reinitialize backtester when strategy changes
  const prevStrategyRef = useRef<string | null>(activeStrategyId);
  useEffect(() => {
    if (tradingMode === "backtest") {
      // Only clear trades if strategy actually changed (not on re-mount)
      if (prevStrategyRef.current !== activeStrategyId) {
        setBacktestIdx(500);
        setBacktestPlaying(false);
        useStore.setState(s => ({
          trades: s.trades.filter(t => t.mode !== "backtest")
        }));
      }
      prevStrategyRef.current = activeStrategyId;
    }
  }, [activeStrategyId, tradingMode, setBacktestIdx, setBacktestPlaying]);

  // NOTE: Full backtest is NO LONGER run automatically.
  // It only runs when the user explicitly clicks "Rodar Todos" or "Rodar Ativo Atual".
  // Results are cached in memory so navigating between pages doesn't re-trigger processing.

  // Helper: find strategy module by ID (sync — bundled + cache only)
  const findStrategyModule = useCallback(() => {
    if (!activeStrategyId) return null;
    return findStrategySynchronous(activeStrategyId);
  }, [activeStrategyId]);

  // Helper: async strategy loading — preloads into cache on strategy change
  useEffect(() => {
    if (activeStrategyId) {
      preloadStrategy(activeStrategyId).then(ok => {
        if (!ok) {
          console.warn(`[Trading] Failed to preload strategy "${activeStrategyId}"`);
        }
      });
    }
  }, [activeStrategyId]);

  // Run backtest on CURRENT asset only (on-demand)
  const runCurrentAssetBacktest = useCallback(async () => {
    if (tradingMode !== "backtest" || !activeStrategyId) {
      toast.error("Selecione uma estratégia e esteja no modo Backtest.");
      return;
    }

    const tf = useStore.getState().timeframe;
    toast.info(`⏳ Executando backtest em ${assetSym} no servidor (TF: ${tf})...`);

    try {
      const currentFilters = useStore.getState().strategyFilters[activeStrategyId!] || undefined;
      const currentInvert = useStore.getState().strategyInvert[activeStrategyId!] || false;
      const currentDirection = useStore.getState().strategyDirection[activeStrategyId!] || "all";

      const res = await fetch("/api/backtest/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activeStrategyId,
          symbols: [assetSym],
          timeframe: tf,
          balance: BACKTEST_START_BALANCE,
          risk,
          forex,
          marketType,
          srLines,
          srZones,
          trendLines,
          activeFilters: currentFilters,
          globalInvert: currentInvert,
          strategyDirection: currentDirection,
          sequenceConfig: activeStrategyId ? useStore.getState().strategySequenceConfig[activeStrategyId] : undefined,
          operationsPerBar: isRobotPerformance ? operationsPerBar : 1
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as any).error || "Erro de execução no servidor.");
      }

      const results = await readBacktestSSE<Trade>(res);
      const resultTrades = results[assetSym] || [];
      resultTrades.forEach((t: any) => { t.timeframe = tf; });

      // Cache the result
      const cacheKey = `${assetSym}_${activeStrategyId}`;
      backtestResultsCacheRef.current.set(cacheKey, { trades: resultTrades, timestamp: Date.now() });

      // Replace ONLY this asset's trades for this strategy
      useStore.setState(s => {
        const otherTrades = s.trades.filter(t => !(t.mode === "backtest" && t.asset === assetSym && t.strategyId === activeStrategyId));
        return { trades: [...otherTrades, ...resultTrades] };
      });

      const wins = resultTrades.filter((t: any) => t.result === "WIN").length;
      const total = resultTrades.length;
      const wr = total > 0 ? ((wins / total) * 100).toFixed(1) : "0";
      toast.success(`✅ ${assetSym}: ${total} trades · WR: ${wr}%`);
    } catch (err: any) {
      console.error("[runCurrentAssetBacktest] Failed:", err);
      toast.error(err.message || "Erro ao rodar backtest no servidor.");
    }
  }, [tradingMode, activeStrategyId, assetSym, marketType, risk, forex, srLines, srZones, trendLines, isRobotPerformance, operationsPerBar]);

  // Automatically run the backtest for the current asset when in Robot Performance mode
  useEffect(() => {
    if (isRobotPerformance && tradingMode === "backtest" && activeStrategyId) {
      const realData = customBacktestData[assetSym];
      if (realData && realData.length > 20) {
        runCurrentAssetBacktest();
      }
    }
  }, [isRobotPerformance, tradingMode, activeStrategyId, assetSym, operationsPerBar, !!customBacktestData[assetSym], runCurrentAssetBacktest]);

  // Bulk load historical candles for all assets from server cache
  const loadAllAssetsHistory = useCallback(async () => {
    setIsProcessingAll(true);
    setAllAssetsProgress("Iniciando sincronização...");
    const symbols = ASSETS.filter(a => marketType === "binary" ? a.type === "synthetic" : true).map(a => a.symbol);
    const bulkData: Record<string, Candle[]> = {};
    let count = 0;

    // Clear previous backtest data to avoid unnecessary accumulation
    try {
      await fetch("/api/market/history/clear", { method: "DELETE" });
    } catch (e) {
      console.error("Failed to clear backtest cache:", e);
    }

    // Parallelize fetches in small chunks to avoid overwhelming the server
    const CHUNK_SIZE = 5;
    for (let i = 0; i < symbols.length; i += CHUNK_SIZE) {
      const chunk = symbols.slice(i, i + CHUNK_SIZE);
      await Promise.all(chunk.map(async (sym) => {
        try {
          const cacheRes = await fetch(`/api/market/history/${sym}?isBacktest=true&forceSync=true`);
          if (cacheRes.ok) {
            const cacheData = await cacheRes.json();
            if (cacheData.success && cacheData.data && cacheData.data.length > 0) {
              bulkData[sym] = cacheData.data;
              allAssetsCandlesRef.current[sym] = cacheData.data;
            }
          }
        } catch (e) {
          console.error(`Error loading ${sym}`, e);
        }
      }));
      count += chunk.length;
      setAllAssetsProgress(`Sincronizando ativos... ${Math.min(count, symbols.length)}/${symbols.length}`);
    }

    useStore.getState().setBulkCustomBacktestData(bulkData);
    setAllAssetsProgress("");
    setAllAssetsPct(0);
    setIsProcessingAll(false);
    toast.success(`✅ Cache sincronizado (${Object.keys(bulkData).length} ativos carregados)`);
  }, []);

  // Run backtest on ALL assets sequentially with SSE progress
  const runAllAssetsBacktest = useCallback(async () => {
    if (tradingMode !== "backtest" || !activeStrategyId) {
      toast.error("Selecione uma estratégia e esteja no modo Backtest.");
      return;
    }

    setIsProcessingAll(true);
    setAllAssetsProgress("Iniciando backtest em lote no servidor...");

    const tf = timeframe;
    const assetsToRun = ASSETS.filter(a => marketType === "binary" ? a.type === "synthetic" : true).map(a => a.symbol);
    const totalAssets = assetsToRun.length;

    try {
      const currentFilters = useStore.getState().strategyFilters[activeStrategyId!] || undefined;
      const currentInvert = useStore.getState().strategyInvert[activeStrategyId!] || false;
      const currentDirection = useStore.getState().strategyDirection[activeStrategyId!] || "all";

      const res = await fetch("/api/backtest/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activeStrategyId,
          symbols: assetsToRun,
          timeframe: tf,
          balance: BACKTEST_START_BALANCE,
          risk,
          forex,
          marketType,
          srLines,
          srZones,
          trendLines,
          activeFilters: currentFilters,
          globalInvert: currentInvert,
          strategyDirection: currentDirection,
          sequenceConfig: activeStrategyId ? useStore.getState().strategySequenceConfig[activeStrategyId] : undefined,
          operationsPerBar: isRobotPerformance ? operationsPerBar : 1
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as any).error || "Erro de execução no servidor.");
      }

      const results = await readBacktestSSE<Trade>(res, (current, total, asset, trades) => {
        const pct = Math.round((current / total) * 100);
        setAllAssetsPct(pct);
        setAllAssetsProgress(`Processando ativos... ${current}/${total} (${pct}%) — ${asset}: ${trades} trades`);
      });

      const allNewTrades: Trade[] = [];
      const assetsProcessed = Object.keys(results).length;
      Object.values(results).forEach(symTrades => {
        (symTrades as any[]).forEach((t: any) => { t.timeframe = tf; });
        allNewTrades.push(...(symTrades as Trade[]));
      });

      // Cache results per asset
      Object.entries(results).forEach(([sym, symTrades]) => {
        const cacheKey = `${sym}_${activeStrategyId}`;
        backtestResultsCacheRef.current.set(cacheKey, { trades: symTrades as Trade[], timestamp: Date.now() });
      });

      // Update store
      useStore.setState(s => {
        const otherTrades = s.trades.filter(t => !(t.mode === "backtest" && t.strategyId === activeStrategyId));
        return { trades: [...otherTrades, ...allNewTrades] };
      });

      const wins = allNewTrades.filter(t => t.result === "WIN").length;
      const total = allNewTrades.length;
      const wr = total > 0 ? ((wins / total) * 100).toFixed(1) : "0";

      setAllAssetsPct(0);
      setIsProcessingAll(false);
      setAllAssetsProgress("");
      toast.success(`✅ Backtest: ${assetsProcessed} ativos · ${total} trades · WR: ${wr}%`);
    } catch (err: any) {
      console.error("[runAllAssetsBacktest] Failed:", err);
      setAllAssetsPct(0);
      setIsProcessingAll(false);
      setAllAssetsProgress("");
      toast.error(err.message || "Erro ao rodar backtest no lote.");
    }
  }, [tradingMode, activeStrategyId, timeframe, marketType, risk, forex, srLines, srZones, trendLines, isRobotPerformance, operationsPerBar]);

  const overlays = useMemo(() => {
    if (isRobotPerformance) {
      const out: any = {};
      if (fastMaEnabled) {
        out.ma11 = sma(closes, fastMaPeriod);
      }
      if (slowMaEnabled) {
        out.ma200 = sma(closes, slowMaPeriod);
      }
      if (bbEnabled) {
        const bb = bollinger(closes, bbPeriod, bbStdDev);
        out.upper = bb.upper;
        out.lower = bb.lower;
      }
      return out;
    }

    const defaultMAs = {
      ma11: sma(closes, 11),
      ma15: sma(closes, 15),
      ma200: sma(closes, 200),
      ma235: sma(closes, 235)
    };
    if (indicator === "sma") return { ...defaultMAs, ma: sma(closes, 20) };
    if (indicator === "bb") return { ...defaultMAs, ...bollinger(closes, 20, 2) };
    if (indicator === "sar") return { ...defaultMAs, ...parabolicSar(highs, lows) };
    return defaultMAs;
  }, [closes, highs, lows, indicator, isRobotPerformance, fastMaEnabled, fastMaPeriod, slowMaEnabled, slowMaPeriod, bbEnabled, bbPeriod, bbStdDev]);

  const rsiArr = useMemo(() => {
    if (isRobotPerformance) {
      return rsiEnabled ? rsi(closes, rsiPeriod) : null;
    }
    return rsi(closes);
  }, [closes, isRobotPerformance, rsiEnabled, rsiPeriod]);
  const lastPrice = candles[candles.length - 1]?.c ?? 0;

  // gestão: parar após N perdas/vitórias seguidas (Risk legado)
  const recentResults = currentModeTrades.slice(0, 10).map((t) => t.result);
  const lossStreak = (() => { let n = 0; for (const r of recentResults) { if (r === "LOSS") n++; else break; } return n; })();
  const winStreak = (() => { let n = 0; for (const r of recentResults) { if (r === "WIN") n++; else break; } return n; })();

  const riskBlocked = risk.enabled ? (
    (risk.stopAfterLosses > 0 && lossStreak >= risk.stopAfterLosses) ||
    (risk.stopAfterWins > 0 && winStreak >= risk.stopAfterWins)
  ) : false;

  const managementBlocked = useMemo(() => {
    if (!management.enabled) return false;
    if (management.currentDailyPnl >= management.dailyGoal) return "META_ATINGIDA";
    if (management.currentDailyPnl <= -management.dailyStopLoss) return "STOP_LOSS";
    if (management.vdvPaused) return "VDV_PAUSED";
    return false;
  }, [management]);

  const blocked = !!riskBlocked || !!managementBlocked;

  const checkManagementFilters = useCallback((dir: "CALL" | "PUT" | "BUY" | "SELL", customCandles?: Candle[]) => {
    if (!management.enabled) return true;

    const candlesToUse = customCandles || candles;
    if (candlesToUse.length === 0) return true;

    const targetCloses = candlesToUse.map(c => c.c);
    const targetLastPrice = targetCloses[targetCloses.length - 1];

    // Technical filters
    if (management.rsiFilter) {
      const rArr = rsi(targetCloses, management.rsiPeriod);
      const r = rArr[rArr.length - 1];
      if (r !== null) {
        if (dir === "CALL" || dir === "BUY") {
          if (r > management.rsiOverbought) return false;
        } else {
          if (r < management.rsiOversold) return false;
        }
      }
    }

    if (management.maFilter) {
      const ma = management.maType === "sma" ? sma(targetCloses, management.maPeriod) : ema(targetCloses, management.maPeriod);
      const lastMA = ma[ma.length - 1];
      if (lastMA) {
        if (dir === "CALL" || dir === "BUY") {
          if (targetLastPrice < lastMA) return false;
        } else {
          if (targetLastPrice > lastMA) return false;
        }
      }
    }

    if (management.macFilter) {
      const maShort = sma(targetCloses, management.macShortPeriod);
      const maLong = sma(targetCloses, management.macLongPeriod);
      const s = maShort[maShort.length - 1];
      const l = maLong[maLong.length - 1];
      if (s && l) {
        if (dir === "CALL" || dir === "BUY") {
          if (s < l) return false;
        } else {
          if (s > l) return false;
        }
      }
    }

    if (management.adxFilter && candlesToUse.length > management.adxPeriod) {
      const adxData = adx(candlesToUse, management.adxPeriod);
      const lastADX = adxData.adx[adxData.adx.length - 1];
      if (lastADX !== null && lastADX < management.adxThreshold) return false;
    }

    return true;
  }, [management, candles, lastPrice]);

  // Keep placeOrder ref up to date to avoid stale closure in interval
  useEffect(() => {
    placeOrderRef.current = placeOrder;
  });

  // Semi-auto / Auto script logic
  const runSemiAutoLogic = useCallback(() => {
    if (automationMode === "manual" || blocked) return;

    if (automationMode === "auto" && tradingMode === "backtest") return;

    // Use the unified strategy loader (sync — checks bundled + cache)
    // The strategy was preloaded into cache by the useEffect above
    const strategyModule = activeStrategyId ? findStrategySynchronous(activeStrategyId) : null;
    if (!strategyModule || (strategyModule as any).error || typeof strategyModule.onTick !== "function") return;

    const isSemiAutoStrategy = strategyModule?.category === "semi-auto";
    const shouldRunActiveStrategy = strategyModule && (
      automationMode === "auto" || (automationMode === "semi-auto" && isSemiAutoStrategy)
    );

    if (!shouldRunActiveStrategy) return;

    // Determine tracked symbols and their current candles based on mode
    let symbolsToProcess: { symbol: string, currentCandles: Candle[] }[] = [];

    if (tradingMode === "backtest") {
      const cData = useStore.getState().customBacktestData[assetSym] as Candle[];
      if (cData && backtestIdxRef.current > 0) {
        symbolsToProcess.push({
          symbol: assetSym,
          currentCandles: cData.slice(0, backtestIdxRef.current)
        });
      }
    } else {
      const trackedSymbols = Object.keys(allAssetsCandlesRef.current);
      symbolsToProcess = trackedSymbols.map(symbol => ({
        symbol,
        currentCandles: allAssetsCandlesRef.current[symbol]
      }));
    }

    for (const { symbol, currentCandles } of symbolsToProcess) {
      if (currentCandles.length < 2) continue;

      const symbolAsset = ASSETS.find(a => a.symbol === symbol) || asset;
      const lastCandle = currentCandles[currentCandles.length - 1];
      const isLive = tradingMode !== "backtest";

      // ─── Evaluate Pending Orders ───
      const pending = pendingOrdersRef.current[symbol];
      if (pending) {
        if (lastCandle.t > pending.expiryCandleTs) {
          delete pendingOrdersRef.current[symbol];
        } else {
          // In backtest, we check if the candle touched the price
          // In live, we check the currentPrice
          const triggerPrice = isLive ? lastCandle.c : lastCandle.c; // For now simplification
          // Better: for backtest use H/L if possible, but Trading.tsx loop is tick-like
          const hit = (pending.action === "CALL" || pending.action === "BUY")
            ? (lastCandle.l <= pending.targetPrice)
            : (lastCandle.h >= pending.targetPrice);

          if (hit) {
            placeOrderRef.current?.(pending.action, true, undefined, pending.stake, pending.expiryCandles, symbol);
            delete pendingOrdersRef.current[symbol];
          }
        }
      }

      // In live/demo mode, the last element is the forming candle. We need the closed ones.
      // In backtest, the array represents ticks up to the current simulated minute time.
      let analysisCandles = isLive ? currentCandles.slice(0, -1) : currentCandles;
      
      const opTfMin = tfToMin(useStore.getState().timeframe);
      if (opTfMin > 1) {
        const lastClosed1m = analysisCandles[analysisCandles.length - 1];
        if (!lastClosed1m) continue;
        const baseIntervalMs = 60000; // currentCandles are always 1-minute
        const boundaryTime = lastClosed1m.t + baseIntervalMs;
        
        const allOpCandles = resampleCandles(currentCandles, opTfMin);
        analysisCandles = allOpCandles.filter(c => c.t + (opTfMin * 60000) <= boundaryTime);
      }
      
      if (analysisCandles.length < 2) continue;
      
      const lastOpCandleTime = analysisCandles[analysisCandles.length - 1].t;
      if (isRobotPerformance) {
        if (!lastProcessedOpTimeRef.current[symbol] || typeof lastProcessedOpTimeRef.current[symbol] !== "object") {
          lastProcessedOpTimeRef.current[symbol] = {} as any;
        }
        const opCountMap = lastProcessedOpTimeRef.current[symbol] as any;
        const currentCount = opCountMap[lastOpCandleTime] || 0;
        if (currentCount >= operationsPerBar) {
          continue;
        }
        opCountMap[lastOpCandleTime] = currentCount + 1;
      } else {
        if (lastProcessedOpTimeRef.current[symbol] === lastOpCandleTime) {
          continue; // Already processed this operational candle for strategy signal
        }
        lastProcessedOpTimeRef.current[symbol] = lastOpCandleTime;
      }

      const analysisCloses = analysisCandles.map(c => c.c);

      const lastCandleTime = currentCandles[currentCandles.length - 1]?.t || Date.now();
      const opIntervalMs = opTfMin * 60000;
      const candleTimeRemainingMs = isLive ? Math.max(0, (lastCandleTime + opIntervalMs) - Date.now()) : 0;

      const context = {
        asset: symbol,
        history: analysisCandles.map(c => ({ t: c.t, o: c.o, h: c.h, l: c.l, c: c.c })),
        lastPrice: analysisCandles.length > 0 ? analysisCandles[analysisCandles.length - 1].c : (currentCandles[0]?.c || 0),
        currentPrice: currentCandles[currentCandles.length - 1]?.c || 0,
        balance,
        tradingMode,
        isBacktest: tradingMode === "backtest",
        intervalMs: opIntervalMs,
        candleTimeRemainingMs,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        srLines: (useStore.getState().srLines || []).filter(l => l.asset === symbol).map(l => ({ id: l.id, price: l.price, type: l.kind as any, asset: l.asset })),
        srZones: (useStore.getState().srZones || []).filter(z => z.asset === symbol).map(z => ({ id: z.id, p1: z.topPrice, p2: z.bottomPrice, type: z.kind === "buy_zone" ? "support" : "resistance" as const, asset: z.asset })),
        trendLines: (useStore.getState().trendLines || []).filter(l => l.asset === symbol).map(l => ({ id: l.id, t1: l.t1, p1: l.p1, t2: l.t2, p2: l.p2, type: l.kind as any, asset: l.asset })),
        activeFilters: activeStrategyId ? (useStore.getState().strategyFilters[activeStrategyId] || undefined) : undefined,
        indicators: {
          rsi: (period: number, dataSource?: number[]) => rsi(dataSource || analysisCloses, period),
          sma: (period: number, dataSource?: number[]) => sma(dataSource || analysisCloses, period).map(v => v || 0),
          ema: (period: number, dataSource?: number[]) => ema(dataSource || analysisCloses, period).map(v => v || 0),
          bollinger: (period: number, multiplier: number, dataSource?: number[]) => bollinger(dataSource || analysisCloses, period, multiplier) as { upper: number[]; lower: number[] },
          adx: (period: number, dataSource?: Candle[]) => adx(dataSource || analysisCandles, period) as { adx: number[]; plusDi: number[]; minusDi: number[] },
          macd: (fast: number, slow: number, signal: number, dataSource?: number[]) => macd(dataSource || analysisCloses, fast, slow, signal) as { macd: number[]; signal: number[]; histogram: number[] },
          parabolicSar: (afStep?: number, afMax?: number, dataSource?: Candle[]) => {
            const src = dataSource || analysisCandles;
            return parabolicSar(src.map(c => c.h), src.map(c => c.l), afStep, afMax);
          }
        },
        getMTF: (minutes: number) => {
          const factor = minutes * 60 * 1000;
          // Use the complete history from ref (up to 10k candles)
          const source = allAssetsCandlesRef.current[symbol] || candles;
          if (!source.length) return [];
          
          const mtfCandles = resampleCandles(source, minutes);
          
          // Determine the last "finished" timestamp for this MTF
          // A 5m candle starting at 10:00 is finished when we have data AFTER 10:04:59
          // Or more simply, when the latest available 1m candle's end time matches or exceeds the MTF end time.
          const last1m = source[source.length - 1];
          const last1mEnd = last1m.t + (intervalMs); // usually 60,000
          
          // In live/demo mode, we also have fixed current clock, but sticking to candle data is safer for sync
          return mtfCandles.filter(m => (m.t + factor) <= last1mEnd);
        },
        hasOpenTrade: (useStore.getState().trades || []).some(
          t => t.result === "OPEN" && t.mode === tradingMode && t.asset === symbol
        ),
        lastTrade: (() => {
          const finished = (useStore.getState().trades || []).filter(
            t => t.result !== "OPEN" && t.mode === tradingMode && t.asset === symbol && t.strategyId === activeStrategyId
          );
          return finished.length > 0 ? finished[finished.length - 1] : undefined;
        })(),
        updateSR: useStore.getState().updateSR,
        updateTrendLine: useStore.getState().updateTrendLine,
        toast: toast
      };

      const rawResult = strategyModule.onTick(context);

      // Support for MA Trend Filter
      const closes = analysisCandles.map(c => c.c);
      const ma200Arr = sma(closes, 200);
      const ma235Arr = sma(closes, 235);
      const lastC = closes[closes.length - 1];
      const lastMA200 = ma200Arr[ma200Arr.length - 1] || 0;
      const lastMA235 = ma235Arr[ma235Arr.length - 1] || 0;
      let maTrend: string = "Ranging/Mixed";
      if (lastC > lastMA200 && lastMA200 > lastMA235) maTrend = "Strong Bullish";
      else if (lastC < lastMA200 && lastMA200 < lastMA235) maTrend = "Strong Bearish";
      else if (lastC > lastMA200) maTrend = "Bullish";
      else if (lastC < lastMA200) maTrend = "Bearish";

      // Apply filter logic (ranges with ignore/invert + global invert)
      const indicatorValues = computeIndicatorValues(analysisCandles, symbol, rawResult);
      const currentFilters = activeStrategyId ? (useStore.getState().strategyFilters[activeStrategyId] || undefined) : undefined;
      const currentInvert = activeStrategyId ? (useStore.getState().strategyInvert[activeStrategyId] || false) : false;
      const currentDirection = activeStrategyId ? (useStore.getState().strategyDirection[activeStrategyId] || "all") : "all";
      const result = applyFilterLogic(rawResult, currentFilters, indicatorValues, currentInvert, currentDirection);

      if (result && result.pendingPrice) {
        let dir = result.action;
        if (dir) {
          if (marketType === "binary") {
            if (dir === "BUY" || dir === "SELL") dir = dir === "BUY" ? "CALL" : "PUT";
          } else {
            if (dir === "CALL" || dir === "PUT") dir = dir === "CALL" ? "BUY" : "SELL";
          }
          pendingOrdersRef.current[symbol] = {
            action: dir as any,
            targetPrice: result.pendingPrice,
            expiryCandleTs: lastCandleTime + (result.pendingExpiryCandles || 5) * opIntervalMs,
            stake: result.stake,
            expiryCandles: result.expiryCandles,
            customStats: result.customStats
          };
          toast.info(`Ordem pendente em ${symbol}: ${dir} em ${result.pendingPrice.toFixed(2)}`);
        }
      } else if (result && result.action) {
        // If strategy wants candle-synced entry, schedule it
        if (result.waitForCandleClose && candleTimeRemainingMs > 1000) {
          setTimeout(() => {
            placeOrderRef.current?.(result.action!, true, result.duration, result.stake, result.expiryCandles, symbol);
          }, candleTimeRemainingMs + 200); // +200ms buffer after candle close
        } else {
          placeOrderRef.current?.(result.action, true, result.duration, result.stake, result.expiryCandles, symbol);
        }
      }

      // Update last processed candle ref since strategy executed
      if (currentCandles[currentCandles.length - 2]) {
        lastSRCandleProcessedRef.current[symbol] = currentCandles[currentCandles.length - 2].t;
      }
    }
  }, [automationMode, srLines, asset.symbol, blocked, balance, activeStrategyId, tradingMode, asset]);

  useEffect(() => {
    if (automationMode === "manual") {
      if (autoIntervalRef.current) { clearInterval(autoIntervalRef.current); autoIntervalRef.current = null; }
      return;
    }

    // For backtest, we shouldn't use absolute time intervals if playing fast
    // Actually we will handle backtest explicitly in another effect, so we don't interfere
    // But for live mode:
    if (tradingMode !== "backtest") {
      autoIntervalRef.current = setInterval(() => {
        runSemiAutoLogic();
      }, 1000);
      return () => { if (autoIntervalRef.current) clearInterval(autoIntervalRef.current); };
    }
  }, [automationMode, runSemiAutoLogic, tradingMode]);



  const placeOrder = async (dir: "CALL" | "PUT" | "BUY" | "SELL", fromAuto = false, customDuration?: number, customStake?: number, customExpiryCandles?: number, assetOverride?: string) => {
    if (blocked) {
      const msg = managementBlocked === "META_ATINGIDA" ? "Meta diária atingida" :
        managementBlocked === "STOP_LOSS" ? "Stop loss diário atingido" :
          managementBlocked === "VDV_PAUSED" ? "Pausa VDV ativa (aguardando 2 wins)" :
            `Bloqueio de gestão (${lossStreak}L/${winStreak}W)`;
      toast.error(msg);
      return;
    }

    const orderAsset = assetOverride ? (ASSETS.find(a => a.symbol === assetOverride) || asset) : asset;
    const orderCandles = assetOverride ? (allAssetsCandlesRef.current[assetOverride] || candles) : candles;
    const orderLastPrice = orderCandles[orderCandles.length - 1]?.c || lastPrice;

    // Sequence filters (Risk legado or Management novo)
    const entryAfterWin = management.enabled ? management.entryAfterWin : risk.entryAfterWin;
    const entryAfterLoss = management.enabled ? management.entryAfterLoss : risk.entryAfterLoss;

    if (entryAfterWin && lastResultRef.current !== "WIN") { toast("Aguardando vitória anterior"); return; }
    if (entryAfterLoss && lastResultRef.current !== "LOSS") { toast("Aguardando derrota anterior"); return; }

    // Management Technical Filters (Always uses active chart candles for checkManagementFilters if not careful, 
    // but strategy already decided internally. However management filters are global UI config.
    // Fixed technical filter check to use orderCandles:
    if (management.enabled && !checkManagementFilters(dir, orderCandles)) {
      toast.info(`A estratégia deu sinal em ${orderAsset.symbol}, mas o filtro de gestão bloqueou a entrada.`);
      return;
    }

    // Use custom duration & stake if provided, otherwise fallback to UI stated ones
    let finalDuration = customDuration ?? duration;
    const finalStake = customStake ?? stake;
    const finalLotSize = customStake ?? lotSize;
    let durationS = finalDuration;

    if (customExpiryCandles !== undefined) {
      const expiryCount = parseDuration(customExpiryCandles);
      if (Math.floor(expiryCount) !== expiryCount) { // Fractional - exactly proportional time
        const durationSeconds = Math.max(15, Math.min(3600, Math.ceil(expiryCount * (intervalMs / 1000))));
        finalDuration = durationSeconds;
        durationS = durationSeconds;
      } else { // Integer - candle aligned
        const lastCandle = orderCandles[orderCandles.length - 1];
        const nowTs = Date.now();
        const currentCandleOpenTs = lastCandle ? lastCandle.t : (Math.floor(nowTs / intervalMs) * intervalMs);
        let targetEndTs = currentCandleOpenTs + expiryCount * intervalMs;
        if (targetEndTs - nowTs < 15000) {
          targetEndTs += intervalMs;
        }
        finalDuration = Math.floor(targetEndTs / 1000); // UNIX epoch in seconds
        durationS = Math.max(15, Math.floor((targetEndTs - nowTs) / 1000));
      }
    } else if (finalDuration === -1) {
      if (tradingMode === "backtest") {
        // In backtest, -1 means it expires at the end of the current candle index
        finalDuration = Math.ceil(intervalMs / 1000);
        durationS = finalDuration;
      } else {
        const lastCandle = orderCandles[orderCandles.length - 1];
        const nowTs = Date.now();
        if (lastCandle) {
          const currentCandleOpenTs = lastCandle.t;
          let targetEndTs = currentCandleOpenTs + intervalMs;
          if (targetEndTs - nowTs < 15000) {
            targetEndTs += intervalMs;
          }
          finalDuration = Math.floor(targetEndTs / 1000); // UNIX epoch in seconds
          durationS = Math.max(15, Math.floor((targetEndTs - nowTs) / 1000));
        } else {
          finalDuration = 60; // fallback
          durationS = 60;
        }
      }
    } else {
      durationS = finalDuration;
    }

    const entry = orderLastPrice;
    const ts = Date.now();
    const entryTime = orderCandles[orderCandles.length - 1]?.t || ts;
    let id = crypto.randomUUID();

    let isApiOrder = false;
    const isLiveMode = tradingMode === "demo" || tradingMode === "real";

    if (isLiveMode && derivAPI.token && derivAPI.ws?.readyState === WebSocket.OPEN) {
      if (marketType === "binary") {
        try {
          toast.info(`🛒 Enviando ordem API Deriv (${orderAsset.symbol})...`);
          const callStart = Date.now();
          const buyRes = await derivAPI.buyContract(orderAsset.symbol, finalStake, dir as "CALL" | "PUT", finalDuration, "s");
          if (buyRes && buyRes.contract_id) {
            const sendLatency = Date.now() - callStart;
            id = String(buyRes.contract_id);
            isApiOrder = true;
            toast.success(`Ordem em ${orderAsset.symbol} enviada com sucesso! Latência API: ${sendLatency}ms`);
            setLatencyMs(sendLatency);
          }
        } catch (e: unknown) {
          const err = e as Error;
          toast.error(`Deriv API Erro (${orderAsset.symbol}): ${err.message || "Falha ao abrir ordem"}`);
          return;
        }
      }
    }

    const orderCloses = orderCandles.map(c => c.c);
    const rsiVal = rsi(orderCloses, management.rsiPeriod)[orderCloses.length - 1];

    // Compute remaining indicators dynamically for snapshot
    const lastCandleIdx = orderCandles.length - 1;
    const adxData = adx(orderCandles, 14);
    const macdData = macd(orderCloses, 12, 26, 9);
    const ma9 = sma(orderCloses, 9);
    const ma21 = sma(orderCloses, 21);
    const ma200 = sma(orderCloses, 200);
    const ma235 = sma(orderCloses, 235);
    const sarData = parabolicSar(orderCandles.map(c => c.h), orderCandles.map(c => c.l));
    const pattern = getPattern(orderCandles, lastCandleIdx);
    const atrArr = atr(orderCandles, 14);
    const williamsArr = williamsR(orderCandles, 14);

    const sh = {
      rsi: rsiVal,
      adx: adxData.adx[adxData.adx.length - 1],
      macd: macdData.macd[macdData.macd.length - 1],
      histogram: macdData.histogram[macdData.histogram.length - 1],
      pattern: pattern,
      ma9: ma9[ma9.length - 1],
      ma21: ma21[ma21.length - 1],
      ma200: ma200[ma200.length - 1] || null,
      ma235: ma235[ma235.length - 1] || null,
      sar: sarData.sar[sarData.sar.length - 1] || null,
      atr: atrArr && atrArr.length > 0 ? atrArr[atrArr.length - 1] : null,
      williams: williamsArr && williamsArr.length > 0 ? williamsArr[williamsArr.length - 1] : null,
      fibLevel: orderCandles.length > 0 ? getFibonacciLevel(orderCandles, orderCandles.length - 1, orderCandles[orderCandles.length - 1].c).closestLevel : "N/A",
      pivotLevel: orderCandles.length > 0 ? getPivotPoints(orderCandles, orderCandles.length - 1, orderCandles[orderCandles.length - 1].c).closestPivot : "N/A",
      marketMoment: orderCandles.length > 0 ? classifyMarketMomentum(orderCandles, orderCandles.length - 1, orderCandles[orderCandles.length - 1].c) : "Sem Padrão Clássico",
      marketStructure: orderCandles.length > 0 ? detectMarketStructure(orderCandles, orderCandles.length - 1) : "Sem Estrutura Definida",
      candleSize: orderCandles.length > 0 ? (() => {
        const last = orderCandles[orderCandles.length - 1];
        const bodyPct = (Math.abs(last.c - last.o) / last.o) * 100;
        if (bodyPct < 0.02) return "Pequeno (<0.02%)";
        if (bodyPct < 0.06) return "Médio (0.02%-0.06%)";
        return "Grande (>0.06%)";
      })() : "N/A",
      preEntryMomentum: orderCandles.length >= 5 ? (() => {
        const last5 = orderCandles.slice(-5);
        const greenCount = last5.filter(c => c.c > c.o).length;
        const redCount = last5.filter(c => c.c < c.o).length;
        const avgBodyPct = last5.reduce((sum, c) => sum + (Math.abs(c.c - c.o) / c.o) * 100, 0) / 5;
        if (greenCount >= 4) return avgBodyPct > 0.06 ? "Impulso Altista Forte" : "Impulso Altista Moderado";
        if (redCount >= 4) return avgBodyPct > 0.06 ? "Impulso Baixista Forte" : "Impulso Baixista Moderado";
        if (avgBodyPct < 0.02) return "Lateralização / Sem Força";
        return "Misto / Correção";
      })() : "Misto / Sem Histórico",
      bollingerState: orderCloses.length >= 20 ? (() => {
        const bb = bollinger(orderCloses, 20, 2);
        const idx = orderCloses.length - 1;
        const u = bb.upper[idx];
        const l = bb.lower[idx];
        const m = bb.ma[idx];
        if (u == null || l == null || m == null) return "N/A";
        const bandwidth = (u - l) / m;
        let sumBw = 0, count = 0;
        for (let j = Math.max(0, idx - 19); j <= idx; j++) {
          const uj = bb.upper[j], lj = bb.lower[j], mj = bb.ma[j];
          if (uj != null && lj != null && mj != null) { sumBw += (uj - lj)/mj; count++; }
        }
        const avgBandwidth = count > 0 ? sumBw / count : bandwidth;
        if (bandwidth < avgBandwidth * 0.85) return "Squeeze (Bandas Estreitas)";
        if (bandwidth > avgBandwidth * 1.15) return "Estouro / Expansão Volatilidade";
        return "Neutro / Altas e Baixas Padrão";
      })() : "N/A",
      indicatorCrossover: ma9[ma9.length - 1] > ma21[ma21.length - 1]
        ? "Alinhamento de Alta (9 > 21)" : "Alinhamento de Baixa (9 < 21)",
      entryCandle: orderCandles.length > 0 ? orderCandles[orderCandles.length - 1] : null,
      customStats: result?.customStats
    };

    // For backtesting, convert duration to expiryCandles
    let expiryCandles = customExpiryCandles;
    if (expiryCandles === undefined) {
      if (customDuration === -1 || (customDuration === undefined && duration === -1)) {
        expiryCandles = 1; // Expire at the end of current candle
      } else {
        const baseIntervalMs = 60000; // backtestIdx всегда incremented by 1m basis!
        expiryCandles = isLiveMode ? undefined : Math.ceil((finalDuration * 1000) / baseIntervalMs) || 1;
      }
    }

    if (marketType === "binary") {
      toast.success(`Ordem ${dir} ${orderAsset.symbol} · stake $${finalStake} ${isApiOrder ? '(API)' : '(Sim)'}`);
      addTrade({
        id, asset: orderAsset.symbol, type: dir as "CALL" | "PUT", amount: finalStake, entry, result: "OPEN",
        ts, entryTime, durationS, indicator, snapshot: sh, mode: tradingMode,
        entryCandleIdx: tradingMode === "backtest" ? backtestIdx : undefined,
        expiryCandles,
        strategyId: activeStrategyId || undefined,
        customStats: sh.customStats
      });

      if (!isApiOrder && isLiveMode) {
        timeoutsRef.current[id] = setTimeout(() => {
          const tState = (useStore.getState().trades || []).find(t => t.id === id);
          if (!tState || tState.result !== "OPEN") return; // closed manually
          if (timeoutsRef.current[id]) delete timeoutsRef.current[id];
          const latestCs = allAssetsCandlesRef.current[orderAsset.symbol] || orderCandles;
          const exitPrice = latestCs[latestCs.length - 1]?.c ?? entry;
          const supports = (useStore.getState().srLines || []).filter((l) => l.asset === orderAsset.symbol && l.kind === "support").map((l) => l.price);
          const resistances = (useStore.getState().srLines || []).filter((l) => l.asset === orderAsset.symbol && l.kind === "resistance").map((l) => l.price);

          const win = dir === "CALL" ? exitPrice > entry : exitPrice < entry;
          const pnl = win ? finalStake * (useStore.getState().risk.payout / 100) : -finalStake;
          lastResultRef.current = win ? "WIN" : "LOSS";
          useStore.getState().addPnl(pnl);
          useStore.getState().updateTrade(id, { exit: exitPrice, result: win ? "WIN" : "LOSS", pnl });
          toast[win ? "success" : "error"](`${win ? "WIN" : "LOSS"} ${orderAsset.symbol} · ${pnl > 0 ? "+" : ""}${pnl.toFixed(2)}`);
        }, durationS * 1000);
      }
    } else {
      // Forex order
      const pipValue = orderAsset.symbol.includes("JPY") ? 0.01 : 0.0001;
      const slPrice = dir === "BUY" ? entry - slPips * pipValue : entry + slPips * pipValue;
      const tpPrice = dir === "BUY" ? entry + tpPips * pipValue : entry - tpPips * pipValue;

      toast.success(`Ordem ${dir} ${orderAsset.symbol} · ${finalLotSize} lot ${isApiOrder ? '(API)' : '(Sim)'}`);
      addTrade({
        id, asset: orderAsset.symbol, type: dir as "BUY" | "SELL", amount: finalLotSize, entry, result: "OPEN",
        ts, entryTime, durationS: 0, indicator, snapshot: sh, mode: tradingMode,
        entryCandleIdx: tradingMode === "backtest" ? backtestIdx : undefined,
        strategyId: activeStrategyId || undefined,
        customStats: sh.customStats
      });

      if (!isApiOrder && isLiveMode) {
        timeoutsRef.current[id] = setTimeout(() => {
          const tState = (useStore.getState().trades || []).find(t => t.id === id);
          if (!tState || tState.result !== "OPEN") return; // closed manually
          if (timeoutsRef.current[id]) delete timeoutsRef.current[id];
          const latestCs = allAssetsCandlesRef.current[orderAsset.symbol] || orderCandles;
          const exitPrice = latestCs[latestCs.length - 1]?.c ?? entry;
          const pips = dir === "BUY" ? (exitPrice - entry) / pipValue : (entry - exitPrice) / pipValue;
          const pnl = pips * (finalLotSize * 100000 * pipValue);
          const win = pnl > 0;
          lastResultRef.current = win ? "WIN" : "LOSS";
          useStore.getState().addPnl(pnl);
          useStore.getState().updateTrade(id, { exit: exitPrice, result: win ? "WIN" : "LOSS", pnl });
          toast[win ? "success" : "error"](`${win ? "WIN" : "LOSS"} ${orderAsset.symbol} · ${pnl > 0 ? "+" : ""}${pnl.toFixed(2)} · ${pips.toFixed(1)} pips`);
        }, 3000);
      }
    }
  };

  // -------------------------------------------------------------
  // Backtest engine loop: Evaluates every candle change
  // -------------------------------------------------------------
  useEffect(() => {
    if (tradingMode !== "backtest") return;

    // 1. Evaluate open trades
    const openTrades = (useStore.getState().trades || []).filter(t => t.mode === "backtest" && t.result === "OPEN");
    openTrades.forEach(t => {
      const isBinary = t.type === "CALL" || t.type === "PUT";
      if (isBinary) {
        // Binary logic uses expiryCandles
        if (t.entryCandleIdx !== undefined && t.expiryCandles !== undefined) {
          if (backtestIdx >= t.entryCandleIdx + t.expiryCandles) {
            const cIndex = Math.floor(t.entryCandleIdx + t.expiryCandles - 0.0001);
            const targetIndex = Math.min(orderCandles.length - 1, Math.max(0, cIndex));
            const fract = t.expiryCandles - Math.floor(t.expiryCandles - 0.0001);
            const exitPrice = orderCandles[targetIndex]
              ? (orderCandles[targetIndex].o * (1 - fract) + orderCandles[targetIndex].c * fract)
              : lastPrice;

            // Support/Resistance cheat
            const supports = (srLines || []).filter((l) => l.asset === t.asset && l.kind === "support").map((l) => l.price);
            const resistances = (srLines || []).filter((l) => l.asset === t.asset && l.kind === "resistance").map((l) => l.price);
            const nearSup = (supports || []).some((p) => Math.abs(t.entry - p) / t.entry < 0.002);
            const nearRes = (resistances || []).some((p) => Math.abs(t.entry - p) / t.entry < 0.002);

            const win = t.type === "CALL" ? exitPrice > t.entry : exitPrice < t.entry;

            const pnl = win ? t.amount * (risk.payout / 100) : -t.amount;
            lastResultRef.current = win ? "WIN" : "LOSS";
            addPnl(pnl);
            updateTrade(t.id, { exit: exitPrice, result: win ? "WIN" : "LOSS", pnl });
            toast[win ? "success" : "error"](`[Backtest] ${win ? "WIN" : "LOSS"} ${t.asset} · ${pnl > 0 ? "+" : ""}${pnl.toFixed(2)}`);
          }
        }
      } else {
        // Forex logic backtest
        if (t.entryCandleIdx !== undefined) {
          const exitPrice = lastPrice;
          const pipValue = t.asset.includes("JPY") ? 0.01 : 0.0001;
          const pips = t.type === "BUY" ? (exitPrice - t.entry) / pipValue : (t.entry - exitPrice) / pipValue;

          const fConf = useStore.getState().forex;
          let shouldClose = false;

          if (fConf.enabled) {
            if (pips <= -fConf.stopLossPips) shouldClose = true;
            if (pips >= fConf.takeProfitPips) shouldClose = true;
          }

          if (t.expiryCandles && backtestIdx >= t.entryCandleIdx + t.expiryCandles) {
            shouldClose = true;
          }

          if (!fConf.enabled && !t.expiryCandles && backtestIdx >= t.entryCandleIdx + 20) { // arbitrary default if no SL/TP and no expiry
            shouldClose = true;
          }

          if (shouldClose) {
            const pnl = pips * (t.amount * 100000 * pipValue);
            const win = pnl > 0;
            lastResultRef.current = win ? "WIN" : "LOSS";
            addPnl(pnl);
            updateTrade(t.id, { exit: exitPrice, result: win ? "WIN" : "LOSS", pnl });
            toast[win ? "success" : "error"](`[Backtest] ${win ? "WIN" : "LOSS"} ${t.asset} · ${pnl > 0 ? "+" : ""}${pnl.toFixed(2)} · ${pips.toFixed(1)} pips`);
          }
        }
      }
    });

    // 2. Evaluate Strategy
    if (automationMode !== "manual" && backtestPlaying) {
      // Small timeout to allow state changes to flush before next candle
      const stratTimeout = setTimeout(() => {
        runSemiAutoLogic();
      }, 0);
      return () => clearTimeout(stratTimeout);
    }
  }, [backtestIdx, tradingMode, runSemiAutoLogic, lastPrice, srLines, addPnl, updateTrade, risk.payout, automationMode, backtestPlaying]);

  const modeLabel = { demo: "DEMO", real: "REAL", backtest: "BACKTEST" }[tradingMode];
  const modeColor = { demo: "text-primary", real: "text-bear", backtest: "text-warning" }[tradingMode];

  // Stats for the current mode
  const stats = useMemo(() => {
    let relevantTrades = currentModeTrades;
    if (automationMode !== "manual" && activeStrategyId) {
      relevantTrades = relevantTrades.filter(t => t.strategyId === activeStrategyId);
    }
    const closedTrades = relevantTrades.filter(t => t.result && t.result !== "OPEN");
    const wins = closedTrades.filter(t => t.result === "WIN");
    const losses = closedTrades.filter(t => t.result === "LOSS");
    const totalProfit = wins.reduce((acc, t) => acc + (t.pnl || 0), 0);
    const totalLoss = Math.abs(losses.reduce((acc, t) => acc + (t.pnl || 0), 0));
    const winrate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : (totalProfit > 0 ? Infinity : 0);

    return {
      wins: wins.length,
      losses: losses.length,
      total: closedTrades.length,
      winrate,
      totalProfit,
      totalLoss,
      net: totalProfit - totalLoss,
      profitFactor
    };
  }, [currentModeTrades, automationMode, activeStrategyId]);

  const [sliderIndex, setSliderIndex] = useState(backtestIdx);
  useEffect(() => { setSliderIndex(backtestIdx); }, [backtestIdx]);

  if (!asset || !asset.symbol) {
    return (
      <AppShell>
        <div className="flex h-full items-center justify-center">
          <div className="text-muted-foreground">Carregando ativos...</div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col lg:flex-row gap-2 p-2 h-auto lg:h-[calc(100vh-3rem)] overflow-auto lg:overflow-hidden">
        {/* left: assets — collapsible */}
        <div className={`${assetsSidebarOpen ? "w-full lg:w-64" : "hidden lg:flex lg:w-10"} flex flex-col gap-2 transition-all duration-300 shrink-0`}>
          {assetsSidebarOpen ? (
            <>
              <div className="panel p-3 overflow-auto flex-1 shrink-0">
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-border/40">
                  <div className="text-[10px] uppercase text-primary font-bold tracking-wider">
                    {isRobotPerformance ? "Indicadores" : "Ativos"}
                  </div>
                  <button onClick={toggleAssetsSidebar} className="text-muted-foreground hover:text-foreground">
                    <PanelLeftClose className="h-3.5 w-3.5 hidden lg:block" />
                    <X className="h-3.5 w-3.5 lg:hidden" />
                  </button>
                </div>
                {isRobotPerformance ? (
                  <div className="flex flex-col gap-5 text-xs text-foreground">
                    {/* Fast Moving Average */}
                    <div className="flex flex-col gap-1.5 p-2 rounded border border-border/20 bg-background/20">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-1.5 font-medium select-none cursor-pointer">
                          <input
                            type="checkbox"
                            checked={fastMaEnabled}
                            onChange={(e) => setFastMaEnabled(e.target.checked)}
                            className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5 accent-primary bg-background"
                          />
                          <span>Média Móvel Rápida</span>
                        </label>
                        <span className="w-2.5 h-2.5 rounded-full bg-[#7dd3fc]" title="Cor da linha celeste" />
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <span className="text-muted-foreground text-[10px]">Período (SMA):</span>
                        <input
                          type="number"
                          value={fastMaPeriod}
                          onChange={(e) => setFastMaPeriod(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-16 h-7 bg-background border border-border/40 rounded px-2 text-center text-xs text-foreground focus:outline-none focus:border-primary"
                        />
                      </div>
                    </div>

                    {/* Slow Moving Average */}
                    <div className="flex flex-col gap-1.5 p-2 rounded border border-border/20 bg-background/20">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-1.5 font-medium select-none cursor-pointer">
                          <input
                            type="checkbox"
                            checked={slowMaEnabled}
                            onChange={(e) => setSlowMaEnabled(e.target.checked)}
                            className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5 accent-primary bg-background"
                          />
                          <span>Média Móvel Lenta</span>
                        </label>
                        <span className="w-2.5 h-2.5 rounded-full bg-[#f43f5e]" title="Cor da linha rosa" />
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <span className="text-muted-foreground text-[10px]">Período (SMA):</span>
                        <input
                          type="number"
                          value={slowMaPeriod}
                          onChange={(e) => setSlowMaPeriod(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-16 h-7 bg-background border border-border/40 rounded px-2 text-center text-xs text-foreground focus:outline-none focus:border-primary"
                        />
                      </div>
                    </div>

                    {/* Bollinger Bands */}
                    <div className="flex flex-col gap-1.5 p-2 rounded border border-border/20 bg-background/20">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-1.5 font-medium select-none cursor-pointer">
                          <input
                            type="checkbox"
                            checked={bbEnabled}
                            onChange={(e) => setBbEnabled(e.target.checked)}
                            className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5 accent-primary bg-background"
                          />
                          <span>Bandas Bollinger</span>
                        </label>
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500/50" title="Preenchimento azulado" />
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <span className="text-muted-foreground text-[10px]">Período:</span>
                        <input
                          type="number"
                          value={bbPeriod}
                          onChange={(e) => setBbPeriod(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-16 h-7 bg-background border border-border/40 rounded px-2 text-center text-xs text-foreground focus:outline-none focus:border-primary"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground text-[10px]">Desvio Padrão:</span>
                        <input
                          type="number"
                          step="0.1"
                          value={bbStdDev}
                          onChange={(e) => setBbStdDev(Math.max(0.1, parseFloat(e.target.value) || 0.1))}
                          className="w-16 h-7 bg-background border border-border/40 rounded px-2 text-center text-xs text-foreground focus:outline-none focus:border-primary"
                        />
                      </div>
                    </div>

                    {/* RSI */}
                    <div className="flex flex-col gap-1.5 p-2 rounded border border-border/20 bg-background/20">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-1.5 font-medium select-none cursor-pointer">
                          <input
                            type="checkbox"
                            checked={rsiEnabled}
                            onChange={(e) => setRsiEnabled(e.target.checked)}
                            className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5 accent-primary bg-background"
                          />
                          <span>RSI (IFR)</span>
                        </label>
                        <span className="w-2.5 h-2.5 rounded-full bg-orange-400" title="Linha de oscilação laranja" />
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <span className="text-muted-foreground text-[10px]">Período:</span>
                        <input
                          type="number"
                          value={rsiPeriod}
                          onChange={(e) => setRsiPeriod(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-16 h-7 bg-background border border-border/40 rounded px-2 text-center text-xs text-foreground focus:outline-none focus:border-primary"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {(marketType === "binary" ? (["synthetic"] as const) : (["synthetic", "forex"] as const)).map((kind) => (
                      <div key={kind} className="mb-3">
                        <div className="text-[10px] text-primary mb-1">{kind === "synthetic" ? "SINTÉTICOS" : "FOREX"}</div>
                        {ASSETS.filter((a) => a.type === kind).map((a) => {
                          const activeTradeHere = currentModeTrades.find(t => t.asset === a.symbol && t.result === "OPEN");
                          return (
                            <button
                              key={a.symbol}
                              onClick={() => setAssetSym(a.symbol)}
                              className={`relative w-full text-left px-2 py-1.5 text-xs rounded-sm mb-0.5 border ${a.symbol === assetSym ? "border-primary bg-secondary text-primary" : "border-transparent hover:bg-secondary/60"}`}
                            >
                              {activeTradeHere && (
                                <div className="absolute -left-1 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-warning shadow-[0_0_8px_rgba(234,179,8,0.8)] animate-pulse" />
                              )}
                              <div className="flex justify-between">
                                <span className="font-bold">{a.symbol}</span>
                                <span className="ticker text-muted-foreground">{fmtPrice(a.base, a)}</span>
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate">{a.name}</div>
                            </button>
                          )
                        })}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center pt-2">
              <button
                onClick={toggleAssetsSidebar}
                className="p-2 rounded-md border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/50 transition-all shadow-panel"
                title={isRobotPerformance ? "Mostrar indicadores" : "Mostrar ativos"}
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* center: chart */}
        <div className="flex-1 flex flex-col gap-2 min-h-[450px] lg:min-h-0 min-w-0 transition-all duration-300">
          <div className="flex-1 min-h-0 relative">
            {!assetsSidebarOpen && (
              <button
                onClick={toggleAssetsSidebar}
                className="lg:hidden absolute top-2 left-2 z-20 p-2 rounded-md border border-border bg-card/80 backdrop-blur text-muted-foreground hover:text-primary transition-all shadow-panel"
                title="Mostrar ativos"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            )}
            <CandlestickChart
              asset={asset.symbol}
              candles={displayCandles}
              drawingMode={draw}
              setDrawingMode={setDraw}
              indicator={indicator}
              setIndicator={setIndicator}
              overlays={overlays}
              oscillator={isRobotPerformance ? (rsiEnabled ? rsiArr : null) : (indicator === "rsi" ? rsiArr : null)}
              tradingMode={tradingMode}
              trades={currentModeTrades.filter((t) => t.asset === asset.symbol)}
              onAssetChange={setAssetSym}
              isRobotPerformance={isRobotPerformance}
              activeStrategyId={activeStrategyId}
              setActiveStrategyId={setActiveStrategyId}
              activeRobotId={activeRobotId}
              setActiveRobotId={setActiveRobotId}
              onSelectRobot={(robotId, strategyId) => {
                setActiveRobotId(robotId);
                setActiveStrategyId(strategyId);
              }}
              robotsList={parsedActiveRobotsList}
              {...(isRobotPerformance ? {
                customTimeframes: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
                selectedTimeframe: String(operationsPerBar),
                onTimeframeChange: (val) => setOperationsPerBar(Number(val)),
                timeframeLabel: "Op/Candle"
              } : {})}
            />
            {tradingMode === "backtest" && (
              <div className="absolute bottom-12 left-[10%] right-[10%] bg-[#131722]/80 border border-[#2a2e39] rounded-sm p-3 shadow-xl backdrop-blur-sm z-10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setBacktestIdx(v => {
                        const newIdx = Math.max(0, v - 1);
                        return newIdx;
                      });
                      setBacktestPlaying(false);
                    }}
                    className="p-1.5 hover:bg-[#2a2e39] rounded text-muted-foreground hover:text-white"
                    title="Recuar 1 Candle (Reseta histórico)"
                  >
                    <StepBack className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setBacktestPlaying(p => !p)}
                    className="h-8 w-8 flex items-center justify-center bg-primary text-primary-foreground rounded-full hover:brightness-110 shadow-lg"
                  >
                    {!backtestPlaying ? <Play className="h-4 w-4 ml-0.5" fill="currentColor" /> : <Pause className="h-4 w-4" fill="currentColor" />}
                  </button>
                  <button
                    onClick={() => { setBacktestIdx(v => Math.min(currentMaxBacktest, v + 1)); setBacktestPlaying(false); }}
                    className="p-1.5 hover:bg-[#2a2e39] rounded text-muted-foreground hover:text-white"
                    title="Avançar 1 Candle"
                  >
                    <StepForward className="h-4 w-4" />
                  </button>

                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground ml-4">
                    <span className="w-24 text-right">{sliderIndex} / {currentMaxBacktest} velas</span>
                    <input
                      type="range"
                      min={10}
                      max={currentMaxBacktest}
                      value={sliderIndex}
                      onChange={(e) => { setSliderIndex(+e.target.value); }}
                      onPointerUp={(e) => { setBacktestIdx(sliderIndex); setBacktestPlaying(false); }}
                      onTouchEnd={(e) => { setBacktestIdx(sliderIndex); setBacktestPlaying(false); }}
                      className="w-48 xl:w-64 accent-primary cursor-pointer"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground font-bold">VELOCIDADE:</span>
                  {[1, 2, 5, 10, 50].map(s => (
                    <button
                      key={s}
                      onClick={() => setBacktestSpeed(s)}
                      className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${backtestSpeed === s ? "bg-primary text-primary-foreground shadow-md" : "bg-[#2a2e39] text-muted-foreground hover:bg-[#363a45] hover:text-white"}`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Stats Block */}
          {(tradingMode === "backtest" || (activeStrategyId && automationMode !== "manual")) && (
            <div className="panel p-2 mb-2">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[10px] text-muted-foreground uppercase font-bold">
                  {isRobotPerformance ? "Estatísticas do Robô" : "Estatísticas"}
                </span>
                {tradingMode === "backtest" && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={loadAllAssetsHistory}
                      disabled={isProcessingAll}
                      className="text-[10px] bg-bull/20 text-bull px-2 py-1 rounded shadow hover:bg-bull/30 flex items-center gap-1 transition-all font-bold disabled:opacity-40"
                      title="Sincroniza todas as velas do cache do servidor (Node.js)"
                    >
                      <Plus className="h-3 w-3" /> Carregar Velas
                    </button>
                    <button
                      onClick={runCurrentAssetBacktest}
                      disabled={isProcessingAll}
                      className="text-[10px] bg-secondary text-secondary-foreground px-2 py-1 rounded shadow hover:brightness-110 flex items-center gap-1 transition-all font-bold disabled:opacity-40"
                    >
                      <Play className="h-3 w-3" fill="currentColor" /> Rodar Ativo
                    </button>
                    <button
                      onClick={runAllAssetsBacktest}
                      disabled={isProcessingAll}
                      className="text-[10px] bg-primary text-primary-foreground px-2.5 py-1 rounded shadow hover:brightness-110 flex items-center gap-1.5 transition-all font-bold disabled:opacity-40"
                    >
                      <Play className="h-3 w-3" fill="currentColor" /> Rodar Todos
                    </button>
                  </div>
                )}
              </div>

              {/* Processing indicator */}
              {isProcessingAll && (
                <div className="mb-2 border border-primary/30 rounded-sm overflow-hidden">
                  <div className="p-2 bg-primary/5 flex items-center gap-2">
                    <div className="animate-spin h-3 w-3 border-2 border-primary border-t-transparent rounded-full shrink-0" />
                    <span className="text-[10px] text-primary font-bold truncate">{allAssetsProgress}</span>
                  </div>
                  {allAssetsPct > 0 && (
                    <div className="h-1.5 bg-black/40">
                      <div
                        className="h-full bg-primary transition-all duration-300 ease-out rounded-r"
                        style={{ width: `${allAssetsPct}%` }}
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-between gap-1 text-[10px] text-center">
                <div className="flex-1 bg-[#131722] rounded p-1">
                  <div className="text-muted-foreground">Trades</div>
                  <div className="font-bold">{stats.total}</div>
                </div>
                <div className="flex-1 bg-[#131722] rounded p-1">
                  <div className="text-muted-foreground">Winrate</div>
                  <div className={`font-bold ${stats.winrate > 50 ? "text-bull" : "text-bear"}`}>
                    {stats.winrate.toFixed(1)}%
                  </div>
                </div>
                <div className="flex-1 bg-[#131722] rounded p-1">
                  <div className="text-muted-foreground">Net P&L</div>
                  <div className={`font-bold ${stats.net >= 0 ? "text-bull" : "text-bear"}`}>
                    {stats.net >= 0 ? "+" : ""}{stats.net.toFixed(2)}
                  </div>
                </div>
                <div className="flex-1 bg-[#131722] rounded p-1 hidden xl:block">
                  <div className="text-muted-foreground">Fator L.</div>
                  <div className={`font-bold ${stats.profitFactor > 1 ? "text-bull" : "text-bear"}`}>
                    {stats.profitFactor.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* right: order panel — narrower */}
        <div className="w-full lg:w-[260px] flex flex-col gap-2 shrink-0">
          {/* Market type selector */}
          <div className="panel p-2">
            <div className="text-[10px] uppercase text-muted-foreground mb-1">{isRobotPerformance ? "Conta" : "Tipo de Mercado"}</div>
            {isRobotPerformance ? (
              <div className="grid grid-cols-2 gap-1">
                <button onClick={() => useStore.getState().setTradingMode("demo")} className={`text-[10px] py-1.5 border rounded-sm ${tradingMode === "demo" ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>Conta Demo</button>
                <button onClick={() => useStore.getState().setTradingMode("real")} className={`text-[10px] py-1.5 border rounded-sm ${tradingMode === "real" ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>Conta Real</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1">
                <button onClick={() => useStore.getState().setMarketType("binary")} className={`text-[10px] py-1.5 border rounded-sm ${marketType === "binary" ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>Opções Binárias</button>
                <button onClick={() => useStore.getState().setMarketType("forex")} className={`text-[10px] py-1.5 border rounded-sm ${marketType === "forex" ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>Forex</button>
              </div>
            )}
          </div>

          {/* Automation mode */}
          <div className="panel p-2">
            <div className="text-[10px] uppercase text-muted-foreground mb-1">{isRobotPerformance ? "Automação do Robô" : "Automação"}</div>
            {isRobotPerformance ? (() => {
              const activeBot = robots.find(r => r.id === activeRobotId);
              const isInv = activeBot?.metaControl?.invert || false;
              return (
                <div className="flex items-center justify-between py-2 px-3 border rounded-sm border-border bg-black/20">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <RefreshCcw className={`h-3 w-3 ${isInv ? 'text-primary' : ''}`} /> Inverter Entradas
                  </span>
                  <button 
                    onClick={() => activeRobotId && useStore.getState().updateRobot(activeRobotId, { metaControl: { ...activeBot?.metaControl, active: activeBot?.metaControl?.active || false, balance: activeBot?.metaControl?.balance || 0, invert: !isInv } })}
                    className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none ${isInv ? 'bg-primary' : 'bg-secondary'}`}
                  >
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${isInv ? 'translate-x-4' : 'translate-x-1'}`} />
                  </button>
                </div>
              );
            })() : (
              <div className="grid grid-cols-3 gap-1">
                <button onClick={() => setAutomationMode("manual")} className={`text-[10px] py-1.5 border rounded-sm flex items-center justify-center gap-1 ${automationMode === "manual" ? "border-primary text-primary" : "border-border text-muted-foreground"}`}><Hand className="h-3 w-3" /> Manual</button>
                <button onClick={() => setAutomationMode("semi-auto")} className={`text-[10px] py-1.5 border rounded-sm flex items-center justify-center gap-1 ${automationMode === "semi-auto" ? "border-warning text-warning" : "border-border text-muted-foreground"}`}><BrainCircuit className="h-3 w-3" /> Semi</button>
                <button onClick={() => setAutomationMode("auto")} className={`text-[10px] py-1.5 border rounded-sm flex items-center justify-center gap-1 ${automationMode === "auto" ? "border-bull text-bull" : "border-border text-muted-foreground"}`}><Bot className="h-3 w-3" /> Auto</button>
              </div>
            )}
            {!isRobotPerformance && automationMode !== "manual" && (
              <div className="mt-1.5 text-[10px] text-warning border border-warning/30 rounded-sm p-1.5">
                {automationMode === "semi-auto" ? "⚡ Modo Semi-Auto: O script opera respeitando as zonas S/R." : "🤖 Modo Auto: Operações via Estratégia Ativa."}
              </div>
            )}
          </div>

          <div className="panel p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase text-muted-foreground">{isRobotPerformance ? "Painel de Ordem do Robô" : "Painel de Ordem"}</div>
              {latencyMs !== null && tradingMode !== "backtest" && (
                <div className={`text-[10px] ${latencyMs < 200 ? "text-bull" : latencyMs < 500 ? "text-warning" : "text-bear"}`}>
                  Ping: {latencyMs}ms
                </div>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground">Saldo {modeLabel}</div>
            {isRobotPerformance ? (() => {
               const activeBot = robots.find(r => r.id === activeRobotId);
               const metaBalance = 10000 + (activeBot?.metaControl?.balance || 0);
               return <div className="text-xl font-bold ticker text-primary glow-text mb-3">${metaBalance.toFixed(2)}</div>;
            })() : (
               <div className="text-xl font-bold ticker text-primary glow-text mb-3">${balance.toFixed(2)}</div>
            )}

            {marketType === "binary" ? (
              <>
                <label className="text-[10px] text-muted-foreground">Stake (USD)</label>
                <div className="flex items-center gap-1 mb-2">
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setStake((s) => Math.max(1, s - 1))}><Minus className="h-3 w-3" /></Button>
                  <Input value={stake} onChange={(e) => setStake(Number(e.target.value) || 0)} className="h-8 text-center ticker" />
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setStake((s) => s + 1)}><Plus className="h-3 w-3" /></Button>
                </div>

                <label className="text-[10px] text-muted-foreground">Duração (s)</label>
                <div className="grid grid-cols-5 gap-1 mb-3">
                  {[15, 30, 60, 300].map((d) => (
                    <button key={d} onClick={() => setDuration(d)} className={`text-[10px] py-1 border rounded-sm ${duration === d ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>{d}s</button>
                  ))}
                  <button
                    onClick={() => setDuration(-1)}
                    className={`text-[10px] py-1 border rounded-sm ${duration === -1 ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
                    title="Expira no fechamento da vela atual"
                  >
                    Fim Vela
                  </button>
                </div>

                <div className="text-[10px] text-muted-foreground mb-1">Retorno: <span className="text-foreground">+{risk.payout}%</span></div>

                {isRobotPerformance ? (() => {
                  const activeBot = robots.find(r => r.id === activeRobotId);
                  const isMetaActive = activeBot?.metaControl?.active || false;
                  return (
                  <>
                    <button
                      id="operate-btn-binary"
                      disabled={isMetaActive}
                      onClick={() => activeRobotId && useStore.getState().updateRobot(activeRobotId, { metaControl: { ...activeBot?.metaControl, active: true, invert: activeBot?.metaControl?.invert || false, balance: activeBot?.metaControl?.balance || 0 } })}
                      className="w-full mb-2 py-3 rounded-sm bg-bull text-primary-foreground font-bold uppercase tracking-wider hover:brightness-110 disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      <Play className="h-4 w-4 fill-current" /> OPERAR
                    </button>
                    <button
                      id="stop-btn-binary"
                      disabled={!isMetaActive}
                      onClick={() => activeRobotId && useStore.getState().updateRobot(activeRobotId, { metaControl: { ...activeBot?.metaControl, active: false, invert: activeBot?.metaControl?.invert || false, balance: activeBot?.metaControl?.balance || 0 } })}
                      className="w-full py-3 rounded-sm bg-bear text-destructive-foreground font-bold uppercase tracking-wider hover:brightness-110 disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      <Pause className="h-4 w-4 fill-current" /> PARAR
                    </button>
                  </>
                  );
                })() : (
                  <>
                    <button
                      disabled={blocked}
                      onClick={() => placeOrder("CALL")}
                      className="w-full mb-2 py-3 rounded-sm bg-bull text-primary-foreground font-bold uppercase tracking-wider hover:brightness-110 disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      <ArrowUp className="h-4 w-4" /> CALL · +${(stake * risk.payout / 100).toFixed(2)}
                    </button>
                    <button
                      disabled={blocked}
                      onClick={() => placeOrder("PUT")}
                      className="w-full py-3 rounded-sm bg-bear text-destructive-foreground font-bold uppercase tracking-wider hover:brightness-110 disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      <ArrowDown className="h-4 w-4" /> PUT · +${(stake * risk.payout / 100).toFixed(2)}
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                <label className="text-[10px] text-muted-foreground">Lot Size</label>
                <div className="flex items-center gap-1 mb-2">
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setLotSize((s) => Math.max(0.01, +(s - 0.01).toFixed(2)))}><Minus className="h-3 w-3" /></Button>
                  <Input value={lotSize} onChange={(e) => setLotSize(Number(e.target.value) || 0)} className="h-8 text-center ticker" />
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setLotSize((s) => +(s + 0.01).toFixed(2))}><Plus className="h-3 w-3" /></Button>
                </div>

                <label className="text-[10px] text-muted-foreground">Stop Loss (pips)</label>
                <div className="flex items-center gap-1 mb-2">
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setSlPips((s) => Math.max(1, s - 1))}><Minus className="h-3 w-3" /></Button>
                  <Input value={slPips} onChange={(e) => setSlPips(Number(e.target.value) || 0)} className="h-8 text-center ticker" />
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setSlPips((s) => s + 1)}><Plus className="h-3 w-3" /></Button>
                </div>

                <label className="text-[10px] text-muted-foreground">Take Profit (pips)</label>
                <div className="flex items-center gap-1 mb-3">
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setTpPips((s) => Math.max(1, s - 1))}><Minus className="h-3 w-3" /></Button>
                  <Input value={tpPips} onChange={(e) => setTpPips(Number(e.target.value) || 0)} className="h-8 text-center ticker" />
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setTpPips((s) => s + 1)}><Plus className="h-3 w-3" /></Button>
                </div>

                <div className="text-[10px] text-muted-foreground mb-1">Alavancagem: <span className="text-foreground">1:{forex.leverage}</span> · Spread: <span className="text-foreground">{forex.spread}p</span></div>

                {isRobotPerformance ? (() => {
                  const activeBot = robots.find(r => r.id === activeRobotId);
                  const isMetaActive = activeBot?.metaControl?.active || false;
                  return (
                  <>
                    <button
                      id="operate-btn-forex"
                      disabled={isMetaActive}
                      onClick={() => activeRobotId && useStore.getState().updateRobot(activeRobotId, { metaControl: { ...activeBot?.metaControl, active: true, invert: activeBot?.metaControl?.invert || false, balance: activeBot?.metaControl?.balance || 0 } })}
                      className="w-full mb-2 py-3 rounded-sm bg-bull text-primary-foreground font-bold uppercase tracking-wider hover:brightness-110 disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      <Play className="h-4 w-4 fill-current" /> OPERAR
                    </button>
                    <button
                      id="stop-btn-forex"
                      disabled={!isMetaActive}
                      onClick={() => activeRobotId && useStore.getState().updateRobot(activeRobotId, { metaControl: { ...activeBot?.metaControl, active: false, invert: activeBot?.metaControl?.invert || false, balance: activeBot?.metaControl?.balance || 0 } })}
                      className="w-full py-3 rounded-sm bg-bear text-destructive-foreground font-bold uppercase tracking-wider hover:brightness-110 disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      <Pause className="h-4 w-4 fill-current" /> PARAR
                    </button>
                  </>
                  );
                })() : (
                  <>
                    <button
                      disabled={blocked}
                      onClick={() => placeOrder("BUY")}
                      className="w-full mb-2 py-3 rounded-sm bg-bull text-primary-foreground font-bold uppercase tracking-wider hover:brightness-110 disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      <ArrowUp className="h-4 w-4" /> BUY
                    </button>
                    <button
                      disabled={blocked}
                      onClick={() => placeOrder("SELL")}
                      className="w-full py-3 rounded-sm bg-bear text-destructive-foreground font-bold uppercase tracking-wider hover:brightness-110 disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      <ArrowDown className="h-4 w-4" /> SELL
                    </button>
                  </>
                )}
              </>
            )}

            {blocked && (
              <div className="mt-2 text-[10px] text-warning border border-warning/40 p-2 rounded-sm">
                ⚠ Bloqueado por gestão de risco ({lossStreak} perdas / {winStreak} vitórias seguidas)
              </div>
            )}
          </div>

          <div className="panel p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase text-muted-foreground">Linhas e Zonas S/R ({asset.symbol})</div>
              <div className="flex gap-1">
                <button
                  onClick={() => setDraw(draw === "support" ? null : "support")}
                  className={`p-1 rounded border transition-colors ${draw === "support" ? "bg-bull border-bull text-white" : "border-border text-muted-foreground hover:bg-bull/10"}`}
                  title="Traçar Suporte"
                >
                  <TrendingUp className="h-3 w-3" />
                </button>
                <button
                  onClick={() => setDraw(draw === "resistance" ? null : "resistance")}
                  className={`p-1 rounded border transition-colors ${draw === "resistance" ? "bg-bear border-bear text-white" : "border-border text-muted-foreground hover:bg-bear/10"}`}
                  title="Traçar Resistência"
                >
                  <TrendingDown className="h-3 w-3" />
                </button>
                <button
                  onClick={() => setDraw(draw === "buy_zone" ? null : "buy_zone")}
                  className={`p-1 rounded border transition-colors ${draw === "buy_zone" ? "bg-bull border-bull text-white" : "border-border text-muted-foreground hover:bg-bull/10"}`}
                  title="Traçar Zona de Compra"
                >
                  <div className="w-3 h-2 border border-current rounded-sm" />
                </button>
                <button
                  onClick={() => setDraw(draw === "sell_zone" ? null : "sell_zone")}
                  className={`p-1 rounded border transition-colors ${draw === "sell_zone" ? "bg-bear border-bear text-white" : "border-border text-muted-foreground hover:bg-bear/10"}`}
                  title="Traçar Zona de Venda"
                >
                  <div className="w-3 h-2 border border-current rounded-sm" />
                </button>
                <div className="w-px h-4 bg-border mx-0.5 self-center" />
                <button
                  onClick={() => {
                    if (window.confirm("Apagar TODOS os traçados de TODOS os ativos?")) {
                      useStore.getState().clearAllSR();
                    }
                  }}
                  className="p-1 rounded border border-border text-muted-foreground hover:bg-destructive/20 hover:text-destructive hover:border-destructive transition-colors"
                  title="Apagar traçados de TODOS os ativos"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
            <div className="space-y-1 max-h-48 overflow-auto border-t border-border/30 pt-2">
              {srLines.filter((l) => l.asset === asset.symbol).map((l) => (
                <div key={l.id} className="flex justify-between items-center group text-[11px] ticker">
                  <div className="flex items-center gap-1">
                    <span className={l.kind === "support" ? "text-bull" : "text-bear"}>{l.kind === "support" ? "SUP" : "RES"}</span>
                    <span>{l.price.toFixed(asset.type === "forex" ? 5 : 2)}</span>
                  </div>
                  <button
                    onClick={() => useStore.getState().removeSR(l.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {srZones.filter((z) => z.asset === asset.symbol).map((z) => (
                <div key={z.id} className="flex justify-between items-center group text-[11px] ticker border-t border-border/10 pt-1">
                  <div className="flex items-center gap-1">
                    <span className={z.kind === "buy_zone" ? "text-bull" : "text-bear"}>{z.kind === "buy_zone" ? "ZONA-C" : "ZONA-V"}</span>
                    <span>{z.bottomPrice.toFixed(2)} - {z.topPrice.toFixed(2)}</span>
                  </div>
                  <button
                    onClick={() => useStore.getState().removeSRZone(z.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {(srLines.filter((l) => l.asset === asset.symbol).length === 0 && srZones.filter((z) => z.asset === asset.symbol).length === 0) && (
                <div className="text-[10px] text-muted-foreground italic text-center py-2">Sem traçados ativos.</div>
              )}
            </div>
          </div>

          <div className="panel p-3 text-[11px]">
            <div className="text-[10px] uppercase text-muted-foreground mb-2">{isRobotPerformance ? "Gestão Ativa do Robô" : "Gestão Ativa"}</div>
            <div className="flex justify-between"><span>Stop Loss</span><span className="text-bear">${risk.stopLoss}</span></div>
            <div className="flex justify-between"><span>Take Profit</span><span className="text-bull">${risk.takeProfit}</span></div>
            <div className="flex justify-between"><span>Parar após perdas</span><span>{risk.stopAfterLosses}</span></div>
            <div className="flex justify-between"><span>Martingale</span><span>{risk.martingale ? "ON" : "OFF"}</span></div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
