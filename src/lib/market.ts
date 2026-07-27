import { classifyCandleWick } from "@/lib/candleWick";

export type Candle = {
  t: number; // timestamp ms
  o: number;
  h: number;
  l: number;
  c: number;
};

export type Asset = {
  symbol: string;
  name: string;
  type: "synthetic" | "forex";
  vol: number; // volatility
  base: number;
};

export const ASSETS: Asset[] = [
  // Synthetic Indices — Volatility
  { symbol: "R_100", name: "Volatility 100 Index", type: "synthetic", vol: 0.012, base: 1200 },
  { symbol: "R_75", name: "Volatility 75 Index", type: "synthetic", vol: 0.009, base: 850 },
  { symbol: "R_50", name: "Volatility 50 Index", type: "synthetic", vol: 0.006, base: 320 },
  { symbol: "R_25", name: "Volatility 25 Index", type: "synthetic", vol: 0.004, base: 180 },
  { symbol: "R_10", name: "Volatility 10 Index", type: "synthetic", vol: 0.002, base: 95 },
  // Synthetic Indices — Volatility (1s)
  { symbol: "R_100S", name: "Volatility 100 (1s) Index", type: "synthetic", vol: 0.012, base: 1200 },
  { symbol: "R_75S", name: "Volatility 75 (1s) Index", type: "synthetic", vol: 0.009, base: 850 },
  { symbol: "R_50S", name: "Volatility 50 (1s) Index", type: "synthetic", vol: 0.006, base: 320 },
  { symbol: "R_25S", name: "Volatility 25 (1s) Index", type: "synthetic", vol: 0.004, base: 180 },
  { symbol: "R_10S", name: "Volatility 10 (1s) Index", type: "synthetic", vol: 0.002, base: 95 },

  // Forex
  { symbol: "EURUSD", name: "Euro / Dólar", type: "forex", vol: 0.0006, base: 1.0850 },
  { symbol: "GBPUSD", name: "Libra / Dólar", type: "forex", vol: 0.0008, base: 1.2710 },
  { symbol: "USDJPY", name: "Dólar / Iene", type: "forex", vol: 0.0007, base: 152.4 },
  { symbol: "AUDUSD", name: "Dólar Australiano / Dólar", type: "forex", vol: 0.0007, base: 0.6520 },
  { symbol: "USDCAD", name: "Dólar / Dólar Canadense", type: "forex", vol: 0.0007, base: 1.3620 },
  { symbol: "USDCHF", name: "Dólar / Franco Suíço", type: "forex", vol: 0.0007, base: 0.9040 },
  { symbol: "EURGBP", name: "Euro / Libra", type: "forex", vol: 0.0006, base: 0.8530 },
  { symbol: "EURJPY", name: "Euro / Iene", type: "forex", vol: 0.0008, base: 165.3 },
  { symbol: "GBPJPY", name: "Libra / Iene", type: "forex", vol: 0.0009, base: 193.8 },
  { symbol: "NZDUSD", name: "Dólar Neozelandês / Dólar", type: "forex", vol: 0.0008, base: 0.5980 },
  // Commodities
  { symbol: "XAUUSD", name: "Ouro / Dólar", type: "forex", vol: 0.0015, base: 2310 },
  { symbol: "XAGUSD", name: "Prata / Dólar", type: "forex", vol: 0.002, base: 27.5 },
];
/**
 * Maps our internal symbols to Deriv API technical symbols.
 * Critical for Synthetic Indices (1s) which have non-obvious technical IDs.
 */
export const SYMBOL_MAP: Record<string, string> = {
  R_10S: "1HZ10V",
  R_25S: "1HZ25V",
  R_50S: "1HZ50V",
  R_75S: "1HZ75V",
  R_100S: "1HZ100V",
  // Forex
  EURUSD: "frxEURUSD",
  GBPUSD: "frxGBPUSD",
  USDJPY: "frxUSDJPY",
  AUDUSD: "frxAUDUSD",
  USDCAD: "frxUSDCAD",
  USDCHF: "frxUSDCHF",
  EURGBP: "frxEURGBP",
  EURJPY: "frxEURJPY",
  GBPJPY: "frxGBPJPY",
  NZDUSD: "frxNZDUSD",
  // Commodities
  XAUUSD: "frxXAUUSD",
  XAGUSD: "frxXAGUSD",
  JD10: "JD10",
  JD25: "JD25",
  JD50: "JD50",
  JD75: "JD75",
  JD100: "JD100"
};

/**
 * Inverse mapping for incoming technical symbols (ticks/history) back to internal IDs.
 */
export const REVERSE_SYMBOL_MAP: Record<string, string> = Object.entries(SYMBOL_MAP).reduce((acc, [k, v]) => {
  acc[v] = k;
  return acc;
}, {} as Record<string, string>);

export function getDerivSymbol(symbol: string): string {
  return SYMBOL_MAP[symbol] || symbol;
}

