import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { useStore, type Trade } from "@/lib/store";
import { classifyTradeWick, WICK_CLASSIFICATIONS } from "@/lib/candleWick";
import { toast } from "sonner";
import { ChevronDown, RefreshCw, TrendingUp, TrendingDown, EyeOff, Filter, RotateCcw } from "lucide-react";

export type RangeAction = "none" | "hide" | "invert_all" | "invert_buy" | "invert_sell";

function getTradeEffectiveState(
  t: Trade,
  rangeActions: Record<string, Record<string, RangeAction>>,
  selectedWhatIf: string | null
): { result: "WIN" | "LOSS" | "OPEN"; pnl: number; isFlipped: boolean } {
  const rawResult = (selectedWhatIf ? t.customStats?.[selectedWhatIf] : t.result) as "WIN" | "LOSS" | "OPEN";
  const rawPnl = selectedWhatIf ? 0 : (t.pnl ?? 0);

  if (rawResult !== "WIN" && rawResult !== "LOSS") {
    return { result: rawResult, pnl: rawPnl, isFlipped: false };
  }

  const isBuy = t.type === "CALL" || t.type === "BUY";
  let flipCount = 0;

  for (const [key, map] of Object.entries(rangeActions)) {
    if (!map) continue;
    const bucket = getTradeBucketForKey(t, key);
    const action = map[bucket];
    if (!action || action === "none" || action === "hide") continue;

    if (action === "invert_all") {
      flipCount++;
    } else if (action === "invert_buy" && isBuy) {
      flipCount++;
    } else if (action === "invert_sell" && !isBuy) {
      flipCount++;
    }
  }

  if (flipCount % 2 === 1) {
    const flippedResult = rawResult === "WIN" ? "LOSS" : "WIN";
    const flippedPnl = -rawPnl;
    return { result: flippedResult, pnl: flippedPnl, isFlipped: true };
  }

  return { result: rawResult, pnl: rawPnl, isFlipped: false };
}

const RSI_BANDS = ["0-10", "10-20", "20-30", "30-40", "40-50", "50-60", "60-70", "70-80", "80-90", "90-100"];
function getRsiBucket(rsi?: number) {
  if (rsi == null) return "N/A";
  if (rsi < 10) return "0-10";
  if (rsi < 20) return "10-20";
  if (rsi < 30) return "20-30";
  if (rsi < 40) return "30-40";
  if (rsi < 50) return "40-50";
  if (rsi < 60) return "50-60";
  if (rsi < 70) return "60-70";
  if (rsi < 80) return "70-80";
  if (rsi < 90) return "80-90";
  return "90-100";

}

const ADX_BANDS = ["<20 (Weak)", "20-25", "25-30", "30-40", ">40 (Strong)"];
function getAdxBucket(adx?: number) {
  if (adx == null) return "N/A";
  if (adx < 20) return "<20 (Weak)";
  if (adx < 25) return "20-25";
  if (adx < 30) return "25-30";
  if (adx < 40) return "30-40";
  return ">40 (Strong)";
}

const MACD_BANDS = ["Bullish (Hist > 0)", "Bearish (Hist < 0)"];
function getMacdBucket(hist?: number) {
  if (hist == null) return "N/A";
  return hist > 0 ? "Bullish (Hist > 0)" : "Bearish (Hist < 0)";
}

const MA_TREND_BANDS = [
  "Strong Bullish (> all MAs)", 
  "Bullish (>21, >200)", 
  "Bearish (<21, <200)", 
  "Strong Bearish (< all MAs)", 
  "Ranging/Mixed"
];
function getMaTrendBucket(entry: number, m9?: number, m21?: number, m200?: number, m235?: number) {
  if (m9 == null || m21 == null || m200 == null) return "N/A";
  const aboveAll = entry > m9 && entry > m21 && entry > m200 && (!m235 || (entry > m235));
  const belowAll = entry < m9 && entry < m21 && entry < m200 && (!m235 || (entry < m235));
  if (aboveAll) return "Strong Bullish (> all MAs)";
  if (belowAll) return "Strong Bearish (< all MAs)";
  if (entry > m21 && entry > m200) return "Bullish (>21, >200)";
  if (entry < m21 && entry < m200) return "Bearish (<21, <200)";
  return "Ranging/Mixed";
}

const SAR_TREND_BANDS = [
  "SAR: Fortemente Altista (Preço > SAR > 1%)",
  "SAR: Altista (Preço > SAR)",
  "SAR: Baixista (Preço < SAR)",
  "SAR: Fortemente Baixista (Preço < SAR < -1%)"
];
function getSarBucket(entry: number, sar?: number) {
  if (sar == null) return "N/A";
  const dist = (entry - sar) / entry * 100;
  if (dist > 1) return "SAR: Fortemente Altista (Preço > SAR > 1%)";
  if (dist > 0) return "SAR: Altista (Preço > SAR)";
  if (dist < -1) return "SAR: Fortemente Baixista (Preço < SAR < -1%)";
  return "SAR: Baixista (Preço < SAR)";
}

function getPatternBucket(pattern?: string) {
  return pattern || "Sem Padrão";
}

const WILLIAMS_BANDS = ["Oversold (<= -80)", "Neutral (-80 a -20)", "Overbought (>= -20)"];
function getWilliamsBucket(w?: number) {
  if (w == null) return "N/A";
  if (w <= -80) return "Oversold (<= -80)";
  if (w > -80 && w < -20) return "Neutral (-80 a -20)";
  return "Overbought (>= -20)";
}

const ATR_BANDS = ["Low Vol (< 0.03%)", "Medium Vol (0.03% - 0.1%)", "High Vol (> 0.1%)"];
function getAtrBucket(atr?: number, entry?: number) {
  if (atr == null || entry == null || entry === 0) return "N/A";
  const pct = (atr / entry) * 100;
  if (pct < 0.03) return "Low Vol (< 0.03%)";
  if (pct < 0.1) return "Medium Vol (0.03% - 0.1%)";
  return "High Vol (> 0.1%)";
}

function getTrendRelation(t: Trade): 'a_favor' | 'contra' | 'indeterminado' {
  const sh = (t.snapshot || {}) as Record<string, any>;
  const entry = t.entry;
  if (entry == null) return 'indeterminado';

  const isBuy = t.type === 'CALL' || t.type === 'BUY';

  // 1. Check ma21
  if (sh.ma21 != null) {
    const isBull = entry > sh.ma21;
    return isBuy === isBull ? 'a_favor' : 'contra';
  }
  // 2. Check ma200
  if (sh.ma200 != null) {
    const isBull = entry > sh.ma200;
    return isBuy === isBull ? 'a_favor' : 'contra';
  }
  // 3. Check sar
  if (sh.sar != null) {
    const isBull = entry > sh.sar;
    return isBuy === isBull ? 'a_favor' : 'contra';
  }
  return 'indeterminado';
}

function getCandleSize(t: Trade) {
  const sh = (t.snapshot || {}) as Record<string, any>;
  return (sh.candleSize as string) || "N/A";
}

function getPreEntryMomentum(t: Trade) {
  const sh = (t.snapshot || {}) as Record<string, any>;
  return (sh.preEntryMomentum as string) || "N/A";
}

function getBollingerState(t: Trade) {
  const sh = (t.snapshot || {}) as Record<string, any>;
  return (sh.bollingerState as string) || "N/A";
}

function getIndicatorCrossover(t: Trade) {
  const sh = (t.snapshot || {}) as Record<string, any>;
  if (sh.indicatorCrossover) return sh.indicatorCrossover as string;
  const s9 = sh.ma9 as number | undefined;
  const s21 = sh.ma21 as number | undefined;
  if (s9 != null && s21 != null) {
    return s9 > s21 ? "Alinhamento de Alta (9 > 21)" : "Alinhamento de Baixa (9 < 21)";
  }
  return "N/A";
}

function getMarketStructure(t: Trade) {
  const sh = (t.snapshot || {}) as Record<string, any>;
  return (sh.marketStructure as string) || "Oscilação";
}

