import { Candle, rsi, sma, ema, bollinger, adx, macd, parabolicSar, getPattern, resampleCandles, atr, williamsR, getFibonacciLevel, getPivotPoints, classifyMarketMomentum, detectMarketStructure, computeIndicatorValues } from "@/lib/market";
import { Trade, RiskConfig, ForexConfig, SRLine, SRZone } from "@/lib/store";
import { StrategyContext, StrategyResult, StrategyFilterValue, applyFilterLogic } from "@/strategies";
import { classifyCandleWick } from "@/lib/candleWick";

export function computeWhatIfStats(
   startIdx: number,
   entry: number,
   type: "CALL" | "PUT" | "BUY" | "SELL",
   intervalMs: number,
   candles: Candle[]
): Record<string, string> {
   const whatIf: Record<string, string> = {};
   const currentTfMinutes = (intervalMs || 60000) / 60000;
   const intervals = [1, 2, 3, 5, 10, 15];
   const candlesList = [1, 2, 3, 5, 10, 15];

   const dirType = (type === "BUY" || type === "CALL") ? "CALL" : "PUT";

   intervals.forEach(inv => {
      candlesList.forEach(cnt => {
         const totalMinutes = inv * cnt;
         const candleOffset = Math.round(totalMinutes / currentTfMinutes);
         const targetIdx = candleOffset >= 1 ? (startIdx + candleOffset - 1) : 999999999;
         if (targetIdx < candles.length) {
            const cp = candles[targetIdx].c;
            const w = dirType === "CALL" ? cp > entry : cp < entry;
            whatIf[`wi_${inv}_${cnt}`] = w ? "WIN" : "LOSS";
         }
      });
   });
   return whatIf;
}