export function getInternalSymbol(derivSymbol: string): string {
  return REVERSE_SYMBOL_MAP[derivSymbol] || derivSymbol;
}


// Seeded PRNG so candles are stable for backtests
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateCandles(asset: Asset, count: number, seed = 42, intervalMs = 60_000): Candle[] {
  const rand = mulberry32(seed + (asset?.symbol?.length || 5) * 7);
  const out: Candle[] = [];
  let price = asset.base;
  const now = Date.now();
  for (let i = count - 1; i >= 0; i--) {
    const t = now - i * intervalMs;
    const drift = (rand() - 0.5) * asset.vol * price;
    const o = price;
    const c = Math.max(0.0001, o + drift + (rand() - 0.5) * asset.vol * price * 0.6);
    const h = Math.max(o, c) + rand() * asset.vol * price * 0.5;
    const l = Math.min(o, c) - rand() * asset.vol * price * 0.5;
    out.push({ t, o, h, l, c });
    price = c;
  }
  return out;
}

export function nextCandle(prev: Candle, asset: Asset, intervalMs = 60_000): Candle {
  const rand = Math.random;
  const o = prev.c;
  const drift = (rand() - 0.5) * asset.vol * o * 1.2;
  const c = Math.max(0.0001, o + drift);
  const h = Math.max(o, c) + rand() * asset.vol * o * 0.6;
  const l = Math.min(o, c) - rand() * asset.vol * o * 0.6;
  return { t: prev.t + intervalMs, o, h, l, c };
}

// Indicators
export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

export function parabolicSar(highs: number[], lows: number[], afStep = 0.02, afMax = 0.2): { sar: number[]; trend: number[]; af: number[] } {
  const len = highs.length;
  const sar = new Array(len).fill(null);
  const trend = new Array(len).fill(1);
  const af = new Array(len).fill(afStep);

  if (len < 3) return { sar, trend, af };

  let cTrend = 1;
  let cSAR = lows[0];
  let cEP = highs[0];
  let cAF = afStep;

  sar[0] = cSAR;
  trend[0] = cTrend;
  af[0] = cAF;

  for (let i = 1; i < len; i++) {
    const h = highs[i];
    const l = lows[i];

    let newSAR = cSAR + cAF * (cEP - cSAR);

    if (cTrend === 1) {
      if (i >= 2) newSAR = Math.min(newSAR, lows[i - 1], lows[i - 2]);
      else newSAR = Math.min(newSAR, lows[i - 1]);

      if (l < newSAR) {
        cTrend = -1;
        newSAR = cEP;
        cEP = l;
        cAF = afStep;
      } else {
        if (h > cEP) {
          cEP = h;
          cAF = Math.min(cAF + afStep, afMax);
        }
      }
    } else {
      if (i >= 2) newSAR = Math.max(newSAR, highs[i - 1], highs[i - 2]);
      else newSAR = Math.max(newSAR, highs[i - 1]);

      if (h > newSAR) {
        cTrend = 1;
        newSAR = cEP;
        cEP = h;
        cAF = afStep;
      } else {
        if (l < cEP) {
          cEP = l;
          cAF = Math.min(cAF + afStep, afMax);
        }
      }
    }

    cSAR = newSAR;
    sar[i] = cSAR;
    trend[i] = cTrend;
    af[i] = cAF;
  }

  return { sar, trend, af };
}

export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = [null];
  let gains = 0, losses = 0;
  for (let i = 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const g = Math.max(0, diff);
    const l = Math.max(0, -diff);
    if (i <= period) {
      gains += g; losses += l;
      if (i === period) {
        const rs = gains / Math.max(losses, 1e-9);
        out.push(100 - 100 / (1 + rs));
      } else out.push(null);
    } else {
      gains = (gains * (period - 1) + g) / period;
      losses = (losses * (period - 1) + l) / period;
      const rs = gains / Math.max(losses, 1e-9);
      out.push(100 - 100 / (1 + rs));
    }
  }
  return out;
}

export function bollinger(values: number[], period = 20, mult = 2) {
  const ma = sma(values, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1 || ma[i] == null) { upper.push(null); lower.push(null); continue; }
    const slice = values.slice(i - period + 1, i + 1);
    const m = ma[i] as number;
    const variance = slice.reduce((a, b) => a + (b - m) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    upper.push(m + mult * sd);
    lower.push(m - mult * sd);
  }
  return { ma, upper, lower };
}

export function ema(data: number[], period: number): (number | null)[] {
  if (data.length < period) return data.map(() => null);
  const result: (number | null)[] = [];
  const k = 2 / (period + 1);
  let initialSma = 0;
  for (let i = 0; i < period; i++) initialSma += data[i];
  initialSma /= period;
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else if (i === period - 1) {
      result.push(initialSma);
    } else {
      const prev = result[i - 1] as number;
      result.push(data[i] * k + prev * (1 - k));
    }
  }
  return result;
}