const SEQUENCE_WAVE_BANDS = ["Sequência #1", "Sequência #2", "Sequência #3", "Sequência #4", "Sequência #5"];
function getSequenceWave(t: Trade): string {
  const setupTipo = t.customStats?.setupTipo;
  if (!setupTipo || !String(setupTipo).startsWith("Sequência")) return "Sem Sequência";
  const match = String(setupTipo).match(/#(\d+)/);
  if (!match) return "Sem Sequência";
  const num = parseInt(match[1], 10);
  if (num > 5) return "Sequência #5+";
  return `Sequência #${num}`;
}

// --- Streak/block calculation (shared by single and combo groups) ---
function calculateStreaksForGroup(
  record: Record<string, Trade[]>,
  selectedWhatIf: string | null,
  rangeActions: Record<string, Record<string, RangeAction>> = {}
) {
  return Object.entries(record).map(([name, tradesList]) => {
    const chronological = [...tradesList].sort((a, b) => (a.ts || 0) - (b.ts || 0));

    let currentWinStreak = 0;
    let currentLossStreak = 0;
    const winStreaks: number[] = [];
    const lossStreaks: number[] = [];
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let wins = 0;

    chronological.forEach(t => {
      const eff = getTradeEffectiveState(t, rangeActions, selectedWhatIf);
      const res = eff.result;
      if (res === "WIN") {
        wins++;
        if (currentLossStreak > 0) {
          lossStreaks.push(currentLossStreak);
          currentLossStreak = 0;
        }
        currentWinStreak++;
        if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak;
      } else if (res === "LOSS") {
        if (currentWinStreak > 0) {
          winStreaks.push(currentWinStreak);
          currentWinStreak = 0;
        }
        currentLossStreak++;
        if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
      }
    });

    if (currentWinStreak > 0) winStreaks.push(currentWinStreak);
    if (currentLossStreak > 0) lossStreaks.push(currentLossStreak);

    const avgWinStreak = winStreaks.length > 0 ? winStreaks.reduce((a, b) => a + b, 0) / winStreaks.length : 0;
    const avgLossStreak = lossStreaks.length > 0 ? lossStreaks.reduce((a, b) => a + b, 0) / lossStreaks.length : 0;

    return {
      name,
      trades: tradesList.length,
      wins,
      wr: tradesList.length ? (wins / tradesList.length) * 100 : 0,
      maxWinStreak,
      maxLossStreak,
      avgWinStreak,
      avgLossStreak
    };
  }).sort((a, b) => b.trades - a.trades);
}

// --- Composite key functions for indicator combinations ---
function getAssetRsiKey(t: Trade): string {
  const sh = (t.snapshot || {}) as Record<string, any>;
  const asset = t.asset || "Outros";
  const rsi = getRsiBucket(sh.rsi as number);
  return `${asset} | RSI ${rsi}`;
}
function getAssetStructureKey(t: Trade): string {
  const asset = t.asset || "Outros";
  const struct = getMarketStructure(t);
  return `${asset} | ${struct}`;
}
function getRsiStructureKey(t: Trade): string {
  const sh = (t.snapshot || {}) as Record<string, any>;
  const rsi = getRsiBucket(sh.rsi as number);
  const struct = getMarketStructure(t);
  return `RSI ${rsi} | ${struct}`;
}
function getBollingerCrossoverKey(t: Trade): string {
  const bState = getBollingerState(t);
  const cross = getIndicatorCrossover(t);
  return `${bState} | ${cross}`;
}
function getAssetRsiStructureKey(t: Trade): string {
  const sh = (t.snapshot || {}) as Record<string, any>;
  const asset = t.asset || "Outros";
  const rsi = getRsiBucket(sh.rsi as number);
  const struct = getMarketStructure(t);
  return `${asset} | RSI ${rsi} | ${struct}`;
}
function getRsiBollingerCrossoverKey(t: Trade): string {
  const sh = (t.snapshot || {}) as Record<string, any>;
  const rsi = getRsiBucket(sh.rsi as number);
  const bState = getBollingerState(t);
  const cross = getIndicatorCrossover(t);
  return `RSI ${rsi} | ${bState} | ${cross}`;
}
function getStrategyRsiStructureKey(t: Trade): string {
  const sh = (t.snapshot || {}) as Record<string, any>;
  const strat = t.strategyId || "Manual";
  const rsi = getRsiBucket(sh.rsi as number);
  const struct = getMarketStructure(t);
  return `${strat} | RSI ${rsi} | ${struct}`;
}
function getAssetStructureCrossoverKey(t: Trade): string {
  const asset = t.asset || "Outros";
  const struct = getMarketStructure(t);
  const cross = getIndicatorCrossover(t);
  return `${asset} | ${struct} | ${cross}`;
}

type Filters = {
  asset: string | null;
  strategy: string | null;
  type: string | null;
  rsi: string | null;
  adx: string | null;
  macd: string | null;
  maTrend: string | null;
  pattern: string | null;
  timeframe: string | null;
  sar: string | null;
  atr: string | null;
  williams: string | null;
  fibLevel: string | null;
  pivotLevel: string | null;
  marketMoment: string | null;
  candleSize: string | null;
  preEntryMomentum: string | null;
  bollingerState: string | null;
  indicatorCrossover: string | null;
  marketStructure: string | null;
  wick: string | null;
  sequenceWave: string | null;
  hour: string | null;
  [key: string]: string | null; // Allow dynamic strategy-defined filters
};

function getTradeBucketForKey(t: Trade, key: string): string {
  const sh = (t.snapshot || {}) as Record<string, any>;
  switch (key) {
    case "asset": return t.asset || "Outros";
    case "strategy": return t.strategyId || "Manual";
    case "type": return (t.type === "CALL" || t.type === "BUY") ? "BUY" : "SELL";
    case "rsi": return getRsiBucket(sh.rsi as number);
    case "adx": return getAdxBucket(sh.adx as number);
    case "macd": return getMacdBucket(sh.histogram as number);
    case "maTrend": return getMaTrendBucket(t.entry, sh.ma9 as number, sh.ma21 as number, sh.ma200 as number, sh.ma235 as number);
    case "pattern": return getPatternBucket(sh.pattern as string);
    case "timeframe": return t.timeframe || "1m";
    case "sar": return getSarBucket(t.entry, sh.sar as number);
    case "atr": return getAtrBucket(sh.atr as number, t.entry);
    case "williams": return getWilliamsBucket(sh.williams as number);
    case "fibLevel": return (sh.fibLevel ?? "N/A") as string;
    case "pivotLevel": return (sh.pivotLevel ?? "N/A") as string;
    case "marketMoment": return (sh.marketMoment ?? "N/A") as string;
    case "candleSize": return getCandleSize(t);
    case "preEntryMomentum": return getPreEntryMomentum(t);
    case "bollingerState": return getBollingerState(t);
    case "indicatorCrossover": return getIndicatorCrossover(t);
    case "marketStructure": return getMarketStructure(t);
    case "wick": return classifyTradeWick(t);
    case "sequenceWave": return getSequenceWave(t);
    case "hour": {
      const h = new Date(t.ts || Date.now()).getHours();
      return `${String(h).padStart(2, "0")}:00`;
    }
    default: return String(t.customStats?.[key] ?? "N/A");
  }
}

export default function Stats() {
  const navigate = useNavigate();
  const { trades, tradingMode, activeStrategyId, setTimeframe } = useStore();
  const [modeFilter, setModeFilter] = useState<"all" | "backtest" | "demo" | "real">(tradingMode);
  const [f, setF] = useState<Filters>({
    asset: null,
    strategy: tradingMode === "backtest" ? (activeStrategyId || null) : null,
    type: null, rsi: null, adx: null, macd: null, maTrend: null, pattern: null, timeframe: null, sar: null,
    atr: null, williams: null, fibLevel: null, pivotLevel: null, marketMoment: null,
    candleSize: null, preEntryMomentum: null, bollingerState: null, indicatorCrossover: null, marketStructure: null,
    wick: null, sequenceWave: null, hour: null
  });
  const [rangeActions, setRangeActions] = useState<Record<string, Record<string, RangeAction>>>({});

  const [selectedWhatIf, setSelectedWhatIf] = useState<string | null>(null);
  const [streakTab, setStreakTab] = useState<"assets" | "strategies" | "rsi" | "bollinger" | "crossover" | "structure">("assets");
  const [comboMode, setComboMode] = useState<"simple" | "duo" | "trio">("simple");
  const [comboTab, setComboTab] = useState<string>("asset_rsi");

  // Synchronize dynamic filter with changes in the global store mode
  useEffect(() => {
    setModeFilter(tradingMode);
  }, [tradingMode]);

  // Handle strategy default filtering logic based on modeFilter context
  useEffect(() => {
    if (modeFilter === "backtest") {
      setF(prev => ({ ...prev, strategy: activeStrategyId || null }));
    } else {
      setF(prev => ({ ...prev, strategy: null }));
    }
  }, [modeFilter, activeStrategyId]);

  const setRangeAction = (key: string, val: string, action: RangeAction) => {
    setRangeActions(prev => {
      const keyMap = { ...(prev[key] || {}) };
      if (action === "none") {
        delete keyMap[val];
      } else {
        keyMap[val] = action;
      }
      return { ...prev, [key]: keyMap };
    });
    if (action === "hide" && f[key] === val) {
      setF(prev => ({ ...prev, [key]: null }));
    }
  };

  const excludedF = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const [key, mapActions] of Object.entries(rangeActions)) {
      const hiddenList = Object.entries(mapActions)
        .filter(([_, act]) => act === "hide")
        .map(([val]) => val);
      if (hiddenList.length > 0) {
        map[key] = hiddenList;
      }
    }
    return map;
  }, [rangeActions]);

  const activeInversions = useMemo(() => {
    const list: { key: string; val: string; action: RangeAction }[] = [];
    for (const [key, mapActions] of Object.entries(rangeActions)) {
      for (const [val, act] of Object.entries(mapActions)) {
        if (act === "invert_all" || act === "invert_buy" || act === "invert_sell") {
          list.push({ key, val, action: act });
        }
      }
    }
    return list;
  }, [rangeActions]);

  const toggleFilter = (key: string, val: string) => {
    setF(prev => ({ ...prev, [key]: prev[key] === val ? null : val }));
  };

  const toggleExcludeFilter = (key: string, val: string) => {
    const currentAction = rangeActions[key]?.[val];
    setRangeAction(key, val, currentAction === "hide" ? "none" : "hide");
  };

  const clearAllFilters = () => {
    setF({
      asset: null,
      strategy: modeFilter === "backtest" ? (activeStrategyId || null) : null,
      type: null, rsi: null, adx: null, macd: null, maTrend: null, pattern: null, timeframe: null, sar: null,
      atr: null, williams: null, fibLevel: null, pivotLevel: null, marketMoment: null,
      candleSize: null, preEntryMomentum: null, bollingerState: null, indicatorCrossover: null, marketStructure: null,
      wick: null, sequenceWave: null, hour: null
    });
    setRangeActions({});
    toast.info("Todos os filtros e inversões foram limpos");
  };

  // First filter by mode, THEN apply granular filters
  const modeFilteredTrades = useMemo(() => {
    if (modeFilter === "all") return trades;
    return trades.filter(t => t.mode === modeFilter);
  }, [trades, modeFilter]);

  const filtered = useMemo(() => {
    return modeFilteredTrades.filter((t) => {
      // Positive filters check
      for (const [key, filterValue] of Object.entries(f)) {
        if (!filterValue) continue;
        const bucket = getTradeBucketForKey(t, key);
        if (bucket !== filterValue) return false;
      }

      // Excluded/hidden filters check
      for (const [key, mapActions] of Object.entries(rangeActions)) {
        if (!mapActions) continue;
        const bucket = getTradeBucketForKey(t, key);
        if (mapActions[bucket] === "hide") return false;
      }

      return true;
    });
  }, [modeFilteredTrades, f, rangeActions]);

  const totals = useMemo(() => {
    let closed = filtered.filter(t => t.result === "WIN" || t.result === "LOSS");
    if (selectedWhatIf) {
      closed = closed.filter(t => t.customStats && (t.customStats[selectedWhatIf] === "WIN" || t.customStats[selectedWhatIf] === "LOSS"));
    }

    let wins = 0;
    let losses = 0;
    let pnl = 0;
    let buyWins = 0;
    let sellWins = 0;
    const buyTrades: Trade[] = [];
    const sellTrades: Trade[] = [];

    closed.forEach(t => {
      const eff = getTradeEffectiveState(t, rangeActions, selectedWhatIf);
      if (eff.result === "WIN") wins++;
      if (eff.result === "LOSS") losses++;
      pnl += eff.pnl;

      const isBuy = t.type === "CALL" || t.type === "BUY";
      if (isBuy) {
        buyTrades.push(t);
        if (eff.result === "WIN") buyWins++;
      } else {
        sellTrades.push(t);
        if (eff.result === "WIN") sellWins++;
      }
    });

    const buyWr = buyTrades.length ? (buyWins / buyTrades.length) * 100 : 0;
    const sellWr = sellTrades.length ? (sellWins / sellTrades.length) * 100 : 0;

    // --- SEQUENCES / STREAKS CALCULATION ---
    const chronological = [...closed].sort((a, b) => (a.ts || 0) - (b.ts || 0));
    
    let currentWinStreak = 0;
    let currentLossStreak = 0;
    const winStreaks: number[] = [];
    const lossStreaks: number[] = [];
    
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    
    chronological.forEach(t => {
      const eff = getTradeEffectiveState(t, rangeActions, selectedWhatIf);
      const res = eff.result;
      if (res === "WIN") {
        if (currentLossStreak > 0) {
          lossStreaks.push(currentLossStreak);
          currentLossStreak = 0;
        }
        currentWinStreak++;
        if (currentWinStreak > maxWinStreak) {
          maxWinStreak = currentWinStreak;
        }
      } else if (res === "LOSS") {
        if (currentWinStreak > 0) {
          winStreaks.push(currentWinStreak);
          currentWinStreak = 0;
        }
        currentLossStreak++;
        if (currentLossStreak > maxLossStreak) {
          maxLossStreak = currentLossStreak;
        }
      }
    });
    
    if (currentWinStreak > 0) {
      winStreaks.push(currentWinStreak);
    }
    if (currentLossStreak > 0) {
      lossStreaks.push(currentLossStreak);
    }
    
    const avgWinStreak = winStreaks.length > 0
      ? winStreaks.reduce((a, b) => a + b, 0) / winStreaks.length
      : 0;
      
    const avgLossStreak = lossStreaks.length > 0
      ? lossStreaks.reduce((a, b) => a + b, 0) / lossStreaks.length
      : 0;

    // --- FINANCIAL DRAWDOWN ---
    let runningPnl = 0;
    let peakPnl = 0;
    let maxDrawdown = 0;
    
    chronological.forEach(t => {
      const eff = getTradeEffectiveState(t, rangeActions, selectedWhatIf);
      runningPnl += eff.pnl;
      if (runningPnl > peakPnl) {
        peakPnl = runningPnl;
      }
      const dd = peakPnl - runningPnl;
      if (dd > maxDrawdown) {
        maxDrawdown = dd;
      }
    });

    // --- TREND PERFORMANCE ---
    let trendFavCount = 0;
    let trendFavWins = 0;
    let trendContraCount = 0;
    let trendContraWins = 0;
    
    closed.forEach(t => {
      const relation = getTrendRelation(t);
      const eff = getTradeEffectiveState(t, rangeActions, selectedWhatIf);
      const isWin = eff.result === "WIN";
      if (relation === 'a_favor') {
        trendFavCount++;
        if (isWin) trendFavWins++;
      } else if (relation === 'contra') {
        trendContraCount++;
        if (isWin) trendContraWins++;
      }
    });
    
    const trendFavWr = trendFavCount > 0 ? (trendFavWins / trendFavCount) * 100 : 0;
    const trendContraWr = trendContraCount > 0 ? (trendContraWins / trendContraCount) * 100 : 0;
    
    return {
      trades: closed.length,
      wins,
      losses,
      pnl,
      wr: closed.length ? (wins / closed.length) * 100 : 0,
      buyCount: buyTrades.length,
      sellCount: sellTrades.length,
      buyWins,
      sellWins,
      buyWr,
      sellWr,
      buyPnl: buyTrades.reduce((a, t) => a + getTradeEffectiveState(t, rangeActions, selectedWhatIf).pnl, 0),
      sellPnl: sellTrades.reduce((a, t) => a + getTradeEffectiveState(t, rangeActions, selectedWhatIf).pnl, 0),
      // streak stats
      maxWinStreak,
      maxLossStreak,
      avgWinStreak,
      avgLossStreak,
      // drawdown stats
      maxDrawdown,
      // trend stats
      trendFavCount,
      trendFavWins,
      trendContraCount,
      trendContraWins,
      trendFavWr,
      trendContraWr,
    };
  }, [filtered, selectedWhatIf, rangeActions]);

  const blockStatsByGroup = useMemo(() => {
    const groups = {
      assets: {} as Record<string, Trade[]>,
      strategies: {} as Record<string, Trade[]>,
      rsi: {} as Record<string, Trade[]>,
      bollinger: {} as Record<string, Trade[]>,
      crossover: {} as Record<string, Trade[]>,
      structure: {} as Record<string, Trade[]>
    };

    let closed = filtered.filter(t => t.result === "WIN" || t.result === "LOSS");
    if (selectedWhatIf) {
      closed = closed.filter(t => t.customStats && (t.customStats[selectedWhatIf] === "WIN" || t.customStats[selectedWhatIf] === "LOSS"));
    }

    closed.forEach(t => {
      // 1. Asset
      const asset = t.asset || "Outros";
      if (!groups.assets[asset]) groups.assets[asset] = [];
      groups.assets[asset].push(t);

      // 2. Strategy
      const strat = t.strategyId || "Manual";
      if (!groups.strategies[strat]) groups.strategies[strat] = [];
      groups.strategies[strat].push(t);

      // 3. RSI
      const sh = (t.snapshot || {}) as Record<string, any>;
      const rsiVal = getRsiBucket(sh.rsi as number);
      if (!groups.rsi[rsiVal]) groups.rsi[rsiVal] = [];
      groups.rsi[rsiVal].push(t);

      // 4. Bollinger Squeeze State
      const bState = getBollingerState(t);
      if (!groups.bollinger[bState]) groups.bollinger[bState] = [];
      groups.bollinger[bState].push(t);

      // 5. Crossover
      const cross = getIndicatorCrossover(t);
      if (!groups.crossover[cross]) groups.crossover[cross] = [];
      groups.crossover[cross].push(t);

      // 6. Market Structure
      const struct = getMarketStructure(t);
      if (!groups.structure[struct]) groups.structure[struct] = [];
      groups.structure[struct].push(t);
    });

    return {
      assets: calculateStreaksForGroup(groups.assets, selectedWhatIf, rangeActions),
      strategies: calculateStreaksForGroup(groups.strategies, selectedWhatIf, rangeActions),
      rsi: calculateStreaksForGroup(groups.rsi, selectedWhatIf, rangeActions),
      bollinger: calculateStreaksForGroup(groups.bollinger, selectedWhatIf, rangeActions),
      crossover: calculateStreaksForGroup(groups.crossover, selectedWhatIf, rangeActions),
      structure: calculateStreaksForGroup(groups.structure, selectedWhatIf, rangeActions)
    };
  }, [filtered, selectedWhatIf, rangeActions]);

  const comboBlockStatsByGroup = useMemo(() => {
    const groups: Record<string, Record<string, Trade[]>> = {
      asset_rsi: {},
      asset_structure: {},
      rsi_structure: {},
      bollinger_crossover: {},
      asset_rsi_structure: {},
      rsi_bollinger_crossover: {},
      strategy_rsi_structure: {},
      asset_structure_crossover: {}
    };

    let closed = filtered.filter(t => t.result === "WIN" || t.result === "LOSS");
    if (selectedWhatIf) {
      closed = closed.filter(t => t.customStats && (t.customStats[selectedWhatIf] === "WIN" || t.customStats[selectedWhatIf] === "LOSS"));
    }

    closed.forEach(t => {
      // --- 2-indicator combos ---
      const ar = getAssetRsiKey(t);
      if (!groups.asset_rsi[ar]) groups.asset_rsi[ar] = [];
      groups.asset_rsi[ar].push(t);

      const as = getAssetStructureKey(t);
      if (!groups.asset_structure[as]) groups.asset_structure[as] = [];
      groups.asset_structure[as].push(t);

      const rs = getRsiStructureKey(t);
      if (!groups.rsi_structure[rs]) groups.rsi_structure[rs] = [];
      groups.rsi_structure[rs].push(t);

      const bc = getBollingerCrossoverKey(t);
      if (!groups.bollinger_crossover[bc]) groups.bollinger_crossover[bc] = [];
      groups.bollinger_crossover[bc].push(t);

      // --- 3-indicator combos ---
      const ars = getAssetRsiStructureKey(t);
      if (!groups.asset_rsi_structure[ars]) groups.asset_rsi_structure[ars] = [];
      groups.asset_rsi_structure[ars].push(t);

      const rbc = getRsiBollingerCrossoverKey(t);
      if (!groups.rsi_bollinger_crossover[rbc]) groups.rsi_bollinger_crossover[rbc] = [];
      groups.rsi_bollinger_crossover[rbc].push(t);

      const srs = getStrategyRsiStructureKey(t);
      if (!groups.strategy_rsi_structure[srs]) groups.strategy_rsi_structure[srs] = [];
      groups.strategy_rsi_structure[srs].push(t);

      const asc = getAssetStructureCrossoverKey(t);
      if (!groups.asset_structure_crossover[asc]) groups.asset_structure_crossover[asc] = [];
      groups.asset_structure_crossover[asc].push(t);
    });

    return {
      asset_rsi: calculateStreaksForGroup(groups.asset_rsi, selectedWhatIf, rangeActions),
      asset_structure: calculateStreaksForGroup(groups.asset_structure, selectedWhatIf, rangeActions),
      rsi_structure: calculateStreaksForGroup(groups.rsi_structure, selectedWhatIf, rangeActions),
      bollinger_crossover: calculateStreaksForGroup(groups.bollinger_crossover, selectedWhatIf, rangeActions),
      asset_rsi_structure: calculateStreaksForGroup(groups.asset_rsi_structure, selectedWhatIf, rangeActions),
      rsi_bollinger_crossover: calculateStreaksForGroup(groups.rsi_bollinger_crossover, selectedWhatIf, rangeActions),
      strategy_rsi_structure: calculateStreaksForGroup(groups.strategy_rsi_structure, selectedWhatIf, rangeActions),
      asset_structure_crossover: calculateStreaksForGroup(groups.asset_structure_crossover, selectedWhatIf, rangeActions)
    };
  }, [filtered, selectedWhatIf, rangeActions]);

  function buildStats(extractor: (t: Trade) => string, possibleBuckets?: string[]) {
    const m: Record<string, { trades: number; pnl: number; wins: number; typeWins: Record<string, number>; typeTrades: Record<string, number> }> = {};
    if (possibleBuckets) {
      possibleBuckets.forEach(b => m[b] = { trades: 0, pnl: 0, wins: 0, typeWins: {}, typeTrades: {} });
    }
    filtered.forEach((t) => {
      const eff = getTradeEffectiveState(t, rangeActions, selectedWhatIf);
      if (eff.result !== "WIN" && eff.result !== "LOSS") return;

      const k = extractor(t);
      if (!m[k]) m[k] = { trades: 0, pnl: 0, wins: 0, typeWins: {}, typeTrades: {} };
      m[k].trades++;
      m[k].pnl += eff.pnl;
      if (eff.result === "WIN") m[k].wins++;

      const typeStr = t.type === "CALL" || t.type === "BUY" ? "BUY" : "SELL";
      m[k].typeTrades[typeStr] = (m[k].typeTrades[typeStr] || 0) + 1;
      if (eff.result === "WIN") {
        m[k].typeWins[typeStr] = (m[k].typeWins[typeStr] || 0) + 1;
      }
    });

    return Object.entries(m)
      .map(([k, v]) => ({ 
        label: k, 
        ...v, 
        wr: v.trades ? (v.wins / v.trades) * 100 : 0 ,
        wrBuy: v.typeTrades["BUY"] ? (v.typeWins["BUY"] || 0) / v.typeTrades["BUY"] * 100 : 0,
        wrSell: v.typeTrades["SELL"] ? (v.typeWins["SELL"] || 0) / v.typeTrades["SELL"] * 100 : 0,
      }))
      .sort((a, b) => b.trades - a.trades);
  }

  const byRsi = buildStats(t => getRsiBucket((t.snapshot as any)?.rsi), RSI_BANDS);
  const byAdx = buildStats(t => getAdxBucket((t.snapshot as any)?.adx), ADX_BANDS);
  const byMacd = buildStats(t => getMacdBucket((t.snapshot as any)?.histogram), MACD_BANDS);
  const byMa = buildStats(t => getMaTrendBucket(t.entry, (t.snapshot as any)?.ma9, (t.snapshot as any)?.ma21, (t.snapshot as any)?.ma200, (t.snapshot as any)?.ma235), MA_TREND_BANDS);
  const bySar = buildStats(t => getSarBucket(t.entry, (t.snapshot as any)?.sar), SAR_TREND_BANDS);
  const byPattern = buildStats(t => getPatternBucket((t.snapshot as any)?.pattern));
  const byAsset = buildStats(t => t.asset);
  const byStrategy = buildStats(t => t.strategyId || "Manual");
  const byWilliams = buildStats(t => getWilliamsBucket((t.snapshot as any)?.williams), WILLIAMS_BANDS);
  const byAtr = buildStats(t => getAtrBucket((t.snapshot as any)?.atr, t.entry), ATR_BANDS);
  const byFib = buildStats(t => (t.snapshot as any)?.fibLevel ?? "N/A");
  const byPivot = buildStats(t => (t.snapshot as any)?.pivotLevel ?? "N/A");
  const byMarketMoment = buildStats(t => (t.snapshot as any)?.marketMoment ?? "N/A");
  const byMarketStructure = buildStats(t => getMarketStructure(t), [
    "Zig-Zag de Alta (HH+HL)",
    "Zig-Zag de Baixa (LH+LL)",
    "Alta Forte (HH+HL+ADX+EMA)",
    "Alta com ADX (HH+HL)",
    "Baixa Forte (LH+LL+ADX+EMA)",
    "Baixa com ADX (LH+LL)",
    "Alta (ADX+EMA)",
    "Baixa (ADX+EMA)",
    "Canal Lateral",
    "Expansão / Reversão",
    "Compressão / Triângulo",
    "Range Comprimido",
    "Lateral Baixa Volatilidade",
    "Oscilação"
  ]);
  
  // Advanced New Analytical Groupings
  const byCandleSize = buildStats(t => getCandleSize(t), ["Pequeno (<0.02%)", "Médio (0.02%-0.06%)", "Grande (>0.06%)"]);
  const byPreEntryMomentum = buildStats(t => getPreEntryMomentum(t), ["Impulso Altista Forte", "Impulso Altista Moderado", "Impulso Baixista Forte", "Impulso Baixista Moderado", "Lateralização / Sem Força", "Misto / Correção"]);
  const byBollingerState = buildStats(t => getBollingerState(t), ["Squeeze (Bandas Estreitas)", "Estouro / Expansão Volatilidade", "Neutro / Altas e Baixas Padrão"]);
  const byCrossover = buildStats(t => getIndicatorCrossover(t));
  const byWick = buildStats(t => classifyTradeWick(t), WICK_CLASSIFICATIONS);

  const bySequenceWave = buildStats(t => getSequenceWave(t), SEQUENCE_WAVE_BANDS);

  const byHour = buildStats(t => {
    const h = new Date(t.ts || Date.now()).getHours();
    return `${String(h).padStart(2, "0")}:00`;
  });

  // Discover all custom stat keys from trades
  const customStatKeys = useMemo(() => {
    const keys = new Set<string>();
    trades.forEach(t => {
      if (t.customStats) {
        Object.keys(t.customStats).forEach(k => { if(!k.startsWith('wi_')) keys.add(k); });
      }
    });
    return Array.from(keys);
  }, [trades]);

  const customStatPanels = customStatKeys.map(key => ({
    key,
    label: `Custom: ${key}`,
    data: buildStats(t => String(t.customStats?.[key] ?? "N/A"))
  }));

  // ── Sequence-specific stats ──
  const sequenceStats = useMemo(() => {
    // Filter sequence trades (identified by customStats.setupTipo containing "Sequência")
    const seqTrades = filtered.filter(t =>
      t.customStats?.setupTipo && String(t.customStats.setupTipo).startsWith("Sequência")
    );
    if (seqTrades.length === 0) return null;

    const closed = seqTrades.filter(t => t.result === "WIN" || t.result === "LOSS");
    if (closed.length === 0) return null;

    // Parse sequence number from "Sequência #N (CALL)" → N
    const getSeqNum = (t: Trade): number => {
      const match = String(t.customStats?.setupTipo || "").match(/#(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    };

    // Overall stats
    const wins = closed.filter(t => t.result === "WIN").length;
    const losses = closed.filter(t => t.result === "LOSS").length;
    const totalWr = closed.length ? (wins / closed.length) * 100 : 0;

    // Stats by entry position (1st, 2nd, 3rd, ...)
    const byPosition: Record<number, { trades: number; wins: number }> = {};
    closed.forEach(t => {
      const pos = getSeqNum(t);
      if (!byPosition[pos]) byPosition[pos] = { trades: 0, wins: 0 };
      byPosition[pos].trades++;
      if (t.result === "WIN") byPosition[pos].wins++;
    });
    const positionStats = Object.entries(byPosition)
      .map(([pos, v]) => ({
        position: parseInt(pos),
        trades: v.trades,
        wins: v.wins,
        wr: v.trades ? (v.wins / v.trades) * 100 : 0,
      }))
      .sort((a, b) => a.position - b.position);

    // Group into sequence runs (consecutive entries for same asset+strategy)
    const chronological = [...closed].sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const runs: { entries: number; wins: number; asset: string; strategy: string }[] = [];
    let currentRun: typeof chronological = [];

    for (let i = 0; i < chronological.length; i++) {
      const t = chronological[i];
      const prev = currentRun[currentRun.length - 1];

      if (!prev) {
        currentRun = [t];
      } else {
        const prevNum = getSeqNum(prev);
        const currNum = getSeqNum(t);
        const isConsecutive = currNum === prevNum + 1;
        const sameAsset = t.asset === prev.asset;
        const sameStrategy = (t.strategyId || "Manual") === (prev.strategyId || "Manual");

        if (isConsecutive && sameAsset && sameStrategy) {
          currentRun.push(t);
        } else {
          // Close the current run
          runs.push({
            entries: currentRun.length,
            wins: currentRun.filter(x => x.result === "WIN").length,
            asset: currentRun[0].asset,
            strategy: currentRun[0].strategyId || "Manual",
          });
          currentRun = [t];
        }
      }
    }
    // Close last run
    if (currentRun.length > 0) {
      runs.push({
        entries: currentRun.length,
        wins: currentRun.filter(x => x.result === "WIN").length,
        asset: currentRun[0].asset,
        strategy: currentRun[0].strategyId || "Manual",
      });
    }

    // Stats about runs
    const runLengths = runs.map(r => r.entries);
    const avgRunLength = runLengths.reduce((a, b) => a + b, 0) / runLengths.length;
    const maxRunLength = Math.max(...runLengths);
    const totalRuns = runs.length;

    // First entry vs subsequent WR
    const firstEntries = closed.filter(t => getSeqNum(t) === 1);
    const subsequentEntries = closed.filter(t => getSeqNum(t) > 1);
    const firstWins = firstEntries.filter(t => t.result === "WIN").length;
    const subWins = subsequentEntries.filter(t => t.result === "WIN").length;
    const firstWr = firstEntries.length ? (firstWins / firstEntries.length) * 100 : 0;
    const subWr = subsequentEntries.length ? (subWins / subsequentEntries.length) * 100 : 0;

    // Full-win runs (all entries won) vs mixed/loss runs
    const fullWinRuns = runs.filter(r => r.wins === r.entries).length;
    const fullLossRuns = runs.filter(r => r.wins === 0).length;
    const mixedRuns = runs.filter(r => r.wins > 0 && r.wins < r.entries).length;

    return {
      totalTrades: closed.length,
      wins,
      losses,
      totalWr,
      positionStats,
      runsStats: {
        totalRuns,
        avgRunLength: avgRunLength || 0,
        maxRunLength,
        runLengths,
        fullWinRuns,
        fullLossRuns,
        mixedRuns,
      },
      firstWr,
      subWr,
      firstCount: firstEntries.length,
      subCount: subsequentEntries.length,
    };
  }, [filtered]);

  const whatIfMatrix = useMemo(() => {
    if (modeFilter !== "backtest") return null;
    const backtestTrades = filtered.filter(t => t.mode === "backtest");
    if (!backtestTrades || !backtestTrades.length) return null;

    const intervals = [1, 2, 3, 5, 10, 15];
    const candlesList = [1, 2, 3, 5, 10, 15];
    
    const matrix: any = {};
    intervals.forEach(inv => {
      matrix[inv] = {};
      candlesList.forEach(cnt => {
        const key = `wi_${inv}_${cnt}`;
        const tradesWithResult = (backtestTrades || []).filter(t => t.customStats?.[key]);
        const wins = tradesWithResult.filter(t => t.customStats?.[key] === "WIN").length;
        matrix[inv][cnt] = {
          total: tradesWithResult.length,
          wins,
          wr: tradesWithResult.length ? (wins / tradesWithResult.length) * 100 : 0
        };
      });
    });
    return { intervals, candlesList, matrix };
  }, [filtered, modeFilter]);

    return (
    <AppShell>
      <div className="p-3 space-y-3 pb-24">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-2">
           <div className="flex items-center gap-4">
             <h2 className="text-xl font-bold">Estatísticas Operacionais</h2>
             <button onClick={() => navigate("/trading")} className="text-muted-foreground hover:text-white px-3 py-1 bg-white/5 rounded">Voltar ao Gráfico</button>
           </div>
           
           <div className="flex bg-black/40 p-1 rounded-sm">
             <button onClick={() => setModeFilter('all')} className={`px-4 py-1 text-xs font-bold transition-all ${modeFilter === 'all' ? 'bg-primary text-black' : 'text-muted-foreground hover:text-white'}`}>Tudo</button>
             <button onClick={() => setModeFilter('backtest')} className={`px-4 py-1 text-xs font-bold transition-all ${modeFilter === 'backtest' ? 'bg-primary text-black' : 'text-muted-foreground hover:text-white'}`}>Backtest</button>
             <button onClick={() => setModeFilter('demo')} className={`px-4 py-1 text-xs font-bold transition-all ${modeFilter === 'demo' ? 'bg-primary text-black' : 'text-muted-foreground hover:text-white'}`}>Conta Demo</button>
             <button onClick={() => setModeFilter('real')} className={`px-4 py-1 text-xs font-bold transition-all ${modeFilter === 'real' ? 'bg-primary text-black' : 'text-muted-foreground hover:text-white'}`}>Conta Real</button>
           </div>
        </div>

        {/* Global Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          <div className="bg-black/30 p-4 border border-white/5 rounded">
            <div className="text-xs text-muted-foreground uppercase mb-1">Total de Entradas</div>
            <div className="text-xl font-black text-white">{totals.trades}</div>
            <div className="text-xs opacity-60 mt-2">{totals.wins} Win / {totals.losses} Loss</div>
          </div>
          <div className="bg-black/30 p-4 border border-white/5 rounded">
            <div className="text-xs text-muted-foreground uppercase mb-1">Taxa de Acerto (WR)</div>
            <div className="text-xl font-black text-primary">{totals.wr.toFixed(1)}%</div>
            <div className="text-xs opacity-60 mt-2">Win Rate Geral</div>
          </div>
          <div className="bg-black/30 p-4 border border-white/5 rounded">
            <div className="text-xs text-muted-foreground uppercase mb-1">Resultado Líquido</div>
            <div className={`text-xl font-black ${totals.pnl >= 0 ? "text-bull" : "text-bear"}`}>
              {totals.pnl >= 0 ? "+" : ""}{totals.pnl.toFixed(2)}
            </div>
            <div className="text-xs opacity-60 mt-2">PnL Global</div>
          </div>
          <div className="bg-black/30 p-4 border border-white/5 rounded">
            <div className="text-xs text-muted-foreground uppercase mb-2">Performance por Direção</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => toggleFilter("type", "BUY")}
                className={`p-2 rounded border transition-all text-center ${
                  f.type === "BUY"
                    ? "bg-bull/15 border-bull/50 ring-1 ring-bull/30"
                    : "border-transparent hover:bg-white/5"
                }`}
              >
                <div className="text-sm text-bull font-bold">BUY: {totals.buyWr.toFixed(1)}%</div>
                <div className="text-[10px] text-bull/70 mt-0.5">
                  {totals.buyWins}W / {totals.buyCount} total
                </div>
              </button>
              <button
                onClick={() => toggleFilter("type", "SELL")}
                className={`p-2 rounded border transition-all text-center ${
                  f.type === "SELL"
                    ? "bg-bear/15 border-bear/50 ring-1 ring-bear/30"
                    : "border-transparent hover:bg-white/5"
                }`}
              >
                <div className="text-sm text-bear font-bold">SELL: {totals.sellWr.toFixed(1)}%</div>
                <div className="text-[10px] text-bear/70 mt-0.5">
                  {totals.sellWins}W / {totals.sellCount} total
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Advanced Streak & Trend Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 mb-4">
          <div className="lg:col-span-7 bg-black/30 p-4 border border-white/5 rounded flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-bold text-white mb-3 uppercase tracking-wider opacity-90 text-primary">Sequências e Blocos de Resultados</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="bg-black/40 p-2 border border-white/5 rounded">
                  <span className="text-[9px] text-muted-foreground uppercase block truncate">Max Gain Seguido</span>
                  <span className="text-lg font-black text-bull">{totals.maxWinStreak} W</span>
                  <span className="text-[9px] text-muted-foreground block">Consecutivos</span>
                </div>
                <div className="bg-black/40 p-2 border border-white/5 rounded">
                  <span className="text-[9px] text-muted-foreground uppercase block truncate">Max Loss Seguido</span>
                  <span className="text-lg font-black text-bear">{totals.maxLossStreak} L</span>
                  <span className="text-[9px] text-muted-foreground block">Consecutivos</span>
                </div>
                <div className="bg-black/40 p-2 border border-white/5 rounded">
                  <span className="text-[9px] text-muted-foreground uppercase block truncate">Média Bloco Win</span>
                  <span className="text-lg font-black text-white">{totals.avgWinStreak.toFixed(1)} W</span>
                  <span className="text-[9px] text-muted-foreground block">Média agrupada</span>
                </div>
                <div className="bg-black/40 p-2 border border-white/5 rounded">
                  <span className="text-[9px] text-muted-foreground uppercase block truncate">Média Bloco Loss</span>
                  <span className="text-lg font-black text-white">{totals.avgLossStreak.toFixed(1)} L</span>
                  <span className="text-[9px] text-muted-foreground block">Média agrupada</span>
                </div>
              </div>
            </div>
            {!selectedWhatIf && (
              <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-xs">
                <span className="text-muted-foreground text-[10px] uppercase">Rebaixamento Máximo do Capital (Max DD):</span>
                <span className="font-mono font-bold text-bear">-${totals.maxDrawdown.toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className="lg:col-span-5 bg-black/30 p-4 border border-white/5 rounded flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-bold text-white mb-3 uppercase tracking-wider opacity-90 text-primary">Assertividade por Alinhamento de Tendência</h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-black/40 p-3 border border-white/5 rounded flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase block">A Favor da Tendência</span>
                    <span className="text-xl font-black text-bull">{totals.trendFavWr.toFixed(1)}%</span>
                  </div>
                  <span className="text-[9px] text-muted-foreground block mt-2">
                    {totals.trendFavWins}W - {totals.trendFavCount - totals.trendFavWins}L
                  </span>
                </div>
                <div className="bg-black/40 p-3 border border-white/5 rounded flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase block">Contra a Tendência</span>
                    <span className="text-xl font-black text-bear">{totals.trendContraWr.toFixed(1)}%</span>
                  </div>
                  <span className="text-[9px] text-muted-foreground block mt-2">
                    {totals.trendContraWins}W - {totals.trendContraCount - totals.trendContraWins}L
                  </span>
                </div>
              </div>
            </div>
            <p className="text-[9px] text-muted-foreground mt-2 italic">
              *Análise de tendência calculada dinamicamente cruzando preço de entrada e indicadores (MAs ou SAR) salvos no snapshot do trade.
            </p>
          </div>
        </div>

        {/* Raio-X Radiográfico de Cenários de Mercado */}
        <div className="bg-gradient-to-br from-black/50 to-slate-900/40 p-4 border border-white/5 rounded mb-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm font-black text-primary tracking-wider uppercase">Raio-X de Cenários e Ciclos do Mercado</h3>
              <p className="text-[10px] text-muted-foreground">Isolamento estatístico de momentos operacionais de acordo com a estrutura mecânica do gráfico no momento da entrada</p>
            </div>
            <div className="text-[10px] bg-white/5 border border-white/5 p-1 px-2 rounded text-muted-foreground">
              Amostra filtrada: <span className="text-white font-bold">{filtered.length} trades</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Classificando o melhor cenário do mercado */}
            {(() => {
              const validMoments = byMarketMoment.filter(m => m.trades > 0 && m.label !== "N/A" && m.label !== "Sem Padrão Clássico");
              const bestOne = [...validMoments].sort((a, b) => b.wr - a.wr)[0];
              const worstOne = [...validMoments].sort((a, b) => a.wr - b.wr)[0];

              return (
                <>
                  <div className="bg-black/30 p-3 rounded border border-white/5 flex flex-col justify-between">
                    <div>
                      <span className="text-[9px] text-muted-foreground uppercase tracking-wider block text-bull font-bold">Cenário Mais Assertivo (Sweet Spot)</span>
                      {bestOne ? (
                        <>
                          <span className="text-sm font-bold text-bull mt-1 block truncate" title={bestOne.label}>{bestOne.label}</span>
                          <span className="text-2xl font-black text-bull mt-1 block">{bestOne.wr.toFixed(1)}% <span className="text-xs text-muted-foreground font-normal">WR ({bestOne.trades} op)</span></span>
                        </>
                      ) : (
                        <span className="text-sm font-bold text-muted-foreground block mt-1">Aguardando dados...</span>
                      )}
                    </div>
                    <span className="text-[9px] text-muted-foreground block border-t border-white/5 pt-1 mt-2">Indica máxima sinergia operacional</span>
                  </div>

                  <div className="bg-black/30 p-3 rounded border border-white/5 flex flex-col justify-between">
                    <div>
                      <span className="text-[9px] text-muted-foreground uppercase tracking-wider block text-bear font-bold">Zona de Risco (Drawdown Spot)</span>
                      {worstOne ? (
                        <>
                          <span className="text-sm font-bold text-bear mt-1 block truncate" title={worstOne.label}>{worstOne.label}</span>
                          <span className="text-2xl font-black text-bear mt-1 block">{worstOne.wr.toFixed(1)}% <span className="text-xs text-muted-foreground font-normal">WR ({worstOne.trades} op)</span></span>
                        </>
                      ) : (
                        <span className="text-sm font-bold text-muted-foreground block mt-1">Aguardando dados...</span>
                      )}
                    </div>
                    <span className="text-[9px] text-muted-foreground block border-t border-white/5 pt-1 mt-2">Recomendado suspender operações neste cenário</span>
                  </div>

                  <div className="bg-black/30 p-3 rounded border border-white/5 md:col-span-2 flex flex-col justify-between">
                    <div>
                      <span className="text-[9px] text-muted-foreground uppercase tracking-wider block">Distribuição e Performance por Momento</span>
                      <div className="space-y-1.5 mt-2">
                        {byMarketMoment.filter(item => item.trades > 0).slice(0, 3).map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground truncate w-1/2">{item.label === "N/A" ? "Indeterminado" : item.label}</span>
                            <div className="w-1/4 bg-white/5 h-1.5 rounded-full overflow-hidden mx-2">
                              <div className="bg-primary h-full" style={{ width: `${(item.trades / (filtered.length || 1)) * 100}%` }}></div>
                            </div>
                            <span className={`font-mono text-right w-1/4 ${item.wr >= 55 ? "text-bull" : item.wr < 50 ? "text-bear" : "text-white"}`}>
                              {item.wr.toFixed(1)}% WR ({item.trades} op)
                            </span>
                          </div>
                        ))}
                        {byMarketMoment.filter(item => item.trades > 0).length === 0 && <span className="text-xs text-muted-foreground italic">Faltam registros estruturados</span>}
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        {/* Sequence Block and Consistency Panel */}
        <div className="bg-gradient-to-br from-black/50 to-slate-900/60 p-4 border border-white/5 rounded mb-4">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-black text-primary uppercase tracking-wider">Estudo de Blocos e Consistência (Sinergia por Segmento)</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {comboMode === "simple"
                  ? "Veja o tamanho médio e máximo das sequências consecutivas de Gain e Loss. Descubra quais ativos e estados de indicadores geram os blocos de ganhos mais saudáveis e consistentes."
                  : comboMode === "duo"
                    ? "Combinações de 2 indicadores: descubra quais pares de condições de mercado produzem os melhores blocos de vitória consecutiva."
                    : "Combinações de 3 indicadores: isole condições específicas do mercado que maximizam sequências de Gain e minimizam sequências de Loss."}
              </p>
            </div>
            
            {/* Mode Toggle: Simple / Duo / Trio */}
            <div className="flex flex-col gap-2 self-stretch sm:self-auto">
              <div className="flex bg-black/50 p-0.5 rounded border border-white/5 overflow-x-auto">
                <button
                  onClick={() => { setComboMode("simple"); setStreakTab("assets"); }}
                  className={`px-3 py-1 text-[10px] uppercase font-bold rounded-sm transition-all whitespace-nowrap ${comboMode === "simple" ? "bg-primary text-black" : "text-muted-foreground hover:text-white"}`}
                >
                  Simples
                </button>
                <button
                  onClick={() => setComboMode("duo")}
                  className={`px-3 py-1 text-[10px] uppercase font-bold rounded-sm transition-all whitespace-nowrap ${comboMode === "duo" ? "bg-primary text-black" : "text-muted-foreground hover:text-white"}`}
                >
                  Dupla (2 indic.)
                </button>
                <button
                  onClick={() => setComboMode("trio")}
                  className={`px-3 py-1 text-[10px] uppercase font-bold rounded-sm transition-all whitespace-nowrap ${comboMode === "trio" ? "bg-primary text-black" : "text-muted-foreground hover:text-white"}`}
                >
                  Tripla (3 indic.)
                </button>
              </div>

              {/* Conditional Tab Bar */}
              <div className="flex bg-black/50 p-0.5 rounded border border-white/5 overflow-x-auto">
                {comboMode === "simple" && (
                  <>
                    <button onClick={() => setStreakTab("assets")} className={`px-3 py-1 text-[10px] uppercase font-bold rounded-sm transition-all whitespace-nowrap ${streakTab === "assets" ? "bg-primary text-black" : "text-muted-foreground hover:text-white"}`}>Ativos</button>
                    <button onClick={() => setStreakTab("strategies")} className={`px-3 py-1 text-[10px] uppercase font-bold rounded-sm transition-all whitespace-nowrap ${streakTab === "strategies" ? "bg-primary text-black" : "text-muted-foreground hover:text-white"}`}>Estratégias</button>
                    <button onClick={() => setStreakTab("rsi")} className={`px-3 py-1 text-[10px] uppercase font-bold rounded-sm transition-all whitespace-nowrap ${streakTab === "rsi" ? "bg-primary text-black" : "text-muted-foreground hover:text-white"}`}>RSI</button>
                    <button onClick={() => setStreakTab("bollinger")} className={`px-3 py-1 text-[10px] uppercase font-bold rounded-sm transition-all whitespace-nowrap ${streakTab === "bollinger" ? "bg-primary text-black" : "text-muted-foreground hover:text-white"}`}>Bollinger</button>
                    <button onClick={() => setStreakTab("crossover")} className={`px-3 py-1 text-[10px] uppercase font-bold rounded-sm transition-all whitespace-nowrap ${streakTab === "crossover" ? "bg-primary text-black" : "text-muted-foreground hover:text-white"}`}>Cruzamentos</button>
                    <button onClick={() => setStreakTab("structure")} className={`px-3 py-1 text-[10px] uppercase font-bold rounded-sm transition-all whitespace-nowrap ${streakTab === "structure" ? "bg-primary text-black" : "text-muted-foreground hover:text-white"}`}>Estrutura</button>
                  </>
                )}
                {comboMode === "duo" && (
                  <>
                    <button onClick={() => setComboTab("asset_rsi")} className={`px-3 py-1 text-[10px] uppercase font-bold rounded-sm transition-all whitespace-nowrap ${comboTab === "asset_rsi" ? "bg-primary text-black" : "text-muted-foreground hover:text-white"}`}>Ativo + RSI</button>
                    <button onClick={() => setComboTab("asset_structure")} className={`px-3 py-1 text-[10px] uppercase font-bold rounded-sm transition-all whitespace-nowrap ${comboTab === "asset_structure" ? "bg-primary text-black" : "text-muted-foreground hover:text-white"}`}>Ativo + Estrutura</button>
                    <button onClick={() => setComboTab("rsi_structure")} className={`px-3 py-1 text-[10px] uppercase font-bold rounded-sm transition-all whitespace-nowrap ${comboTab === "rsi_structure" ? "bg-primary text-black" : "text-muted-foreground hover:text-white"}`}>RSI + Estrutura</button>
                    <button onClick={() => setComboTab("bollinger_crossover")} className={`px-3 py-1 text-[10px] uppercase font-bold rounded-sm transition-all whitespace-nowrap ${comboTab === "bollinger_crossover" ? "bg-primary text-black" : "text-muted-foreground hover:text-white"}`}>Bollinger + Cruzamento</button>
                  </>
                )}
                {comboMode === "trio" && (
                  <>
                    <button onClick={() => setComboTab("asset_rsi_structure")} className={`px-3 py-1 text-[10px] uppercase font-bold rounded-sm transition-all whitespace-nowrap ${comboTab === "asset_rsi_structure" ? "bg-primary text-black" : "text-muted-foreground hover:text-white"}`}>Ativo + RSI + Estrutura</button>
                    <button onClick={() => setComboTab("rsi_bollinger_crossover")} className={`px-3 py-1 text-[10px] uppercase font-bold rounded-sm transition-all whitespace-nowrap ${comboTab === "rsi_bollinger_crossover" ? "bg-primary text-black" : "text-muted-foreground hover:text-white"}`}>RSI + Bollinger + Cruzamento</button>
                    <button onClick={() => setComboTab("strategy_rsi_structure")} className={`px-3 py-1 text-[10px] uppercase font-bold rounded-sm transition-all whitespace-nowrap ${comboTab === "strategy_rsi_structure" ? "bg-primary text-black" : "text-muted-foreground hover:text-white"}`}>Estratégia + RSI + Estrutura</button>
                    <button onClick={() => setComboTab("asset_structure_crossover")} className={`px-3 py-1 text-[10px] uppercase font-bold rounded-sm transition-all whitespace-nowrap ${comboTab === "asset_structure_crossover" ? "bg-primary text-black" : "text-muted-foreground hover:text-white"}`}>Ativo + Estrutura + Cruzamento</button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[11px] whitespace-nowrap border-collapse text-left">
              <thead>
                <tr className="bg-black/30 text-[9px] text-muted-foreground uppercase border-b border-white/5">
                  <th className="p-2 font-bold select-none">GRUPO / SEGMENTO</th>
                  <th className="p-2 font-bold text-center">ENTRADAS</th>
                  <th className="p-2 font-bold text-center">WIN RATE (WR)</th>
                  <th className="p-2 font-bold text-center text-bull">BLOCO MÉDIO WIN</th>
                  <th className="p-2 font-bold text-center text-bear">BLOCO MÉDIO LOSS</th>
                  <th className="p-2 font-bold text-center text-bull bg-white/5">MAX SEQUÊNCIA WIN</th>
                  <th className="p-2 font-bold text-center text-bear bg-white/5">MAX SEQUÊNCIA LOSS</th>
                </tr>
              </thead>
              <tbody>
                {(comboMode === "simple" ? blockStatsByGroup[streakTab] : comboBlockStatsByGroup[comboTab]).map((row, idx) => {
                  const isTopWr = idx === 0 && row.wr >= 55 && row.trades >= 3;
                  return (
                    <tr 
                      key={idx} 
                      className={`border-b border-white/5 hover:bg-white/5 transition-all ${isTopWr ? "bg-bull/5" : ""}`}
                    >
                      <td className="p-2 font-bold flex items-center gap-1.5">
                        <span className="text-white">{row.name === "N/A" ? "Indeterminado" : row.name}</span>
                        {isTopWr && (
                          <span className="bg-bull/20 text-bull text-[8px] px-1 rounded font-normal uppercase">Destaque de Blocos</span>
                        )}
                      </td>
                      <td className="p-2 text-center text-muted-foreground">{row.trades} op</td>
                      <td className="p-2 text-center font-black">
                        <span className={row.wr >= 55 ? "text-bull" : row.wr < 50 ? "text-bear" : "text-white"}>
                          {row.wr.toFixed(1)}%
                        </span>
                      </td>
                      <td className="p-2 text-center text-bull font-bold font-mono">
                        {row.avgWinStreak.toFixed(1)} W
                      </td>
                      <td className="p-2 text-center text-bear font-bold font-mono">
                        {row.avgLossStreak.toFixed(1)} L
                      </td>
                      <td className="p-2 text-center text-bull font-black font-mono bg-white/5">
                        {row.maxWinStreak} consecutivas
                      </td>
                      <td className="p-2 text-center text-bear font-black font-mono bg-white/5">
                        {row.maxLossStreak} consecutivas
                      </td>
                    </tr>
                  );
                })}
                {(comboMode === "simple" ? blockStatsByGroup[streakTab] : comboBlockStatsByGroup[comboTab]).length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground italic">
                      Aguardando operações fechadas de robôs ou backtests para carregar o mapa de consistência.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          <div className="bg-black/20 p-2 rounded-sm border border-white/5 mt-3 text-[9px] text-muted-foreground flex items-center gap-2">
            <span className="bg-primary/20 text-primary p-0.5 px-1 rounded uppercase font-bold">Trading Insight</span>
            <span>
              {comboMode === "simple"
                ? "Ao analisar acima, procure por segmentos com o **Bloco Médio Win** alto e **Bloco Médio Loss** próximo a 1.0. Segmentos onde o Bloco Médio Loss é muito menor que o Bloco Médio Win representam condições de mercado altamente amigáveis para recuperação de martingale ou soros!"
                : "Nas combinações, procure por grupos com Bloco Médio Win elevado e Bloco Médio Loss próximo de 1.0 — isso indica condições onde as vitórias vêm em sequência mas as perdas são isoladas, ideal para estratégias de recuperação."}
            </span>
          </div>
        </div>

        {/* Sequence-Specific Stats Card */}
        {sequenceStats && (
          <div className="bg-gradient-to-br from-black/50 to-purple-900/30 p-4 border border-purple-500/20 rounded mb-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-black text-purple-400 uppercase tracking-wider">⚡ Estatísticas de Sequência</h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Desempenho exclusivo das entradas automáticas em sequência ({sequenceStats.runsStats.totalRuns} sequências identificadas)
                </p>
              </div>
            </div>

            {/* Overall sequence stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
              <div className="bg-black/40 p-3 border border-white/5 rounded">
                <div className="text-[9px] text-muted-foreground uppercase">Total Entradas Seq.</div>
                <div className="text-lg font-black text-white">{sequenceStats.totalTrades}</div>
                <div className="text-[9px] text-muted-foreground">{sequenceStats.wins}W / {sequenceStats.losses}L</div>
              </div>
              <div className="bg-black/40 p-3 border border-white/5 rounded">
                <div className="text-[9px] text-muted-foreground uppercase">WR Sequência</div>
                <div className="text-lg font-black text-purple-400">{sequenceStats.totalWr.toFixed(1)}%</div>
                <div className="text-[9px] text-muted-foreground">Taxa geral</div>
              </div>
              <div className="bg-black/40 p-3 border border-white/5 rounded">
                <div className="text-[9px] text-muted-foreground uppercase">1ª Entrada</div>
                <div className={`text-lg font-black ${sequenceStats.firstWr >= 55 ? "text-bull" : "text-bear"}`}>{sequenceStats.firstWr.toFixed(1)}%</div>
                <div className="text-[9px] text-muted-foreground">{sequenceStats.firstCount} trades</div>
              </div>
              <div className="bg-black/40 p-3 border border-white/5 rounded">
                <div className="text-[9px] text-muted-foreground uppercase">Restantes (2ª+)</div>
                <div className={`text-lg font-black ${sequenceStats.subWr >= 55 ? "text-bull" : "text-bear"}`}>{sequenceStats.subWr.toFixed(1)}%</div>
                <div className="text-[9px] text-muted-foreground">{sequenceStats.subCount} trades</div>
              </div>
              <div className="bg-black/40 p-3 border border-white/5 rounded">
                <div className="text-[9px] text-muted-foreground uppercase">Média / Max p/ Seq.</div>
                <div className="text-lg font-black text-white">{sequenceStats.runsStats.avgRunLength.toFixed(1)} <span className="text-xs text-muted-foreground font-normal">/ {sequenceStats.runsStats.maxRunLength} máx</span></div>
                <div className="text-[9px] text-muted-foreground">entradas por sequência</div>
              </div>
            </div>

            {/* Entry position breakdown */}
            <div className="bg-black/30 p-3 border border-white/5 rounded mb-3">
              <div className="text-[10px] text-muted-foreground uppercase mb-2 font-bold">Desempenho por Posição na Sequência</div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] text-center">
                  <thead>
                    <tr className="text-[9px] text-muted-foreground uppercase border-b border-white/5">
                      <th className="p-2 font-bold">Posição</th>
                      <th className="p-2 font-bold">Entradas</th>
                      <th className="p-2 font-bold">Wins</th>
                      <th className="p-2 font-bold">WR</th>
                      <th className="p-2 font-bold">Barra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sequenceStats.positionStats.map((pos) => {
                      const maxTrades = Math.max(...sequenceStats.positionStats.map(p => p.trades), 1);
                      return (
                        <tr key={pos.position} className="border-b border-white/5 hover:bg-white/5">
                          <td className="p-2 font-bold text-white">{pos.position}ª</td>
                          <td className="p-2 text-muted-foreground">{pos.trades}</td>
                          <td className="p-2 text-bull">{pos.wins}</td>
                          <td className={`p-2 font-black ${pos.wr >= 55 ? "text-bull" : pos.wr < 50 ? "text-bear" : "text-white"}`}>
                            {pos.wr.toFixed(1)}%
                          </td>
                          <td className="p-2 w-32">
                            <div className="bg-white/5 h-2 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${pos.wr >= 55 ? "bg-bull" : pos.wr < 50 ? "bg-bear" : "bg-white/40"}`}
                                style={{ width: `${(pos.trades / maxTrades) * 100}%` }}
                              ></div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Run quality breakdown */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-bull/5 border border-bull/20 p-2 rounded text-center">
                <div className="text-lg font-black text-bull">{sequenceStats.runsStats.fullWinRuns}</div>
                <div className="text-[9px] text-muted-foreground uppercase">Sequências 100% Win</div>
              </div>
              <div className="bg-yellow-500/5 border border-yellow-500/20 p-2 rounded text-center">
                <div className="text-lg font-black text-yellow-400">{sequenceStats.runsStats.mixedRuns}</div>
                <div className="text-[9px] text-muted-foreground uppercase">Sequências Mistas</div>
              </div>
              <div className="bg-bear/5 border border-bear/20 p-2 rounded text-center">
                <div className="text-lg font-black text-bear">{sequenceStats.runsStats.fullLossRuns}</div>
                <div className="text-[9px] text-muted-foreground uppercase">Sequências 100% Loss</div>
              </div>
            </div>
          </div>
        )}

        {/* Active Filters */}
        {Object.values(f).some(v => v !== null) && (
          <div className="flex flex-wrap gap-2 items-center bg-primary/10 p-2 rounded border border-primary/20">
            <span className="text-xs text-primary font-bold mr-2">Filtros Ativos:</span>
            {Object.entries(f).map(([k, v]) => v && (
              <span key={k} className="bg-primary/20 text-primary text-[10px] px-2 py-1 rounded-sm flex items-center gap-1">
                {k.toUpperCase()}: {v}
                <button onClick={() => toggleFilter(k, v)} className="hover:text-white ml-2">×</button>
              </span>
            ))}
            <button onClick={() => setF({asset: null, strategy: null, type: null, rsi: null, adx: null, macd: null, maTrend: null, pattern: null, timeframe: null, sar: null, atr: null, williams: null, fibLevel: null, pivotLevel: null, marketMoment: null, candleSize: null, preEntryMomentum: null, bollingerState: null, indicatorCrossover: null, marketStructure: null, wick: null, sequenceWave: null})} className="text-[10px] text-muted-foreground hover:text-white underline ml-2">
              Limpar Todos
            </button>
          </div>
        )}

        {/* Matrix */}
        {whatIfMatrix && (
          <div className="bg-black/20 p-3 rounded border border-white/5 overflow-hidden">
            <h3 className="text-sm font-bold text-white mb-3">Matriz de Otimização: Timeframe de Referência x Tempo de Expiração</h3>
            
            <div className="overflow-x-auto pb-2">
              <table className="w-full text-center border-collapse">
                <thead>
                  <tr>
                    <th className="p-2 border border-border/30 bg-black/40 text-[9px] text-muted-foreground uppercase">REF TF \ VELAS</th>
                    {whatIfMatrix.candlesList.map(cnt => (
                      <th key={cnt} className="p-2 border border-border/30 bg-black/40 text-[10px]">{cnt} {cnt === 1 ? 'Vela' : 'Velas'}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {whatIfMatrix.intervals.map(inv => (
                    <tr key={inv}>
                      <td className="p-2 border border-border/30 bg-black/20 text-[10px] font-bold text-primary">{inv}m</td>
                      {whatIfMatrix.candlesList.map(cnt => {
                        const cell = whatIfMatrix.matrix[inv][cnt];
                        const key = `wi_${inv}_${cnt}`;
                        return (
                          <td 
                            key={cnt} 
                            onClick={() => {
                              if (selectedWhatIf === key) {
                                setSelectedWhatIf(null);
                                toast.success("Mostrando resultados originais");
                              } else {
                                setSelectedWhatIf(key);
                                toast.success(`Filtrado para a simulação: TF ${inv}m / Exp ${cnt} velas`);
                              }
                            }}
                            className={`p-2 border border-border/30 transition-all cursor-pointer hover:bg-white/10 ${selectedWhatIf === key ? 'ring-2 ring-primary ring-inset ' : ''}${cell.wr >= 60 ? "bg-bull/20" : cell.wr >= 50 ? "bg-white/5" : "bg-bear/10 opacity-60"}`}
                            title={`Configuração: TF ${inv}m, Duração ${cnt} velas. Clique para aplicar o filtro nesta página.`}
                          >
                            <div className={`text-base font-black ${cell.wr >= 55 ? "text-bull" : "text-white"}`}>{cell.wr.toFixed(1)}%</div>
                            <div className="text-[8px] opacity-60">{cell.wins}W - {cell.total - cell.wins}L</div>
                          </td>

                         );
                       })}
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
             
             <p className="text-[10px] text-muted-foreground mt-4 italic">
                Nota: Esta matriz simula o resultado das MESMAS ENTRADAS caso você utilizasse timeframes de referência e durações de velas diferentes. 
                Isso ajuda a identificar qual a expiração ideal para o seu gatilho atual.
             </p>
          </div>
        )}

        <div className="bg-primary/10 border border-primary/20 rounded p-2 text-[11px] text-primary flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 shrink-0 text-primary" />
            <span>
              <strong>Botões Multifunção nos Indicadores:</strong> Clique simples na linha para <strong>Filtrar</strong> | Clique na <strong>Seta (<ChevronDown className="w-3 h-3 inline text-white" />)</strong> para abrir o menu multifunção: <strong>Inverter (Geral)</strong>, <strong>Inverter Compra</strong>, <strong>Inverter Venda</strong> ou <strong>Ocultar</strong> a faixa!
            </span>
          </div>
          {(Object.values(f).some(v => v !== null) || Object.values(rangeActions).some(m => Object.keys(m).length > 0)) && (
            <button
              onClick={clearAllFilters}
              className="bg-primary/20 hover:bg-primary/30 text-primary border border-primary/40 text-[10px] px-2 py-1 rounded font-bold transition-all flex items-center gap-1 shrink-0"
            >
              <RotateCcw className="w-3 h-3" />
              Limpar Tudo
            </button>
          )}
        </div>

        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          <StatPanel title="Por Onda da Sequência" data={bySequenceWave} filterKey="sequenceWave" currentFilter={f.sequenceWave} actionsMap={rangeActions.sequenceWave || {}} onToggle={toggleFilter} onSetAction={setRangeAction} />
          <StatPanel title="Por Estratégia" data={byStrategy} filterKey="strategy" currentFilter={f.strategy} actionsMap={rangeActions.strategy || {}} onToggle={toggleFilter} onSetAction={setRangeAction} />
          <StatPanel title="Por Horário" data={byHour} filterKey="hour" currentFilter={f.hour} actionsMap={rangeActions.hour || {}} onToggle={toggleFilter} onSetAction={setRangeAction} />
          <StatPanel title="Por Faixa de RSI" data={byRsi} filterKey="rsi" currentFilter={f.rsi} actionsMap={rangeActions.rsi || {}} onToggle={toggleFilter} onSetAction={setRangeAction} />
          <StatPanel title="Por Faixa de ADX" data={byAdx} filterKey="adx" currentFilter={f.adx} actionsMap={rangeActions.adx || {}} onToggle={toggleFilter} onSetAction={setRangeAction} />
          <StatPanel title="Por MACD (Histograma)" data={byMacd} filterKey="macd" currentFilter={f.macd} actionsMap={rangeActions.macd || {}} onToggle={toggleFilter} onSetAction={setRangeAction} />
          <StatPanel title="Por Tendência de Médias (9, 21, 200, 235)" data={byMa} filterKey="maTrend" currentFilter={f.maTrend} actionsMap={rangeActions.maTrend || {}} onToggle={toggleFilter} onSetAction={setRangeAction} />
          <StatPanel title="Por Parabolic SAR" data={bySar} filterKey="sar" currentFilter={f.sar} actionsMap={rangeActions.sar || {}} onToggle={toggleFilter} onSetAction={setRangeAction} />
          <StatPanel title="Por Padrão de Candles" data={byPattern} filterKey="pattern" currentFilter={f.pattern} actionsMap={rangeActions.pattern || {}} onToggle={toggleFilter} onSetAction={setRangeAction} />
          <StatPanel title="Por Ativo" data={byAsset} filterKey="asset" currentFilter={f.asset} actionsMap={rangeActions.asset || {}} onToggle={toggleFilter} onSetAction={setRangeAction} />
          <StatPanel title="Ciclo / Momento de Mercado" data={byMarketMoment} filterKey="marketMoment" currentFilter={f.marketMoment} actionsMap={rangeActions.marketMoment || {}} onToggle={toggleFilter} onSetAction={setRangeAction} />
          <StatPanel title="Estrutura de Mercado (Zig-Zag / Canal)" data={byMarketStructure} filterKey="marketStructure" currentFilter={f.marketStructure} actionsMap={rangeActions.marketStructure || {}} onToggle={toggleFilter} onSetAction={setRangeAction} />
          <StatPanel title="Proximidade Níveis Fibonacci" data={byFib} filterKey="fibLevel" currentFilter={f.fibLevel} actionsMap={rangeActions.fibLevel || {}} onToggle={toggleFilter} onSetAction={setRangeAction} />
          <StatPanel title="Proximidade Níveis Pivot" data={byPivot} filterKey="pivotLevel" currentFilter={f.pivotLevel} actionsMap={rangeActions.pivotLevel || {}} onToggle={toggleFilter} onSetAction={setRangeAction} />
          <StatPanel title="Por Williams %R Bands" data={byWilliams} filterKey="williams" currentFilter={f.williams} actionsMap={rangeActions.williams || {}} onToggle={toggleFilter} onSetAction={setRangeAction} />
          <StatPanel title="Por Volatilidade ATR" data={byAtr} filterKey="atr" currentFilter={f.atr} actionsMap={rangeActions.atr || {}} onToggle={toggleFilter} onSetAction={setRangeAction} />
          <StatPanel title="Tamanho de Vela (Pre-Entrada)" data={byCandleSize} filterKey="candleSize" currentFilter={f.candleSize} actionsMap={rangeActions.candleSize || {}} onToggle={toggleFilter} onSetAction={setRangeAction} />
          <StatPanel title="Classificação do Pavio (Vela de Entrada)" data={byWick} filterKey="wick" currentFilter={f.wick} actionsMap={rangeActions.wick || {}} onToggle={toggleFilter} onSetAction={setRangeAction} />
          <StatPanel title="Momentum / Impulsividade (Últimas 5 Velas)" data={byPreEntryMomentum} filterKey="preEntryMomentum" currentFilter={f.preEntryMomentum} actionsMap={rangeActions.preEntryMomentum || {}} onToggle={toggleFilter} onSetAction={setRangeAction} />
          <StatPanel title="Sinergia Bollinger (Boiling Squeeze)" data={byBollingerState} filterKey="bollingerState" currentFilter={f.bollingerState} actionsMap={rangeActions.bollingerState || {}} onToggle={toggleFilter} onSetAction={setRangeAction} />
          <StatPanel title="Cruzamento de Médias Móveis" data={byCrossover} filterKey="indicatorCrossover" currentFilter={f.indicatorCrossover} actionsMap={rangeActions.indicatorCrossover || {}} onToggle={toggleFilter} onSetAction={setRangeAction} />
          {customStatPanels.map(p => (
            <StatPanel 
              key={p.key} 
              title={p.label} 
              data={p.data} 
              filterKey={p.key} 
              currentFilter={f[p.key]} 
              actionsMap={rangeActions[p.key] || {}}
              onToggle={toggleFilter} 
              onSetAction={setRangeAction}
            />
          ))}
        </div>

        <div className="panel p-3">
          <div className="text-[10px] uppercase text-muted-foreground mb-2 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="font-bold">Operações Filtradas ({filtered.length} de {modeFilteredTrades.length})</div>
              <div className="flex gap-1.5 flex-wrap">
                {Object.entries(f).filter(([_, v]) => v != null).map(([k, v]) => (
                  <span key={k} className="bg-primary/20 text-primary border border-primary/40 px-2 py-0.5 rounded text-[10px] flex items-center gap-1 font-bold">
                    <Filter className="w-3 h-3" />
                    <span>{k}: {v}</span>
                    <button className="hover:text-white ml-0.5 font-black text-xs" onClick={() => toggleFilter(k, v!)}>×</button>
                  </span>
                ))}
                {activeInversions.map(({ key, val, action }) => (
                  <span key={`${key}-${val}-${action}`} className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-2 py-0.5 rounded text-[10px] flex items-center gap-1 font-bold">
                    <RefreshCw className="w-3 h-3 text-cyan-300" />
                    <span>Invertido ({key}: {val} - {action === "invert_all" ? "Geral" : action === "invert_buy" ? "Compra" : "Venda"})</span>
                    <button className="hover:text-white ml-0.5 font-black text-xs" onClick={() => setRangeAction(key, val, "none")}>×</button>
                  </span>
                ))}
                {Object.entries(excludedF).map(([k, list]) => 
                  list.map(v => (
                    <span key={`${k}-${v}`} className="bg-bear/20 text-bear border border-bear/40 px-2 py-0.5 rounded text-[10px] flex items-center gap-1 font-bold">
                      <EyeOff className="w-3 h-3 text-bear" />
                      <span>Oculto ({k}): {v}</span>
                      <button className="hover:text-white ml-0.5 font-black text-xs" onClick={() => toggleExcludeFilter(k, v)}>×</button>
                    </span>
                  ))
                )}
              </div>
            </div>
            {(Object.values(f).some(v => v !== null) || Object.values(rangeActions).some(m => Object.keys(m).length > 0)) && (
              <button 
                onClick={clearAllFilters}
                className="text-[10px] bg-secondary hover:bg-white/10 text-white px-2 py-1 rounded flex items-center gap-1 transition-all"
              >
                <RotateCcw className="w-3 h-3" />
                Limpar Todos os Filtros
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] ticker whitespace-nowrap">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-left py-2 font-normal opacity-70">DATA/HORA</th>
                  <th className="text-center font-normal opacity-70">ATIVO</th>
                  <th className="text-center font-normal opacity-70">ESTRATÉGIA</th>
                  <th className="text-center font-normal opacity-70">DIR</th>
                  <th className="text-center font-normal opacity-70">STAKE</th>
                  <th className="text-center font-normal opacity-70">RSI</th>
                  <th className="text-center font-normal opacity-70">ADX</th>
                  <th className="text-center font-normal opacity-70">SAR</th>
                  {customStatKeys.map(k => (
                    <th key={k} className="text-center font-normal opacity-70 uppercase">{k}</th>
                  ))}
                  <th className="text-center font-normal opacity-70">P&L</th>
                  <th className="text-center font-normal opacity-70">RES</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 50).map((t) => {
                  const sh = t.snapshot as any || {};
                  const eff = getTradeEffectiveState(t, rangeActions, selectedWhatIf);
                  return (
                    <tr key={t.id} className={`border-t border-border/60 hover:bg-secondary/30 ${eff.isFlipped ? "bg-cyan-500/5" : ""}`}>
                      <td className="py-2 text-muted-foreground">{new Date(t.ts || Date.now()).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="text-center text-primary font-bold">{t.asset}</td>
                      <td className="text-center text-[10px]">{t.strategyId || "Manual"}</td>
                      <td className={`text-center font-bold ${t.type === "CALL" || t.type === "BUY" ? "text-bull" : "text-bear"}`}>{t.type}</td>
                      <td className="text-center font-mono opacity-80">${t.amount}</td>
                      <td className="text-center font-mono opacity-80">{sh.rsi?.toFixed(1) || "-"}</td>
                      <td className="text-center font-mono opacity-80">{sh.adx?.toFixed(1) || "-"}</td>
                      <td className="text-center font-mono opacity-80">{sh.sar?.toFixed(4) || "-"}</td>
                      {customStatKeys.map(k => (
                        <td key={k} className="text-center font-mono opacity-80">
                          {t.customStats?.[k] !== undefined ? String(t.customStats[k]) : "-"}
                        </td>
                      ))}
                      <td className={`text-center font-black ticker ${eff.pnl >= 0 ? "text-bull" : "text-bear"}`}>{eff.pnl >= 0 ? "+" : ""}{eff.pnl.toFixed(2)}</td>
                      <td className="text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center justify-center gap-1 mx-auto ${eff.result === "WIN" ? "bg-bull/20 text-bull border border-bull/30" : "bg-bear/20 text-bear border border-bear/30"}`}>
                          {eff.isFlipped && <RefreshCw className="w-2.5 h-2.5 text-cyan-400" title="Resultado invertido por regra de faixa" />}
                          {eff.result}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {(!filtered || filtered.length === 0) && <tr><td colSpan={12 + customStatKeys.length} className="text-center py-6 text-muted-foreground italic">Nenhuma operação atende aos filtros atuais</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function StatPanel({ title, data, filterKey, currentFilter, actionsMap = {}, onToggle, onSetAction }: any) {
  const hiddenCount = Object.values(actionsMap).filter((act: any) => act === "hide").length;
  const invertedCount = Object.values(actionsMap).filter((act: any) => act === "invert_all" || act === "invert_buy" || act === "invert_sell").length;
  const hasFilter = currentFilter != null;
  const hasActions = hiddenCount > 0 || invertedCount > 0;

  return (
    <div className={`panel p-3 flex flex-col max-h-[320px] transition-all ${hiddenCount > 0 ? "border-bear/30 bg-bear/5" : invertedCount > 0 ? "border-cyan-500/30 bg-cyan-500/5" : hasFilter ? "border-primary/40 bg-primary/5" : ""}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase text-muted-foreground font-bold shrink-0 flex items-center gap-1.5 flex-wrap">
          <span>{title}</span>
          {hiddenCount > 0 && (
            <span className="text-[9px] bg-bear/20 text-bear px-1.5 py-0.2 rounded border border-bear/30 font-normal flex items-center gap-1">
              <EyeOff className="w-2.5 h-2.5" />
              {hiddenCount} oculto{hiddenCount > 1 ? "s" : ""}
            </span>
          )}
          {invertedCount > 0 && (
            <span className="text-[9px] bg-cyan-500/20 text-cyan-300 px-1.5 py-0.2 rounded border border-cyan-500/30 font-normal flex items-center gap-1">
              <RefreshCw className="w-2.5 h-2.5" />
              {invertedCount} invertido{invertedCount > 1 ? "s" : ""}
            </span>
          )}
          {hasFilter && (
            <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.2 rounded border border-primary/30 font-normal">
              Filtro: {currentFilter}
            </span>
          )}
        </div>
        {(hasFilter || hasActions) && (
          <button
            onClick={() => {
              if (hasFilter) onToggle(filterKey, currentFilter);
              if (hasActions) {
                Object.keys(actionsMap).forEach((val) => onSetAction(filterKey, val, "none"));
              }
            }}
            className="text-[9px] text-muted-foreground hover:text-white underline cursor-pointer shrink-0"
            title="Limpar filtros e inversões deste indicador"
          >
            Limpar
          </button>
        )}
      </div>
      <div className="overflow-y-auto flex-1 custom-scrollbar">
        <table className="w-full text-[11px] ticker text-center">
          <thead className="text-muted-foreground sticky top-0 bg-[#131722] z-10">
            <tr>
              <th className="text-left font-normal pb-1">FAIXA</th>
              <th className="font-normal pb-1">OP.</th>
              <th className="font-normal pb-1">WR</th>
              <th className="font-normal pb-1 text-[#00ff88]" colSpan={2}>COMPRA</th>
              <th className="font-normal pb-1 text-[#ff3366]" colSpan={2}>VENDA</th>
            </tr>
            <tr className="text-[9px]">
              <th></th><th></th><th></th>
              <th className="font-normal text-[#00ff88]/60">QTD</th>
              <th className="font-normal text-[#00ff88]/60">WR</th>
              <th className="font-normal text-[#ff3366]/60">QTD</th>
              <th className="font-normal text-[#ff3366]/60">WR</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r: any) => {
              const currentAction: RangeAction = actionsMap[r.label] || "none";
              const isSelected = currentFilter === r.label;

              return (
                <StatRow 
                  key={r.label}
                  r={r}
                  filterKey={filterKey}
                  isSelected={isSelected}
                  currentAction={currentAction}
                  onToggle={onToggle}
                  onSetAction={onSetAction}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatRow({ r, filterKey, isSelected, currentAction, onToggle, onSetAction }: any) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMenuOpen]);

  const isHidden = currentAction === "hide";
  const isInvertedAll = currentAction === "invert_all";
  const isInvertedBuy = currentAction === "invert_buy";
  const isInvertedSell = currentAction === "invert_sell";

  const handleClick = (e: React.MouseEvent) => {
    onToggle(filterKey, r.label);
  };

  return (
    <tr
      onClick={handleClick}
      className={`border-t border-border/60 cursor-pointer transition-colors group select-none ${
        isHidden
          ? "bg-bear/10 opacity-40 text-muted-foreground line-through"
          : isInvertedAll
          ? "bg-cyan-500/10 border-l-2 border-l-cyan-400 font-medium"
          : isInvertedBuy
          ? "bg-bull/10 border-l-2 border-l-bull font-medium"
          : isInvertedSell
          ? "bg-bear/10 border-l-2 border-l-bear font-medium"
          : isSelected
          ? "bg-primary/20"
          : "hover:bg-secondary/60"
      }`}
      title={
        isHidden
          ? "Faixa Oculta dos Cálculos"
          : isInvertedAll
          ? "Faixa Invertida (Geral: WIN ↔ LOSS)"
          : isInvertedBuy
          ? "Faixa Invertida (Apenas Compras)"
          : isInvertedSell
          ? "Faixa Invertida (Apenas Vendas)"
          : "Clique na linha: Isolar/Filtrar | Clique na seta para abrir o menu multifunção"
      }
    >
      <td className={`py-1.5 text-left flex items-center gap-1.5 ${isSelected ? "text-primary font-bold" : isHidden ? "text-bear/80 line-through" : "text-white"}`}>
        <div className="relative inline-block" ref={menuRef}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsMenuOpen(prev => !prev);
            }}
            className={`p-1 rounded transition-all flex items-center gap-0.5 ${
              isInvertedAll
                ? "text-cyan-400 bg-cyan-500/20 border border-cyan-500/40"
                : isInvertedBuy
                ? "text-bull bg-bull/20 border border-bull/40"
                : isInvertedSell
                ? "text-bear bg-bear/20 border border-bear/40"
                : isHidden
                ? "text-amber-400 bg-amber-500/20 border border-amber-500/40"
                : "text-muted-foreground/60 hover:text-white hover:bg-white/10 opacity-70 group-hover:opacity-100"
            }`}
            title="Menu multifunção (Inverter, Ocultar...)"
          >
            {isInvertedAll && <RefreshCw className="w-3 h-3 text-cyan-400" />}
            {isInvertedBuy && <TrendingUp className="w-3 h-3 text-bull" />}
            {isInvertedSell && <TrendingDown className="w-3 h-3 text-bear" />}
            {isHidden && <EyeOff className="w-3 h-3 text-amber-400" />}
            <ChevronDown className="w-3 h-3" />
          </button>

          {isMenuOpen && (
            <div
              className="absolute left-0 top-full mt-1 z-50 bg-[#1e2330] border border-cyan-500/40 rounded-md p-1 shadow-2xl flex items-center gap-1 backdrop-blur-md whitespace-nowrap"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => {
                  onSetAction(filterKey, r.label, isInvertedAll ? "none" : "invert_all");
                  setIsMenuOpen(false);
                  toast.info(`Inversão GERAL ${isInvertedAll ? "desativada" : "ativada"} para "${r.label}"`);
                }}
                className={`p-1.5 rounded transition-all flex items-center justify-center ${
                  isInvertedAll ? "bg-cyan-500/30 text-cyan-300 font-bold border border-cyan-400/50" : "hover:bg-cyan-500/20 text-cyan-400"
                }`}
                title="Inverter Tudo (Geral): Inverte WIN <-> LOSS de todas as operações nesta faixa"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  onSetAction(filterKey, r.label, isInvertedBuy ? "none" : "invert_buy");
                  setIsMenuOpen(false);
                  toast.info(`Inversão de COMPRA ${isInvertedBuy ? "desativada" : "ativada"} para "${r.label}"`);
                }}
                className={`p-1.5 rounded transition-all flex items-center justify-center ${
                  isInvertedBuy ? "bg-bull/30 text-bull font-bold border border-bull/50" : "hover:bg-bull/20 text-bull"
                }`}
                title="Inverter Compra (BUY): Inverte apenas operações de COMPRA nesta faixa"
              >
                <TrendingUp className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  onSetAction(filterKey, r.label, isInvertedSell ? "none" : "invert_sell");
                  setIsMenuOpen(false);
                  toast.info(`Inversão de VENDA ${isInvertedSell ? "desativada" : "ativada"} para "${r.label}"`);
                }}
                className={`p-1.5 rounded transition-all flex items-center justify-center ${
                  isInvertedSell ? "bg-bear/30 text-bear font-bold border border-bear/50" : "hover:bg-bear/20 text-bear"
                }`}
                title="Inverter Venda (SELL): Inverte apenas operações de VENDA nesta faixa"
              >
                <TrendingDown className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  onSetAction(filterKey, r.label, isHidden ? "none" : "hide");
                  setIsMenuOpen(false);
                  toast.info(`Faixa "${r.label}" ${isHidden ? "reexibida" : "ocultada"}`);
                }}
                className={`p-1.5 rounded transition-all flex items-center justify-center ${
                  isHidden ? "bg-amber-500/30 text-amber-300 font-bold border border-amber-400/50" : "hover:bg-amber-500/20 text-amber-400"
                }`}
                title="Ocultar / Excluir: Remove esta faixa dos cálculos das estatísticas"
              >
                <EyeOff className="w-3.5 h-3.5" />
              </button>

              {currentAction !== "none" && (
                <button
                  type="button"
                  onClick={() => {
                    onSetAction(filterKey, r.label, "none");
                    setIsMenuOpen(false);
                    toast.info(`Faixa "${r.label}" restaurada ao padrão`);
                  }}
                  className="p-1.5 rounded hover:bg-white/10 text-muted-foreground transition-all flex items-center justify-center"
                  title="Restaurar: Remove qualquer inversão ou ocultação nesta faixa"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
        <span className="truncate max-w-[110px] flex items-center gap-1">
          {r.label === "N/A" ? "Indisp." : r.label}
          {isInvertedAll && <span className="text-[9px] text-cyan-400 font-bold">(Inv)</span>}
          {isInvertedBuy && <span className="text-[9px] text-bull font-bold">(Inv C)</span>}
          {isInvertedSell && <span className="text-[9px] text-bear font-bold">(Inv V)</span>}
        </span>
      </td>
      <td>{r.trades}</td>
      <td className={r.wr >= 55 ? "text-bull" : (r.trades > 0 && r.wr < 50 ? "text-bear" : "")}>{r.trades > 0 ? `${r.wr.toFixed(1)}%` : "-"}</td>
      <td className="text-[#00ff88]/60">{r.typeTrades["BUY"] || 0}</td>
      <td className="text-[#00ff88]/80">{r.typeTrades["BUY"] > 0 ? `${r.wrBuy.toFixed(1)}%` : "-"}</td>
      <td className="text-[#ff3366]/60">{r.typeTrades["SELL"] || 0}</td>
      <td className="text-[#ff3366]/80">{r.typeTrades["SELL"] > 0 ? `${r.wrSell.toFixed(1)}%` : "-"}</td>
    </tr>
  );
}

function Tile({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className="stat-tile bg-[#1a1e29] border border-border/50 rounded p-4 flex flex-col justify-center shadow-sm">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 opacity-80">{label}</div>
      <div className={`text-2xl font-black ticker tracking-tight ${color ?? "text-white"}`}>{value}</div>
    </div>
  );
}