export function runFullBacktest(
   candles: Candle[],
   assetSym: string,
   strategyMod: { id?: string, onTick: (ctx: StrategyContext) => StrategyResult | null } | null,
   balance: number,
   riskConf: RiskConfig,
   forexConf: ForexConfig,
   marketType: "binary" | "forex",
   intervalMs: number,
   srLines: SRLine[] = [],
   srZones: SRZone[] = [],
   activeFilters?: Record<string, StrategyFilterValue>,
   globalInvert: boolean = false,
   strategyDirection?: "all" | "buy" | "sell",
   trendLines: any[] = [],
   operationsPerBar: number = 1,
   sequenceConfig?: { enabled: boolean; maxEntradas: number }
): Trade[] {
   if (!strategyMod || typeof strategyMod.onTick !== "function") return [];
   const trades: Trade[] = [];
   let currentBalance = balance;
   let activeTrade: Trade | null = null;

   const cArray = candles.map(c => c.c);
   const allRsi = rsi(cArray, 14);
   const allSma9 = sma(cArray, 9);
   const allSma21 = sma(cArray, 21);
   const allEma20 = ema(cArray, 20);
   const allBoll = bollinger(cArray, 20, 2);
   const allAdx = adx(candles, 14);
   const allMacd = macd(cArray, 12, 26, 9);
   const allSma200 = sma(cArray, 200);
   const allSma235 = sma(cArray, 235);
   const allSar = parabolicSar(candles.map(c => c.h), candles.map(c => c.l));
   const allAtr = atr(candles, 14);
   const allWilliams = williamsR(candles, 14);
   const mtfCache: Record<string, Candle[]> = {};

   // Optimization: Pre-map historical candles oncely to avoid O(N^2) object duplication in loop
   const mappedHistory = candles.map(c => ({ t: c.t, o: c.o, h: c.h, l: c.l, c: c.c }));

   // ── Sequence state for backtest ──
   // Fix H: totalEntradas starts at 1 because the trigger IS the first entry (#1) of the sequence.
   // Each new strategy signal starts a fresh sequence. totalEntradas is only incremented inside
   // the sequence loop (see line 103), so the trigger block (lines 622-650) registers #1 with totalEntradas=1.
   // Fix I: minConsecutiveCandles uses candles.slice(i - minCons, i) which counts back from current
   // candle i (excludes i). In live engines (robotEngine/serverEngine) the equivalent is
   // closedCandles.slice(-minCons). These are equivalent when i === candles.length - 1.
   let sequenceState: {
      active: boolean;
      action: "CALL" | "PUT";
      corEsperada: "verde" | "vermelha";
      stake: number;
      maxEntradas: number;
      totalEntradas: number;
      ultimoEntryCandleIdx: number; // ← índice do candle onde o último trade da sequência entrou
   } | null = null;

   for (let i = 22; i < candles.length; i++) {
      // ── Process active sequence ──
      if (sequenceState?.active && !activeTrade) {
         const entryIdx = sequenceState.ultimoEntryCandleIdx;
         if (i <= entryIdx) continue; // Não passámos da vela de entrada

         const entryCandle = candles[i - 1];
         const corActual = entryCandle.c > entryCandle.o ? "verde" : "vermelha";
         const pararPorCor = corActual !== sequenceState.corEsperada;
         const pararPorMax = sequenceState.totalEntradas >= sequenceState.maxEntradas;
         // Fix B: corEsperada is the color of the candle WHERE the trigger entered.
         // On the next candle (this iteration), if cor != corEsperada, we TERMINATE the sequence
         // (do not place another entry). It does NOT block the trigger candle itself — the trigger
         // was already placed in the previous iteration using candles[i-1].o.

         if (pararPorCor || pararPorMax) {
            sequenceState.active = false;
            // Fix G: when sequence ends on maxEntradas (not on wrong color), skip onTick this candle
            // to avoid a spurious non-sequence trade on the closing candle of the sequence
            if (pararPorMax && !pararPorCor) continue;
            // Cair no onTick abaixo (sequência terminou)
         } else {
            // ── PRÓXIMA ENTRADA DA SEQUÊNCIA ──
            sequenceState.totalEntradas++;
            sequenceState.ultimoEntryCandleIdx = i;

            // F3.1: skip puro se startLevel > 1 e totalEntradas < startLevel, ou onlyReal e totalEntradas !== startLevel
            const startLevel = sequenceConfig?.startLevel ?? 1;
            const onlyReal = sequenceConfig?.onlyReal ?? false;
            const isSkipped = sequenceState.totalEntradas < startLevel
               || (onlyReal && sequenceState.totalEntradas !== startLevel);

            if (isSkipped) {
               // F3.1: skip puro — não cria trade, não afecta currentBalance, não conta nas stats.
               // Apenas avança o contador e regista para o requisito de cor ser avaliado no próximo candle.
               console.log(`[Backtest] Sequence #${sequenceState.totalEntradas} SKIPPED for ${assetSym} (startLevel=${startLevel}, onlyReal=${onlyReal})`);
               continue;
            }

            const amount = sequenceState.stake ?? (marketType === "binary" ? riskConf.defaultStake : forexConf.lotSize);
            const entry = candles[i].o;
            const exit = candles[i].c;

            // F3.1: sequenceInvert inverte CALL↔PUT nas entradas da sequência (#2..N)
            const baseAction = sequenceState.action;
            const effectiveAction = (sequenceConfig?.sequenceInvert && sequenceState.totalEntradas >= 2)
               ? (baseAction === "CALL" ? "PUT" : "CALL")
               : baseAction;

            const tradeWin = effectiveAction === "CALL" ? exit > entry : exit < entry;
            const pnl = tradeWin ? amount * (riskConf.payout / 100) : -amount;

            const sh = {
               rsi: allRsi[i - 1],
               adx: allAdx.adx[i - 1],
               macd: allMacd.macd[i - 1],
               histogram: allMacd.histogram[i - 1],
               pattern: getPattern(candles, i - 1),
               ma9: allSma9[i - 1],
               ma21: allSma21[i - 1],
               ma200: allSma200[i - 1],
               ma235: allSma235[i - 1],
               sar: allSar.sar[i - 1],
               atr: allAtr[i - 1],
               williams: allWilliams[i - 1],
               fibLevel: getFibonacciLevel(candles, i - 1, candles[i - 1].c).closestLevel,
               pivotLevel: getPivotPoints(candles, i - 1, candles[i - 1].c).closestPivot,
               marketMoment: classifyMarketMomentum(candles, i - 1, candles[i - 1].c),
               marketStructure: detectMarketStructure(candles, i - 1)
            };

            const trade = {
               id: Math.random().toString(36).substring(7),
               asset: assetSym,
               type: effectiveAction,
               amount,
               entry,
               exit,
               result: tradeWin ? "WIN" : "LOSS",
               pnl,
               ts: candles[i].t,
               entryTime: candles[i].t,
               durationS: 60,
               mode: "backtest",
               entryCandleIdx: i,
               strategyId: strategyMod.id || "strategy",
               snapshot: sh,
               customStats: {
                  setupTipo: `Sequência #${sequenceState.totalEntradas} (${effectiveAction})`,
                  ...(marketType === "binary" ? computeWhatIfStats(i, entry, effectiveAction, intervalMs, candles) : {})
               }
            };

            trades.push(trade);
            currentBalance += pnl;
            continue; // Trade criado e fechado, saltar onTick
         }
      }

      if (activeTrade) {
         const t = activeTrade;
         let shouldClose = false;
         let win = false;
         let pnl = 0;
         let exitPrice = candles[i].c;

         if (marketType === "binary" && (t.type === "CALL" || t.type === "PUT")) {
            if (t.entryCandleIdx !== undefined && t.expiryCandles !== undefined) {
               if (i >= t.entryCandleIdx + t.expiryCandles) {
                  exitPrice = candles[t.entryCandleIdx + t.expiryCandles - 1].c;
                  win = t.type === "CALL" ? exitPrice > t.entry : exitPrice < t.entry;
                  pnl = win ? t.amount * (riskConf.payout / 100) : -t.amount;
                  shouldClose = true;
               }
            }
         } else {
            // Forex — CRITICAL: Check High/Low for SL/TP consistency
            if (t.entryCandleIdx !== undefined) {
               const pipValue = assetSym.includes("JPY") ? 0.01 : 0.0001;

               // Check if SL or TP was hit using the High/Low of the current candle
               if (marketType === "forex" || forexConf.enabled) {
                  const slPrice = t.type === "BUY" ? t.entry - (forexConf.stopLossPips * pipValue) : t.entry + (forexConf.stopLossPips * pipValue);
                  const tpPrice = t.type === "BUY" ? t.entry + (forexConf.takeProfitPips * pipValue) : t.entry - (forexConf.takeProfitPips * pipValue);

                  if (t.type === "BUY") {
                     if (candles[i].l <= slPrice) {
                        shouldClose = true;
                        exitPrice = slPrice;
                     } else if (candles[i].h >= tpPrice) {
                        shouldClose = true;
                        exitPrice = tpPrice;
                     }
                  } else {
                     if (candles[i].h >= slPrice) {
                        shouldClose = true;
                        exitPrice = slPrice;
                     } else if (candles[i].l <= tpPrice) {
                        shouldClose = true;
                        exitPrice = tpPrice;
                     }
                  }
               }

               if (!shouldClose) {
                  let isExpiry = false;
                  if (t.expiryCandles && i >= t.entryCandleIdx + t.expiryCandles) {
                     shouldClose = true;
                     isExpiry = true;
                     const cIndex = Math.floor(t.entryCandleIdx + t.expiryCandles - 0.0001);
                     const targetIndex = Math.min(candles.length - 1, Math.max(0, cIndex));
                     const fract = t.expiryCandles - Math.floor(t.expiryCandles - 0.0001);
                     exitPrice = candles[targetIndex].o * (1 - fract) + candles[targetIndex].c * fract;
                  }
                  if (!(marketType === "forex" || forexConf.enabled) && !t.expiryCandles && i >= t.entryCandleIdx + 20) {
                     shouldClose = true;
                     isExpiry = true;
                     exitPrice = candles[i].c;
                  }
                  // Max holding time for Forex backtest if no exit was triggered to avoid unbounded trades: 100 candles
                  if ((marketType === "forex" || forexConf.enabled) && !t.expiryCandles && i >= t.entryCandleIdx + 100) {
                     shouldClose = true;
                     isExpiry = true;
                     exitPrice = candles[i].c;
                  }
               }

               if (shouldClose) {
                  const pips = t.type === "BUY" ? (exitPrice - t.entry) / pipValue : (t.entry - exitPrice) / pipValue;
                  pnl = pips * (t.amount * 100000 * pipValue);
                  win = pnl > 0;
               }
            }
         }

         if (shouldClose) {
            activeTrade.result = win ? "WIN" : "LOSS";
            activeTrade.pnl = pnl;
            activeTrade.exit = exitPrice;

            // --- Multi-Expiration & Multi-Timeframe Analysis (What-If) ---
            if (marketType === "binary") {
               const whatIf = computeWhatIfStats(activeTrade.entryCandleIdx!, activeTrade.entry, activeTrade.type, intervalMs, candles);
               activeTrade.customStats = { ...activeTrade.customStats, ...whatIf };
            }

            trades.push({ ...activeTrade });
            currentBalance += pnl;
            // Nada necessário — trades da sequência são fechados no momento da criação
            activeTrade = null;
            if (operationsPerBar === 1) {
               continue; // CRITICAL: Stop here for this candle. Don't allow opening a new trade in the SAME candle that one just closed.
            }
         }
      }

      if (activeTrade) continue;

      const history = mappedHistory.slice(0, i);
      const slicedCandles = candles.slice(0, i);
      const lastKnownCandle = candles[i - 1];
      const context: StrategyContext = {
         asset: assetSym,
         history,
         candles: slicedCandles,
         lastPrice: lastKnownCandle.c,
         currentPrice: lastKnownCandle.c,
         balance: currentBalance,
         tradingMode: "backtest",
         isBacktest: true,
         intervalMs,
         candleTimeRemainingMs: 0,
         getMTF: (minutes: number) => {
            const cacheKey = `mtf_${minutes}`;
            if (!mtfCache[cacheKey]) {
               mtfCache[cacheKey] = resampleCandles(candles, minutes);
               // Store pointer as any to avoid type issues in this Record
               (mtfCache as any)[`${cacheKey}_ptr`] = 0;
            }

            const mtfCandles = mtfCache[cacheKey];
            const cutoffTime = candles[i].t - (minutes * 60000);
            let ptr = (mtfCache as any)[`${cacheKey}_ptr`];

            // Advance the pointer until we find a candle that hasn't closed yet
            while (ptr < mtfCandles.length && mtfCandles[ptr].t <= cutoffTime) {
               ptr++;
            }

            // Save pointer for the next iteration (since 'i' always moves forward)
            (mtfCache as any)[`${cacheKey}_ptr`] = ptr;

            // Return only the closed candles up to the current backtest time
            return mtfCandles.slice(0, ptr);
         },
         srLines: srLines.filter(l => l.asset === assetSym).map(l => ({ id: l.id, price: l.price, type: l.kind as "support" | "resistance", asset: l.asset })),
         srZones: srZones.filter(z => z.asset === assetSym).map(z => ({ id: z.id, p1: z.topPrice, p2: z.bottomPrice, type: z.kind === "buy_zone" ? "support" : "resistance", asset: z.asset })),
         trendLines: trendLines.filter(l => l.asset === assetSym).map(l => ({ id: l.id, t1: l.t1, p1: l.p1, t2: l.t2, p2: l.p2, type: l.kind as "support" | "resistance", asset: l.asset })),
         hasOpenTrade: activeTrade !== null,
         lastTrade: trades.length > 0 ? trades[trades.length - 1] : undefined,
         activeFilters: activeFilters,
         index: i - 1,
         candle: lastKnownCandle,
         warmUp: slicedCandles.length < 150,
         isWarmUp: slicedCandles.length < 150,
         isLast: i === candles.length - 1,
         updateSR: () => { },
         toast: {
            success: () => { },
            info: () => { },
            error: () => { }
         },
         indicators: {
            rsi: (period: number, dataSource?: number[]) => dataSource ? rsi(dataSource, period) : allRsi.slice(0, i),
            sma: (period: number, dataSource?: number[]) => {
               if (dataSource) return sma(dataSource, period).map(v => v || 0);
               if (period === 9) return allSma9.slice(0, i).map(v => v || 0);
               if (period === 21) return allSma21.slice(0, i).map(v => v || 0);
               return sma(cArray.slice(0, i), period).map(v => v || 0);
            },
            ema: (period: number, dataSource?: number[]) => {
               if (dataSource) return ema(dataSource, period).map(v => v || 0);
               if (period === 20) return allEma20.slice(0, i).map(v => v || 0);
               return ema(cArray.slice(0, i), period).map(v => v || 0);
            },
            bollinger: (period: number, mult: number, dataSource?: number[]) => {
               if (dataSource) {
                  const b = bollinger(dataSource, period, mult);
                  return { upper: b.upper.map(v => v || 0), lower: b.lower.map(v => v || 0) };
               }
               if (period === 20 && mult === 2) return { upper: allBoll.upper.slice(0, i).map(v => v || 0), lower: allBoll.lower.slice(0, i).map(v => v || 0) };
               const b = bollinger(cArray.slice(0, i), period, mult);
               return { upper: b.upper.map(v => v || 0), lower: b.lower.map(v => v || 0) };
            },
            adx: (period: number, dataSource?: Candle[]) => {
               if (dataSource) {
                  const a = adx(dataSource, period);
                  return { adx: a.adx.map(v => v || 0), plusDi: a.plusDi.map(v => v || 0), minusDi: a.minusDi.map(v => v || 0) };
               }
               if (period === 14) return { adx: allAdx.adx.slice(0, i).map(v => v || 0), plusDi: allAdx.plusDi.slice(0, i).map(v => v || 0), minusDi: allAdx.minusDi.slice(0, i).map(v => v || 0) };
               const a = adx(candles.slice(0, i), period);
               return { adx: a.adx.map(v => v || 0), plusDi: a.plusDi.map(v => v || 0), minusDi: a.minusDi.map(v => v || 0) };
            },
            macd: (fast: number, slow: number, signal: number, dataSource?: number[]) => {
               if (dataSource) {
                  const m = macd(dataSource, fast, slow, signal);
                  return { macd: m.macd.map(v => v || 0), signal: m.signal.map(v => v || 0), histogram: m.histogram.map(v => v || 0) };
               }
               if (fast === 12 && slow === 26 && signal === 9) return { macd: allMacd.macd.slice(0, i).map(v => v || 0), signal: allMacd.signal.slice(0, i).map(v => v || 0), histogram: allMacd.histogram.slice(0, i).map(v => v || 0) };
               const m = macd(cArray.slice(0, i), fast, slow, signal);
               return { macd: m.macd.map(v => v || 0), signal: m.signal.map(v => v || 0), histogram: m.histogram.map(v => v || 0) };
            },
            parabolicSar: (afStep = 0.02, afMax = 0.2, dataSource?: Candle[]) => {
               if (dataSource) {
                  const p = parabolicSar(dataSource.map(c => c.h), dataSource.map(c => c.l), afStep, afMax);
                  return { sar: p.sar.map(v => v || 0), trend: p.trend, af: p.af };
               }
               if (afStep === 0.02 && afMax === 0.2) return { sar: allSar.sar.slice(0, i).map(v => v || 0), trend: allSar.trend.slice(0, i), af: allSar.af.slice(0, i) };
               const hArray = candles.slice(0, i).map(c => c.h);
               const lArray = candles.slice(0, i).map(c => c.l);
               const p = parabolicSar(hArray, lArray, afStep, afMax);
               return { sar: p.sar.map(v => v || 0), trend: p.trend, af: p.af };
            },
         },
      };

      // --- Evaluation of Strategy Signal ---
      const rawRes = strategyMod.onTick(context);

      const ci = i - 1;
      const curCandle = candles[ci];
      const curClose = curCandle.c;
      const curOpen = curCandle.o;

      // Build indicator values from PRE-COMPUTED arrays (avoids O(N²) recomputation)
      const maTrend = curClose > allSma200[ci] && allSma200[ci] > allSma235[ci] ? "Strong Bullish"
        : curClose < allSma200[ci] && allSma200[ci] < allSma235[ci] ? "Strong Bearish"
        : curClose > allSma200[ci] ? "Bullish"
        : curClose < allSma200[ci] ? "Bearish"
        : "Ranging/Mixed";

      const sarDist = allSar.sar[ci] ? ((curClose - allSar.sar[ci]) / curClose * 100) : 0;
      const sarBucket = !allSar.sar[ci] ? "SAR: Baixista (Preço < SAR)"
        : sarDist > 1 ? "SAR: Fortemente Altista (Preço > SAR > 1%)"
        : sarDist > 0 ? "SAR: Altista (Preço > SAR)"
        : sarDist < -1 ? "SAR: Fortemente Baixista (Preço < SAR < -1%)"
        : "SAR: Baixista (Preço < SAR)";

      const pctAtr = curClose ? ((allAtr[ci] / curClose) * 100) : 0;
      const atrBucket = pctAtr < 0.03 ? "Low Vol (< 0.03%)" : (pctAtr < 0.1 ? "Medium Vol (0.03% - 0.1%)" : "High Vol (> 0.1%)");

      const williamsBucket = allWilliams[ci] <= -80 ? "Oversold (<= -80)" : (allWilliams[ci] > -80 && allWilliams[ci] < -20 ? "Neutral (-80 a -20)" : "Overbought (>= -20)");

      const candleSizeVal = Math.abs(curCandle.c - curCandle.o) / curCandle.o * 100;
      const candleSizeBucket = candleSizeVal < 0.02 ? "Pequeno (<0.02%)" : (candleSizeVal < 0.06 ? "Médio (0.02%-0.06%)" : "Grande (>0.06%)");

      const marketMomentVal = classifyMarketMomentum(candles, i, curClose);
      const indicatorValues: Record<string, any> = {
        _rsi: allRsi[ci],
        _adx: allAdx.adx[ci],
        _macd: allMacd.histogram[ci] > 0 ? "Bullish (Hist > 0)" : "Bearish (Hist < 0)",
        _pattern: getPattern(candles, ci),
        _maTrend: maTrend,
        _expiryCandles: rawRes?.expiryCandles ?? null,
        _asset: assetSym,
        _sar: sarBucket,
        _williams: williamsBucket,
        _atr: atrBucket,
        _fibLevel: getFibonacciLevel(candles, ci, curClose).closestLevel,
        _pivotLevel: getPivotPoints(candles, ci, curClose).closestPivot,
        _marketMoment: marketMomentVal,
        _marketStructure: detectMarketStructure(candles, ci),
        _candleSize: candleSizeBucket,
        _pavioClass: rawRes?.action ? classifyCandleWick(curCandle, rawRes.action as "CALL" | "PUT" | "BUY" | "SELL") : "N/A",
        _preEntryMomentum: (() => {
           if (i < 5) return "Misto / Sem Histórico";
           const last5 = candles.slice(i - 5, i);
           const greenCount = last5.filter(c => c.c > c.o).length;
           const redCount = last5.filter(c => c.c < c.o).length;
           const avgBodyPct = last5.reduce((sum, c) => sum + (Math.abs(c.c - c.o) / c.o) * 100, 0) / 5;
           if (greenCount >= 4) return avgBodyPct > 0.06 ? "Impulso Altista Forte" : "Impulso Altista Moderado";
           if (redCount >= 4) return avgBodyPct > 0.06 ? "Impulso Baixista Forte" : "Impulso Baixista Moderado";
           if (avgBodyPct < 0.02) return "Lateralização / Sem Força";
           return "Misto / Correção";
        })(),
        _bollingerState: marketMomentVal === "Alta Volatilidade" || marketMomentVal.toLowerCase().includes("explos") || marketMomentVal.toLowerCase().includes("rompi") || marketMomentVal.toLowerCase().includes("expans") ? "Estouro / Expansão Volatilidade"
          : marketMomentVal === "Baixa Volatilidade" || marketMomentVal.toLowerCase().includes("lateral") || marketMomentVal.toLowerCase().includes("consol") || marketMomentVal.toLowerCase().includes("sq") ? "Squeeze (Bandas Estreitas)"
          : "Neutro / Altas e Baixas Padrão",
        _indicatorCrossover: allSma9[ci] > allSma21[ci] ? "Alinhamento de Alta (9 > 21)" : "Alinhamento de Baixa (9 < 21)",
      };

      // Merge custom stats from rawResult
      if (rawRes?.customStats) {
        for (const [ck, cv] of Object.entries(rawRes.customStats)) {
          indicatorValues[ck] = cv;
        }
      }

      const res = applyFilterLogic(rawRes, activeFilters, indicatorValues, globalInvert, strategyDirection);

      // ── Sequence trigger: if a sequence is active, handle it BEFORE the onTick ──
      // Check if there's an active sequence state from a previous trade
      // We track sequence state outside the loop using a closure variable
      // (initialized once before the loop)

      if (res && res.pendingPrice) {
         let dir = res.action;
         if (!dir) {
            console.warn(`[Backtest] ⚠️ ${assetSym} @ candle ${i}: pendingPrice set but no action — skipping`);
         } else {
            if (marketType === "binary") {
               if (dir === "BUY" || dir === "SELL") dir = dir === "BUY" ? "CALL" : "PUT";
            } else {
               if (dir === "CALL" || dir === "PUT") dir = dir === "CALL" ? "BUY" : "SELL";
            }

            // Immediate fill check against current candle (duration = 1 candle)
            const candle = candles[i];
            const hit = (dir === "CALL" || dir === "BUY")
               ? (candle.l <= res.pendingPrice)
               : (candle.h >= res.pendingPrice);

            if (hit) {
               console.log(`[Backtest] 🎯 Pending order TRIGGERED for ${assetSym} @ candle ${i}: ${dir} at ${res.pendingPrice}`);
               const entry = res.pendingPrice;
               const sh = {
                  rsi: allRsi[i - 1],
                  adx: allAdx.adx[i - 1],
                  macd: allMacd.macd[i - 1],
                  histogram: allMacd.histogram[i - 1],
                  pattern: getPattern(candles, i - 1),
                  ma9: allSma9[i - 1],
                  ma21: allSma21[i - 1],
                  ma200: allSma200[i - 1],
                  ma235: allSma235[i - 1],
                  sar: allSar.sar[i - 1],
                  atr: allAtr[i - 1],
                  williams: allWilliams[i - 1],
                  fibLevel: getFibonacciLevel(candles, i - 1, entry).closestLevel,
                  pivotLevel: getPivotPoints(candles, i - 1, candles[i - 1].c).closestPivot,
                  marketMoment: classifyMarketMomentum(candles, i, entry),
                  marketStructure: detectMarketStructure(candles, i - 1)
               };

               activeTrade = {
                  id: Math.random().toString(36).substring(7),
                  asset: assetSym,
                  type: dir as "CALL" | "PUT" | "BUY" | "SELL",
                  amount: res.stake ?? (marketType === "binary" ? riskConf.defaultStake : forexConf.lotSize),
                  entry,
                  ts: candles[i].t,
                  entryTime: candles[i].t,
                  durationS: res.duration || 60,
                  mode: "backtest",
                  entryCandleIdx: i,
                  expiryCandles: res.expiryCandles || 1,
                  result: "OPEN",
                  strategyId: strategyMod.id || "strategy",
                  snapshot: sh,
                  customStats: res.customStats
               };
            } else {
               console.log(`[Backtest] ⏳ Pending order MISSED for ${assetSym} @ candle ${i}: ${dir} target ${res.pendingPrice} not hit (low:${candle.l} high:${candle.h})`);
            }
         }
      } else if (res && res.action) {
         // ── minConsecutiveCandles: check enough same-color candles before sequence ──
         const minCons = res.sequenceTrigger?.minConsecutiveCandles ?? 0;
         if (minCons > 0) {
            const enough = (i + 1) >= minCons &&
               candles.slice(i - minCons, i).every(c =>
                  (res.action === "CALL" || res.action === "BUY") ? c.c > c.o : c.c < c.o
               );
            if (!enough) {
               console.log(`[Backtest] ⏳ Sequence block: not enough consecutive candles for ${assetSym} @ candle ${i} (need ${minCons})`);
               continue;
            }
         }

         let dir = res.action;
         if (marketType === "binary") {
            if (dir === "BUY" || dir === "SELL") dir = dir === "BUY" ? "CALL" : "PUT";
         } else {
            if (dir === "CALL" || dir === "PUT") dir = dir === "CALL" ? "BUY" : "SELL";
         }

         const isForex = assetSym.includes("frx") || assetSym.length === 6;
         const pipValue = assetSym.includes("JPY") ? 0.01 : (isForex ? 0.0001 : 1.0);
         // Zero spread for binary, fixed spread for forex/synthetic
         const spreadPips = marketType === "binary" ? 0 : (isForex ? 2.0 : 0.5);
         const amount = res.stake ?? (marketType === "binary" ? riskConf.defaultStake : forexConf.lotSize);

         // Entry AT THE OPEN of candle i (immediately after signal candle i-1)
         let entry = candles[i].o;
         if (spreadPips > 0) {
            if (dir === "BUY" || dir === "CALL") {
               entry += (spreadPips * pipValue);
            } else {
               entry -= (spreadPips * pipValue);
            }
         }

         // ── Initialize sequence trigger if present ──
         // Fix E: bake globalInvert into seq.action so all #2..N entries honour inversion.
         if ((res.sequenceTrigger || sequenceConfig?.enabled) && (marketType !== "binary" || dir === "CALL" || dir === "PUT")) {
            const corEsperada = (dir === "CALL" || dir === "BUY") ? "verde" : "vermelha";
            const seqAction = globalInvert
               ? (dir === "CALL" || dir === "BUY" ? "PUT" : "CALL")
               : (dir as "CALL" | "PUT");
            sequenceState = {
               active: true,
               action: seqAction,
               corEsperada,
               stake: amount,
               maxEntradas: res.sequenceTrigger?.maxEntradas ?? (sequenceConfig?.enabled ? Math.min(Math.max(1, sequenceConfig.maxEntradas), 5) : 50),
               totalEntradas: 1,
               ultimoEntryCandleIdx: i, // ← candle onde a primeira entrada (trigger) entrou
            };
            console.log(`[Backtest] Sequence started for ${assetSym}: ${dir}${globalInvert ? " (inverted→" + seqAction + ")" : ""} | max=${res.sequenceTrigger?.maxEntradas ?? (sequenceConfig?.enabled ? Math.min(Math.max(1, sequenceConfig.maxEntradas), 5) : 50)}`);
         }

         const sh = {
            rsi: allRsi[i - 1],
            adx: allAdx.adx[i - 1],
            macd: allMacd.macd[i - 1],
            histogram: allMacd.histogram[i - 1],
            pattern: getPattern(candles, i - 1),
            ma9: allSma9[i - 1],
            ma21: allSma21[i - 1],
            ma200: allSma200[i - 1],
            ma235: allSma235[i - 1],
            sar: allSar.sar[i - 1],
            atr: allAtr[i - 1],
            williams: allWilliams[i - 1],
            fibLevel: getFibonacciLevel(candles, i - 1, candles[i - 1].c).closestLevel,
            pivotLevel: getPivotPoints(candles, i - 1, candles[i - 1].c).closestPivot,
            marketMoment: classifyMarketMomentum(candles, i - 1, candles[i - 1].c),
            marketStructure: detectMarketStructure(candles, i - 1),
            candleSize: (() => {
               const bodyPct = (Math.abs(curCandle.c - curCandle.o) / curCandle.o) * 100;
               if (bodyPct < 0.02) return "Pequeno (<0.02%)";
               if (bodyPct < 0.06) return "Médio (0.02%-0.06%)";
               return "Grande (>0.06%)";
            })(),
            preEntryMomentum: (() => {
               if (i < 5) return "Misto / Sem Histórico";
               const last5 = candles.slice(i - 5, i);
               const greenCount = last5.filter(c => c.c > c.o).length;
               const redCount = last5.filter(c => c.c < c.o).length;
               const avgBodyPct = last5.reduce((sum, c) => sum + (Math.abs(c.c - c.o) / c.o) * 100, 0) / 5;
               if (greenCount >= 4) return avgBodyPct > 0.06 ? "Impulso Altista Forte" : "Impulso Altista Moderado";
               if (redCount >= 4) return avgBodyPct > 0.06 ? "Impulso Baixista Forte" : "Impulso Baixista Moderado";
               if (avgBodyPct < 0.02) return "Lateralização / Sem Força";
               return "Misto / Correção";
            })(),
            bollingerState: (() => {
               const idx = i - 1;
               const u = allBoll.upper[idx];
               const l = allBoll.lower[idx];
               const m = allBoll.ma[idx];
               if (u == null || l == null || m == null) return "N/A";
               const bandwidth = (u - l) / m;
               let sumBw = 0;
               let count = 0;
               for (let j = Math.max(0, idx - 19); j <= idx; j++) {
                  const uj = allBoll.upper[j];
                  const lj = allBoll.lower[j];
                  const mj = allBoll.ma[j];
                  if (uj != null && lj != null && mj != null) {
                     sumBw += (uj - lj)/mj;
                     count++;
                  }
               }
               const avgBandwidth = count > 0 ? sumBw / count : bandwidth;
               if (bandwidth < avgBandwidth * 0.85) return "Squeeze (Bandas Estreitas)";
               if (bandwidth > avgBandwidth * 1.15) return "Estouro / Expansão Volatilidade";
               return "Neutro / Altas e Baixas Padrão";
            })(),
            indicatorCrossover: allSma9[i - 1] > allSma21[i - 1]
               ? "Alinhamento de Alta (9 > 21)" : "Alinhamento de Baixa (9 < 21)",
            entryCandle: curCandle,
         };

         // ── Sequence trade: push+continue (liquidação imediata pela cor da vela) ──
         if (sequenceState?.active) {
            // F3.1: skip puro se startLevel > 1 (e.g. "só #2 é real" — #1 não executa)
            const startLevel = sequenceConfig?.startLevel ?? 1;
            const onlyReal = sequenceConfig?.onlyReal ?? false;
            const isSkipped = sequenceState.totalEntradas < startLevel
               || (onlyReal && sequenceState.totalEntradas !== startLevel);

            if (isSkipped) {
               console.log(`[Backtest] Sequence #1 SKIPPED for ${assetSym} (startLevel=${startLevel}, onlyReal=${onlyReal})`);
               continue;
            }

            const tradeWin = (dir === "CALL" || dir === "BUY")
               ? candles[i].c > entry
               : candles[i].c < entry;
            const seqPnl = tradeWin ? amount * (riskConf.payout / 100) : -amount;

            trades.push({
               id: Math.random().toString(36).substring(7),
               asset: assetSym,
               type: dir as "CALL" | "PUT" | "BUY" | "SELL",
               amount,
               entry,
               exit: candles[i].c,
               result: tradeWin ? "WIN" : "LOSS",
               pnl: seqPnl,
               ts: candles[i].t,
               entryTime: candles[i].t,
               durationS: res.duration || 60,
               mode: "backtest",
               entryCandleIdx: i,
               strategyId: strategyMod.id || "strategy",
               snapshot: sh,
               customStats: {
                  ...(res.customStats || {}),
                  setupTipo: `Sequência #1 (${sequenceState.action})`,
                  ...(marketType === "binary" ? computeWhatIfStats(i, entry, dir as any, intervalMs, candles) : {})
               },
            });
            currentBalance += seqPnl;
            continue;
         }

         // Apenas para trades NÃO-sequência — sequência usa push+continue acima
         activeTrade = {
            id: Math.random().toString(36).substring(7),
            asset: assetSym,
            type: dir as "CALL" | "PUT" | "BUY" | "SELL",
            amount,
            entry,
            ts: candles[i].t,
            entryTime: candles[i].t,
            durationS: res.duration || 60,
            mode: "backtest",
            entryCandleIdx: i,
            expiryCandles: res.expiryCandles || (res.duration ? Math.ceil((res.duration * 1000) / intervalMs) : 1),
            result: "OPEN",
            strategyId: strategyMod.id || "strategy",
            snapshot: sh,
            customStats: res.customStats
         };
      }
   }

   return trades;
}