export function adx(
  candles: Candle[],
  period: number = 14
): {
  adx: (number | null)[];
  plusDi: (number | null)[];
  minusDi: (number | null)[];
} {
  const result: {
    adx: (number | null)[];
    plusDi: (number | null)[];
    minusDi: (number | null)[];
  } = { adx: [], plusDi: [], minusDi: [] };

  if (candles.length < period + 1) {
    return {
      adx: candles.map(() => null),
      plusDi: candles.map(() => null),
      minusDi: candles.map(() => null),
    };
  }

  const tr = [0];
  const plusDm = [0];
  const minusDm = [0];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].h;
    const low = candles[i].l;
    const prevHigh = candles[i - 1].h;
    const prevLow = candles[i - 1].l;
    const prevClose = candles[i - 1].c;

    tr.push(
      Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      )
    );

    const upMove = high - prevHigh;
    const downMove = prevLow - low;

    if (upMove > downMove && upMove > 0) plusDm.push(upMove);
    else plusDm.push(0);

    if (downMove > upMove && downMove > 0) minusDm.push(downMove);
    else minusDm.push(0);
  }

  // Wilder smoothing
  const smooth = (data: number[]): number[] => {
    const smoothed: number[] = [0];
    let sum = 0;
    for (let i = 1; i < period; i++) sum += data[i];
    for (let i = 1; i < data.length; i++) {
      if (i < period) {
        smoothed.push(sum);
      } else if (i === period) {
        sum += data[i];
        smoothed.push(sum);
      } else {
        smoothed.push(smoothed[i - 1] - smoothed[i - 1] / period + data[i]);
      }
    }
    return smoothed;
  };

  const str = smooth(tr);
  const splusDm = smooth(plusDm);
  const sminusDm = smooth(minusDm);

  const dx: number[] = [0];

  for (let i = 1; i < candles.length; i++) {
    if (i < period) {
      result.plusDi.push(null);
      result.minusDi.push(null);
      dx.push(0);
    } else {
      const pDi = 100 * (splusDm[i] / (str[i] || 1));
      const mDi = 100 * (sminusDm[i] / (str[i] || 1));
      result.plusDi.push(pDi);
      result.minusDi.push(mDi);
      dx.push(100 * (Math.abs(pDi - mDi) / (pDi + mDi || 1)));
    }
  }

  // ADX = Wilder smooth of DX, starting at index (period * 2 - 1)
  for (let i = 0; i < candles.length; i++) {
    if (i < period * 2 - 1) {
      result.adx.push(null);
    } else if (i === period * 2 - 1) {
      let sum = 0;
      for (let j = period; j <= i; j++) sum += dx[j];
      result.adx.push(sum / period);
    } else {
      const prevAdx = result.adx[i - 1] as number;
      result.adx.push((prevAdx * (period - 1) + dx[i]) / period);
    }
  }

  // Pad index 0 for plusDi / minusDi (they start at index 1 in the loop)
  result.plusDi.unshift(null);
  result.minusDi.unshift(null);

  // Trim to exact candles length
  while (result.plusDi.length > candles.length) result.plusDi.pop();
  while (result.minusDi.length > candles.length) result.minusDi.pop();
  while (result.adx.length > candles.length) result.adx.pop();

  return result;
}

export function fmtPrice(v: number, asset?: Asset) {
  const decimals = asset?.type === "forex" ? (asset.symbol.includes("JPY") ? 3 : 5) : 2;
  return v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function macd(data: number[], fast = 12, slow = 26, signal = 9) {
  const fastEma = ema(data, fast);
  const slowEma = ema(data, slow);
  
  const macdLine = data.map((_, i) => {
    if (fastEma[i] === null || slowEma[i] === null) return null;
    return fastEma[i]! - slowEma[i]!;
  });
  
  const validMacdValues = macdLine.filter(v => v !== null) as number[];
  const signalEma = ema(validMacdValues, signal);
  let signalIdx = 0;
  
  const signalLine = macdLine.map(v => {
    if (v === null) return null;
    return signalEma[signalIdx++] ?? null;
  });
  
  const histogram = macdLine.map((v, i) => {
    if (v === null || signalLine[i] === null) return null;
    return v - signalLine[i]!;
  });
  
  return { macd: macdLine, signal: signalLine, histogram };
}

/**
 * Aggregates low-granularity candles (e.g. 1m) into higher ones (e.g. 2m, 10m).
 * Ensures candles start at 'round times' (e.g. 10:00, 10:10).
 */
export function resampleCandles(candles1m: Candle[], targetMinutes: number): Candle[] {
  if (candles1m.length === 0) return [];
  const intervalMs = targetMinutes * 60 * 1000;
  
  // Group 1m candles by the start of their target period
  const groups: Record<number, Candle[]> = {};
  for (const c of candles1m) {
    const periodStart = Math.floor(c.t / intervalMs) * intervalMs;
    if (!groups[periodStart]) groups[periodStart] = [];
    groups[periodStart].push(c);
  }
  
  const sortedTs = Object.keys(groups).map(Number).sort((a, b) => a - b);
  const result: Candle[] = [];
  
  for (const ts of sortedTs) {
    const cluster = groups[ts];
    if (cluster.length === 0) continue;
    
    result.push({
      t: ts,
      o: cluster[0].o,
      h: Math.max(...cluster.map(c => c.h)),
      l: Math.min(...cluster.map(c => c.l)),
      c: cluster[cluster.length - 1].c
    });
  }
  
  return result;
}

export function getPattern(candles: Candle[], index: number): string | null {

  if (index < 2) return null;
  const c = candles[index];
  const p1 = candles[index - 1]; // prev 1

  const body = Math.abs(c.o - c.c);
  const upperShadow = c.c > c.o ? c.h - c.c : c.h - c.o;
  const lowerShadow = c.c > c.o ? c.o - c.l : c.c - c.l;
  const isBullish = c.c > c.o;
  const isBearish = c.c < c.o;

  const p1Body = Math.abs(p1.o - p1.c);
  const p1Bullish = p1.c > p1.o;
  const p1Bearish = p1.c < p1.o;

  // Doji
  if (body < (c.h - c.l) * 0.1) return "Doji";
  
  // Hammer / Hanging Man (lower shadow at least 2x body, upper shadow very small)
  if (lowerShadow > body * 2 && upperShadow < body * 0.5) return "Hammer/HangingMan";
  
  // Shooting Star / Inverted Hammer
  if (upperShadow > body * 2 && lowerShadow < body * 0.5) return "ShootingStar";

  // Engulfing
  if (p1Bearish && isBullish && c.c > p1.o && c.o < p1.c) return "BullishEngulfing";
  if (p1Bullish && isBearish && c.c < p1.o && c.o > p1.c) return "BearishEngulfing";

  // Harami (inside bar)
  if (p1Bullish && isBearish && c.o < p1.c && c.c > p1.o) return "BearishHarami";
  if (p1Bearish && isBullish && c.o > p1.c && c.c < p1.o) return "BullishHarami";

  return null;
}

/**
 * Average True Range (ATR)
 */
export function atr(candles: Candle[], period = 14): (number | null)[] {
  const result: (number | null)[] = [];
  if (candles.length === 0) return [];
  const tr: number[] = [candles[0].h - candles[0].l];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].h;
    const low = candles[i].l;
    const prevClose = candles[i - 1].c;
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }

  let currentAtr = 0;
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += tr[j];
      currentAtr = sum / period;
      result.push(currentAtr);
    } else {
      currentAtr = (currentAtr * (period - 1) + tr[i]) / period;
      result.push(currentAtr);
    }
  }
  return result;
}

/**
 * Williams %R
 */
export function williamsR(candles: Candle[], period = 14): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      out.push(null);
      continue;
    }
    const slice = candles.slice(i - period + 1, i + 1);
    const highest = Math.max(...slice.map(c => c.h));
    const lowest = Math.min(...slice.map(c => c.l));
    const denom = highest - lowest;
    const close = candles[i].c;
    if (denom === 0) {
      out.push(-50);
    } else {
      const r = ((highest - close) / denom) * -100;
      out.push(r);
    }
  }
  return out;
}

/**
 * Fibonacci Retracements levels (Swing 50)
 */
export function getFibonacciLevel(candles: Candle[], index: number, entryPrice: number): { closestLevel: string; pctDistance: number } {
  if (index < 50) return { closestLevel: "N/A", pctDistance: 999 };
  const slice = candles.slice(index - 49, index + 1);
  const highest = Math.max(...slice.map(c => c.h));
  const lowest = Math.min(...slice.map(c => c.l));
  const range = highest - lowest;
  if (range === 0) return { closestLevel: "N/A", pctDistance: 0 };

  const levels = {
    "Fib R0.0": lowest,
    "Fib R23.6": lowest + range * 0.236,
    "Fib R38.2": lowest + range * 0.382,
    "Fib R50.0": lowest + range * 0.5,
    "Fib R61.8": lowest + range * 0.618,
    "Fib R100.0": highest
  };

  let closestKey = "Fib R50.0";
  let minDiff = Infinity;
  Object.entries(levels).forEach(([k, val]) => {
    const diff = Math.abs(entryPrice - val);
    if (diff < minDiff) {
      minDiff = diff;
      closestKey = k;
    }
  });

  const pctDistance = (minDiff / entryPrice) * 100;
  return { closestLevel: closestKey, pctDistance };
}

/**
 * Pivot Points (Floor standard based on last 20 candles window)
 */
export function getPivotPoints(candles: Candle[], index: number, entryPrice: number) {
  if (index < 20) return { closestPivot: "N/A", pctDistance: 999 };
  const slice = candles.slice(index - 19, index + 1);
  const h = Math.max(...slice.map(c => c.h));
  const l = Math.min(...slice.map(c => c.l));
  const c = candles[index].c;

  const PP = (h + l + c) / 3;
  const R1 = 2 * PP - l;
  const S1 = 2 * PP - h;
  const R2 = PP + (h - l);
  const S2 = PP - (h - l);

  const pivots = { PP, R1, S1, R2, S2 };
  let closestKey = "PP";
  let minDiff = Infinity;
  Object.entries(pivots).forEach(([k, val]) => {
    const diff = Math.abs(entryPrice - val);
    if (diff < minDiff) {
      minDiff = diff;
      closestKey = k;
    }
  });

  const pctDistance = (minDiff / entryPrice) * 100;
  return { closestPivot: closestKey, pctDistance };
}

/**
 * Contextual Momentum Classifier
 * Reescreve com threshold adaptativo por ATR (20% do ATR%, min 0.05%, max 0.30%).
 */
export function classifyMarketMomentum(
  candles: Candle[],
  index: number,
  entryPrice: number,
  atrValue?: number
): string {
  if (index < 20) return "Sem Padrão Clássico";

  // Threshold adaptativo: 20% do ATR% ou mínimo 0.05%, máximo 0.30%
  const dynamicThresholdPct = atrValue && entryPrice > 0
    ? Math.min(0.3, Math.max(0.05, (atrValue / entryPrice) * 100 * 0.2))
    : 0.15;

  // Fibonacci bounce
  const { closestLevel, pctDistance: fibDist } = getFibonacciLevel(
    candles,
    index - 1,
    entryPrice
  );
  if (fibDist < dynamicThresholdPct) return `${closestLevel} Bounce`;

  // Pivot bounce
  const { closestPivot, pctDistance: pivDist } = getPivotPoints(
    candles,
    index - 1,
    entryPrice
  );
  if (pivDist < dynamicThresholdPct) return `Rebate Pivot ${closestPivot}`;

  // Consecutive candle momentum (last 3 before entry)
  const recent = candles.slice(Math.max(0, index - 3), index);
  if (recent.length >= 3) {
    const bodies = recent.map((c) => Math.abs(c.c - c.o));
    const directions = recent.map((c) => (c.c > c.o ? "UP" : "DOWN"));
    const avgBody =
      candles
        .slice(Math.max(0, index - 19), index)
        .reduce((sum, c) => sum + Math.abs(c.c - c.o), 0) /
      Math.min(19, index);

    const last3Similar = directions.every((d) => d === directions[2]);
    if (last3Similar && directions[2] === "UP" && bodies[2] > avgBody * 1.1)
      return "Forte Impulso de Alta (3+ Velas)";
    if (last3Similar && directions[2] === "DOWN" && bodies[2] > avgBody * 1.1)
      return "Forte Impulso de Baixa (3+ Velas)";

    const lastCandle = candles[index - 1];
    const lastCandleHighVol =
      Math.abs(lastCandle.c - lastCandle.o) > avgBody * 1.8;
    if (lastCandleHighVol) {
      return lastCandle.c > lastCandle.o
        ? "Aceleração Explosiva Compradora"
        : "Aceleração Explosiva Vendedora";
    }
  }

  // Consolidation check
  const lookback = Math.min(9, index);
  const rangeSlice = candles.slice(index - lookback, index);
  if (rangeSlice.length > 0) {
    const rangeHigh = Math.max(...rangeSlice.map((c) => c.h));
    const rangeLow = Math.min(...rangeSlice.map((c) => c.l));
    const totalRange = rangeHigh - rangeLow;
    const avgBody2 =
      rangeSlice.reduce((sum, c) => sum + Math.abs(c.c - c.o), 0) /
      rangeSlice.length;
    if (totalRange > 0 && avgBody2 < totalRange / 8)
      return "Consolidação Estreita / Ruído";
  }

  return "Lateralização Ordenada";
}

/**
 * Market Structure Detector — Zig-Zag with adaptive ATR margin.
 * REESCRITO: pivôs com wing configurável, margem flat proporcional ao ATR,
 * threshold de range adaptativo.
 */
export function detectMarketStructure(
  candles: Candle[],
  index: number
): string {
  if (index < 60 || candles.length < 60) return "Sem Estrutura Definida";

  const slice = candles.slice(0, index + 1);

  // ─── 1. Swing detection helper ──────────────────────────────────────────
  interface Swing {
    val: number;
    idx: number;
    type: "high" | "low";
  }

  function findSwings(
    slice: Candle[],
    fromIdx: number,
    toIdx: number,
    wing: number
  ): { highs: Swing[]; lows: Swing[] } {
    const highs: Swing[] = [];
    const lows: Swing[] = [];
    const minDist = wing * 2;

    for (let t = fromIdx; t >= toIdx; t--) {
      if (t < wing || t + wing >= slice.length) continue;

      const cur = slice[t];
      let isHigh = true;
      let isLow = true;

      for (let w = 1; w <= wing; w++) {
        if (slice[t - w].h >= cur.h) isHigh = false;
        if (slice[t + w].h >= cur.h) isHigh = false;
        if (slice[t - w].l <= cur.l) isLow = false;
        if (slice[t + w].l <= cur.l) isLow = false;
      }

      if (isHigh) {
        const last = highs[highs.length - 1];
        if (!last || Math.abs(last.idx - t) >= minDist) {
          highs.push({ val: cur.h, idx: t, type: "high" });
        } else if (cur.h > last.val) {
          highs[highs.length - 1] = { val: cur.h, idx: t, type: "high" };
        }
      }

      if (isLow) {
        const last = lows[lows.length - 1];
        if (!last || Math.abs(last.idx - t) >= minDist) {
          lows.push({ val: cur.l, idx: t, type: "low" });
        } else if (cur.l < last.val) {
          lows[lows.length - 1] = { val: cur.l, idx: t, type: "low" };
        }
      }
    }

    highs.sort((a, b) => a.idx - b.idx);
    lows.sort((a, b) => a.idx - b.idx);
    return { highs, lows };
  }

  // Scan last 57 bars, starting 3 bars before index (wing buffer)
  const { highs: swingHighs, lows: swingLows } = findSwings(
    slice,
    index - 3,
    Math.max(3, index - 57),
    3
  );

  // ─── 2. EMA context ─────────────────────────────────────────────────────
  const closes = slice.map((c) => c.c);

  const getLastValid = (arr: (number | null)[]): number | null => {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i] !== null) return arr[i];
    }
    return null;
  };

  const e9  = getLastValid(ema(closes, 9));
  const e21 = getLastValid(ema(closes, 21));
  const e50 = getLastValid(ema(closes, Math.min(closes.length - 1, 50)));

  const emaBullish =
    e9 !== null && e21 !== null && e50 !== null &&
    e9 > e21 && e21 > e50;
  const emaBearish =
    e9 !== null && e21 !== null && e50 !== null &&
    e9 < e21 && e21 < e50;

  // ─── 3. ADX for trend strength ──────────────────────────────────────────
  const adxData = adx(slice, 14);
  const lastAdxVal = getLastValid(adxData.adx);
  const isTrending = lastAdxVal !== null && lastAdxVal > 22;

  // ─── 4. ATR for adaptive flat margin ────────────────────────────────────
  const atrArr = atr(slice, 14);
  const lastAtrVal = getLastValid(atrArr) ?? 0;
  const currentClose = closes[index];
  const atrPct =
    currentClose > 0 ? (lastAtrVal / currentClose) * 100 : 0;

  // Flat margin = 0.5 × ATR (smaller than one ATR is considered "flat")
  const flatMargin = lastAtrVal * 0.5;

  // ─── 5. Zig-Zag classification ──────────────────────────────────────────
  if (swingHighs.length >= 2 && swingLows.length >= 2) {
    const shLast = swingHighs[swingHighs.length - 1].val;
    const shPrev = swingHighs[swingHighs.length - 2].val;
    const slLast = swingLows[swingLows.length - 1].val;
    const slPrev = swingLows[swingLows.length - 2].val;

    // Higher Highs / Higher Lows
    if (shLast > shPrev + flatMargin && slLast > slPrev + flatMargin) {
      if (isTrending && emaBullish) return "Alta Forte (HH+HL+ADX+EMA)";
      if (isTrending)                     return "Alta com ADX (HH+HL)";
      return "Zig-Zag de Alta (HH+HL)";
    }

    // Lower Highs / Lower Lows
    if (shLast < shPrev - flatMargin && slLast < slPrev - flatMargin) {
      if (isTrending && emaBearish) return "Baixa Forte (LH+LL+ADX+EMA)";
      if (isTrending)                return "Baixa com ADX (LH+LL)";
      return "Zig-Zag de Baixa (LH+LL)";
    }

    // Expanding range (HH + LL simultaneously)
    if (shLast > shPrev + flatMargin && slLast < slPrev - flatMargin)
      return "Expansão / Reversão";

    // Compression / triangle (LH + HL simultaneously)
    if (shLast < shPrev - flatMargin && slLast > slPrev + flatMargin)
      return "Compressão / Triângulo";

    // Lateral: both swing deltas within 1 ATR
    const highDelta = Math.abs(shLast - shPrev);
    const lowDelta = Math.abs(slLast - slPrev);
    if (lastAtrVal > 0 && highDelta <= lastAtrVal && lowDelta <= lastAtrVal)
      return "Canal Lateral";
  }

  // ─── 6. ADX + EMA fallback (insufficient pivots) ────────────────────────
  if (isTrending) {
    if (emaBullish) return "Alta (ADX+EMA)";
    if (emaBearish) return "Baixa (ADX+EMA)";
  }

  // ─── 7. ATR-based range/noise detection ─────────────────────────────────
  const last20 = slice.slice(Math.max(0, index - 19), index + 1);
  const last20High = Math.max(...last20.map((c) => c.h));
  const last20Low  = Math.min(...last20.map((c) => c.l));
  const totalRange20 = last20High - last20Low;

  if (lastAtrVal > 0 && totalRange20 < lastAtrVal * 3) {
    return atrPct < 0.05
      ? "Lateral Baixa Volatilidade"
      : "Range Comprimido";
  }

  return "Oscilação";
}

export function computeIndicatorValues(
  candles: Candle[],
  symbol: string,
  rawResult: any
): Record<string, any> {
  if (!candles || candles.length === 0) {
    return {
      _expiryCandles: rawResult?.expiryCandles ?? null,
      _asset: symbol,
    };
  }

  const closes = candles.map(c => c.c);
  const lastIndex = candles.length - 1;
  const lastC = closes[lastIndex];

  // rsi, adx, macd
  const rsiArr = rsi(closes, 14);
  const lastRsi = rsiArr[rsiArr.length - 1];

  const adxData = adx(candles, 14);
  const lastAdx = adxData.adx[adxData.adx.length - 1];

  const macdData = macd(closes, 12, 26, 9);
  const lastMacdHist = macdData.histogram[macdData.histogram.length - 1] || 0;

  // pattern
  const patternVal = getPattern(candles, lastIndex);

  // maTrend (checks ALL relevant MAs: 9, 21, 200, 235)
  const ma9Arr = sma(closes, 9);
  const ma21Arr = sma(closes, 21);
  const ma200Arr = sma(closes, 200);
  const ma235Arr = sma(closes, 235);
  const lastMA9 = ma9Arr[ma9Arr.length - 1] || 0;
  const lastMA21 = ma21Arr[ma21Arr.length - 1] || 0;
  const lastMA200 = ma200Arr[ma200Arr.length - 1] || 0;
  const lastMA235 = ma235Arr[ma235Arr.length - 1] || 0;
  const aboveAll = lastC > lastMA9 && lastC > lastMA21 && lastC > lastMA200 && lastC > lastMA235;
  const belowAll = lastC < lastMA9 && lastC < lastMA21 && lastC < lastMA200 && lastC < lastMA235;
  let maTrend: string = "Ranging/Mixed";
  if (aboveAll) maTrend = "Strong Bullish";
  else if (belowAll) maTrend = "Strong Bearish";
  else if (lastC > lastMA21 && lastC > lastMA200) maTrend = "Bullish";
  else if (lastC < lastMA21 && lastC < lastMA200) maTrend = "Bearish";

  // sar
  const sarData = parabolicSar(candles.map(c => c.h), candles.map(c => c.l));
  const lastSar = sarData.sar[sarData.sar.length - 1] || 0;
  const sarDist = lastSar ? ((lastC - lastSar) / lastC * 100) : 0;
  let sarBucket = "SAR: Baixista (Preço < SAR)";
  if (lastSar) {
    if (sarDist > 1) sarBucket = "SAR: Fortemente Altista (Preço > SAR > 1%)";
    else if (sarDist > 0) sarBucket = "SAR: Altista (Preço > SAR)";
    else if (sarDist < -1) sarBucket = "SAR: Fortemente Baixista (Preço < SAR < -1%)";
  }

  // atr
  const atrArr = atr(candles, 14);
  const lastAtr = atrArr && atrArr.length > 0 ? (atrArr[atrArr.length - 1] || 0) : 0;
  const pctAtr = lastC ? ((lastAtr / lastC) * 100) : 0;
  const atrBucket = pctAtr < 0.03 ? "Low Vol (< 0.03%)" : (pctAtr < 0.1 ? "Medium Vol (0.03% - 0.1%)" : "High Vol (> 0.1%)");

  // williams
  const williamsArr = williamsR(candles, 14);
  const lastWilliams = williamsArr && williamsArr.length > 0 ? (williamsArr[williamsArr.length - 1] ?? 0) : 0;
  const williamsBucket = lastWilliams <= -80 ? "Oversold (<= -80)" : (lastWilliams > -80 && lastWilliams < -20 ? "Neutral (-80 a -20)" : "Overbought (>= -20)");

  // fib & pivot level
  const fibInfo = getFibonacciLevel(candles, lastIndex, lastC);
  const pivotInfo = getPivotPoints(candles, lastIndex, lastC);

  // market moment & structure
  const marketMomentVal = classifyMarketMomentum(candles, lastIndex, lastC, lastAtr);
  const marketStructVal = detectMarketStructure(candles, lastIndex);

  // candleSize
  const candleSizeVal = lastC ? (Math.abs(candles[lastIndex].c - candles[lastIndex].o) / candles[lastIndex].o * 100) : 0;
  const candleSizeBucket = candleSizeVal < 0.02 ? "Pequeno (<0.02%)" : (candleSizeVal < 0.06 ? "Médio (0.02%-0.06%)" : "Grande (>0.06%)");

  // preEntryMomentum (direct candle analysis, not derived from marketMoment text)
  let preEntryBucket: string;
  if (candles.length >= 5) {
    const last5 = candles.slice(-5);
    const greenCount = last5.filter(c => c.c > c.o).length;
    const redCount = last5.filter(c => c.c < c.o).length;
    const avgBodyPct = last5.reduce((sum, c) => sum + (Math.abs(c.c - c.o) / c.o) * 100, 0) / 5;
    if (greenCount >= 4) {
      preEntryBucket = avgBodyPct > 0.06 ? "Impulso Altista Forte" : "Impulso Altista Moderado";
    } else if (redCount >= 4) {
      preEntryBucket = avgBodyPct > 0.06 ? "Impulso Baixista Forte" : "Impulso Baixista Moderado";
    } else if (avgBodyPct < 0.02) {
      preEntryBucket = "Lateralização / Sem Força";
    } else {
      preEntryBucket = "Misto / Correção";
    }
  } else {
    preEntryBucket = "Misto / Sem Histórico";
  }

  // bollingerState (actual Bollinger Band analysis, not derived from marketMoment text)
  let bollingerBucket: string;
  if (closes.length >= 20) {
    const bb = bollinger(closes, 20, 2);
    const idx = closes.length - 1;
    const u = bb.upper[idx];
    const l = bb.lower[idx];
    const m = bb.ma[idx];
    if (u != null && l != null && m != null) {
      const bandwidth = (u - l) / m;
      let sumBw = 0;
      let count = 0;
      for (let j = Math.max(0, idx - 19); j <= idx; j++) {
        const uj = bb.upper[j];
        const lj = bb.lower[j];
        const mj = bb.ma[j];
        if (uj != null && lj != null && mj != null) {
          sumBw += (uj - lj) / mj;
          count++;
        }
      }
      const avgBandwidth = count > 0 ? sumBw / count : bandwidth;
      if (bandwidth < avgBandwidth * 0.85) {
        bollingerBucket = "Squeeze (Bandas Estreitas)";
      } else if (bandwidth > avgBandwidth * 1.15) {
        bollingerBucket = "Estouro / Expansão Volatilidade";
      } else {
        bollingerBucket = "Neutro / Altas e Baixas Padrão";
      }
    } else {
      bollingerBucket = "N/A";
    }
  } else {
    bollingerBucket = "N/A";
  }

  // crossover (uses ma9Arr/ma21Arr already computed above)
  let crossoverBucket: string;
  if (closes.length >= 21) {
    const lastMa9 = ma9Arr[ma9Arr.length - 1] || 0;
    const lastMa21 = ma21Arr[ma21Arr.length - 1] || 0;
    const prevMa9 = ma9Arr[ma9Arr.length - 2] || 0;
    const prevMa21 = ma21Arr[ma21Arr.length - 2] || 0;
    if (prevMa9 <= prevMa21 && lastMa9 > lastMa21) crossoverBucket = "Cruzamento de Alta Recente (9x21)";
    else if (prevMa9 >= prevMa21 && lastMa9 < lastMa21) crossoverBucket = "Cruzamento de Baixa Recente (9x21)";
    else crossoverBucket = lastMa9 > lastMa21 ? "Alinhamento de Alta (9 > 21)" : "Alinhamento de Baixa (9 < 21)";
  } else {
    crossoverBucket = "N/A";
  }

  const indicatorValues: Record<string, any> = {
    _rsi: lastRsi,
    _adx: lastAdx,
    _macd: lastMacdHist > 0 ? "Bullish (Hist > 0)" : "Bearish (Hist < 0)",
    _pattern: patternVal,
    _maTrend: maTrend,
    _expiryCandles: rawResult?.expiryCandles ?? null,
    _asset: symbol,
    _sar: sarBucket,
    _williams: williamsBucket,
    _atr: atrBucket,
    _fibLevel: fibInfo.closestLevel,
    _pivotLevel: pivotInfo.closestPivot,
    _marketMoment: marketMomentVal,
    _marketStructure: marketStructVal,
    _candleSize: candleSizeBucket,
    _pavioClass: rawResult?.action ? classifyCandleWick(candles[lastIndex], rawResult.action as "CALL" | "PUT" | "BUY" | "SELL") : "N/A",
    _preEntryMomentum: preEntryBucket,
    _bollingerState: bollingerBucket,
    _indicatorCrossover: crossoverBucket,
  };

  // Merge custom stats from rawResult
  if (rawResult?.customStats) {
    Object.entries(rawResult.customStats).forEach(([k, v]) => {
      indicatorValues[`_stat_${k}`] = v;
      indicatorValues[k] = v;
    });
  }

  return indicatorValues;
}

