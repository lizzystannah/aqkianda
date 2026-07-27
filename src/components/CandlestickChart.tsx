import { useEffect, useRef, useState, useCallback } from "react";
import type { Candle } from "@/lib/market";
import { useStore } from "@/lib/store";
import {
  Maximize2,
  Settings2,
  LineChart,
  BarChart2,
  MousePointer2,
  Type,
  Ruler,
  Eye,
  EyeOff,
  Trash2,
  ChevronDown,
  Search,
  Minus,
  TrendingUp,
  LayoutGrid,
  Zap,
  Globe,
  Coins,
  ArrowUpRight,
  ArrowDownRight,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ASSETS } from "@/lib/market";
import { Input } from "@/components/ui/input";

type Props = {
  asset: string;
  candles: Candle[];
  drawingMode: "support" | "resistance" | "buy_zone" | "sell_zone" | "trend_support" | "trend_resistance" | null;
  setDrawingMode: (mode: "support" | "resistance" | "buy_zone" | "sell_zone" | "trend_support" | "trend_resistance" | null) => void;
  indicator: string;
  setIndicator: (ind: string) => void;
  overlays?: {
    ma?: (number | null)[];
    ma11?: (number | null)[];
    ma15?: (number | null)[];
    ma200?: (number | null)[];
    ma235?: (number | null)[];
    upper?: (number | null)[];
    lower?: (number | null)[]
  };
  oscillator?: (number | null)[] | null;
  tradingMode: "demo" | "real" | "backtest";
  trades?: import("@/lib/store").Trade[];
  onAssetChange?: (asset: string) => void;
  customTimeframes?: string[];
  onTimeframeChange?: (t: string) => void;
  timeframeLabel?: string;
  selectedTimeframe?: string;
  isRobotPerformance?: boolean;
  activeStrategyId?: string | null;
  setActiveStrategyId?: (id: string | null) => void;
  activeRobotId?: string | null;
  setActiveRobotId?: (id: string | null) => void;
  onSelectRobot?: (robotId: string, strategyId: string) => void;
  robotsList?: { id: string; name: string; strategyId?: string }[];
  /** Annotations from the Script Sandbox */
  scriptAnnotations?: import("@/lib/scriptAnnotations").ScriptAnnotation[];
  /** Layer visibility filters for script annotations */
  scriptLayerState?: import("@/lib/scriptAnnotations").ScriptLayerState;
  /** Step threshold for replay mode: only annotations with index <= stepThreshold are rendered */
  scriptStepThreshold?: number;
  /** Opacity for script annotations (0.0 to 1.0) */
  scriptAnnotationOpacity?: number;
};

export function CandlestickChart({
  asset,
  candles,
  drawingMode,
  setDrawingMode,
  indicator,
  setIndicator,
  overlays,
  oscillator,
  trades,
  tradingMode,
  onAssetChange,
  customTimeframes,
  onTimeframeChange,
  timeframeLabel,
  selectedTimeframe,
  isRobotPerformance,
  activeStrategyId,
  setActiveStrategyId,
  activeRobotId,
  setActiveRobotId,
  onSelectRobot,
  robotsList,
  scriptAnnotations,
  scriptLayerState,
  scriptStepThreshold,
  scriptAnnotationOpacity = 0.65,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { srLines, srZones, trendLines, addSR, removeSR, addSRZone, removeSRZone, addTrendLine, removeTrendLine, updateTrendLine, showSRLines, setShowSRLines, timeframe, setTimeframe, marketType } = useStore();

  const [hover, setHover] = useState<{ x: number; y: number; price: number; idx: number } | null>(null);
  const [size, setSize] = useState({ w: 800, h: 480 });

  const [viewCount, setViewCount] = useState(100);
  const [offset, setOffset] = useState(-20);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, offset: 0 });
  const [dragSR, setDragSR] = useState<{ id: string; price: number } | null>(null);
  const [hoverSRId, setHoverSRId] = useState<string | null>(null);
  const [hoverZoneId, setHoverZoneId] = useState<string | null>(null);
  const [pendingZone, setPendingZone] = useState<{ startY: number; startPrice: number } | null>(null);
  const [hoverTrendId, setHoverTrendId] = useState<string | null>(null);
  const [pendingTrendLine, setPendingTrendLine] = useState<{ t1: number; p1: number } | null>(null);
  const [isAssetSelectorOpen, setIsAssetSelectorOpen] = useState(false);
  const [assetSearch, setAssetSearch] = useState("");

  useEffect(() => {
    const obs = new ResizeObserver((e) => {
      const r = e[0].contentRect;
      setSize({ w: Math.max(320, r.width), h: Math.max(280, r.height) });
    });
    if (wrapRef.current) obs.observe(wrapRef.current);
    return () => obs.disconnect();
  }, []);

  const padL = 0, padR = 60, padT = 20, padB = oscillator ? 80 : 30;
  const innerW = size.w - padL - padR;
  const innerH = size.h - padT - padB;
  const cw = innerW / viewCount;
  const endIdx = candles.length - offset;
  const startIdx = endIdx - viewCount;
  const view = candles.filter((_, i) => i >= startIdx && i < endIdx);

  const min = Math.min(...(view.length ? view.map((c) => c.l) : [0]));
  const max = Math.max(...(view.length ? view.map((c) => c.h) : [100]));
  const range = max - min || 1;
  const padRange = range * 0.15;
  const lo = min - padRange, hi = max + padRange;

  const yOf = (p: number) => padT + (1 - (p - lo) / (hi - lo)) * innerH;
  const priceOf = (y: number) => lo + (1 - (y - padT) / innerH) * (hi - lo);
  const xOf = (idx: number) => padL + (idx - startIdx) * cw + cw / 2;

  const fmtPriceLabel = useCallback((p: number) => {
    if (isRobotPerformance) {
      return `${p.toFixed(1)}%`;
    }
    return p.toFixed(p < 10 ? 5 : 2);
  }, [isRobotPerformance]);

  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = size.w * dpr; cv.height = size.h * dpr;
    cv.style.width = size.w + "px"; cv.style.height = size.h + "px";
    const ctx = cv.getContext("2d")!; ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size.w, size.h);

    // grid
    ctx.strokeStyle = "hsl(220 14% 14%)"; ctx.lineWidth = 1;
    ctx.font = "10px JetBrains Mono, monospace";
    ctx.fillStyle = "hsl(150 8% 45%)";
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const y = padT + (innerH / steps) * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(innerW, y); ctx.stroke();
      const p = lo + (1 - i / steps) * (hi - lo);
      ctx.fillText(typeof p === 'number' ? fmtPriceLabel(p) : '', innerW + 8, y + 3);
    }

    // time grid (simple)
    for (let i = 0; i < viewCount; i += 20) {
      const x = padL + i * cw;
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + innerH); ctx.stroke();
    }

    // overlays
    const drawMA = (data: (number | null)[] | undefined, color: string, width = 1) => {
      if (!data) return;
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      let first = true;
      for (let j = Math.floor(startIdx); j <= Math.ceil(endIdx) + 1; j++) {
        if (j < 0 || j >= data.length) continue;
        const val = data[j];
        if (val == null) continue;
        const x = xOf(j);
        const y = yOf(val);
        if (first) { ctx.moveTo(x, y); first = false; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    drawMA(overlays?.ma, "#fbbf24", 1.5);
    drawMA(overlays?.ma11, "#7dd3fc", 1.5);
    drawMA(overlays?.ma15, "#34d399", 1.5);
    drawMA(overlays?.ma200, "#f43f5e", 2);
    drawMA(overlays?.ma235, "#a855f7", 2);
    
    if (indicator === "sar" && (overlays as any)?.sar) {
      for (let j = Math.floor(startIdx); j <= Math.ceil(endIdx) + 1; j++) {
        if (j < 0 || j >= (overlays as any).sar.length) continue;
        const val = (overlays as any).sar[j];
        const trend = (overlays as any).trend ? (overlays as any).trend[j] : 0;
        if (val == null) continue;
        ctx.fillStyle = trend === 1 ? "#22c55e" : "#ef4444";
        const x = xOf(j);
        const y = yOf(val);
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (overlays?.upper && overlays?.lower) {
      ctx.fillStyle = "rgba(59, 130, 246, 0.05)";
      ctx.strokeStyle = "rgba(59, 130, 246, 0.5)";
      ctx.lineWidth = 1;

      // upper
      ctx.beginPath();
      let first = true;
      for (let j = Math.floor(startIdx); j <= Math.ceil(endIdx) + 1; j++) {
        const val = overlays.upper[j];
        if (val == null) continue;
        const x = xOf(j); const y = yOf(val);
        if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // lower
      ctx.beginPath();
      let firstLo = true;
      for (let j = Math.floor(startIdx); j <= Math.ceil(endIdx) + 1; j++) {
        const val = overlays.lower[j];
        if (val == null) continue;
        const x = xOf(j); const y = yOf(val);
        if (firstLo) { ctx.moveTo(x, y); firstLo = false; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    if (oscillator) {
      const oscH = 50;
      const oscY = size.h - oscH - 10;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)"; ctx.lineWidth = 1;

      // RSI threshold lines
      ctx.beginPath(); ctx.moveTo(0, oscY + oscH * 0.3); ctx.lineTo(innerW, oscY + oscH * 0.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, oscY + oscH * 0.7); ctx.lineTo(innerW, oscY + oscH * 0.7); ctx.stroke();

      // RSI labels
      ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.font = "9px Arial";
      ctx.fillText("70", innerW + 4, oscY + oscH * 0.3 + 3);
      ctx.fillText("30", innerW + 4, oscY + oscH * 0.7 + 3);

      ctx.beginPath();
      ctx.strokeStyle = "#8b5cf6"; // purple-500
      ctx.lineWidth = 1.5;
      let firstOsc = true;
      for (let j = Math.floor(startIdx); j <= Math.ceil(endIdx) + 1; j++) {
        if (j < 0 || j >= oscillator.length) continue;
        const val = oscillator[j];
        if (val == null) continue;
        const x = xOf(j);
        const y = oscY + oscH * (1 - (val / 100)); // assuming 0-100 like RSI
        if (firstOsc) { ctx.moveTo(x, y); firstOsc = false; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // candles
    candles.forEach((c, j) => {
      if (j < startIdx - 1 || j > endIdx + 1) return;
      const x = xOf(j);
      const isUp = c.c >= c.o;
      ctx.strokeStyle = isUp ? "#22c55e" : "#ef4444";
      ctx.fillStyle = isUp ? "#22c55e" : "#ef4444";
      ctx.beginPath(); ctx.moveTo(x, yOf(c.h)); ctx.lineTo(x, yOf(c.l)); ctx.stroke();
      const yo = yOf(c.o), yc = yOf(c.c);
      const h = Math.max(1, Math.abs(yc - yo));
      ctx.fillRect(x - cw * 0.3, Math.min(yo, yc), cw * 0.6, h);
    });

    const currentPrice = candles.length > 0 ? candles[candles.length - 1].c : null;

    // SR lines
    srLines.filter((l) => l.asset === asset).forEach((l) => {
      const isSelected = dragSR?.id === l.id || hoverSRId === l.id;
      if (!showSRLines && !isSelected) return;
      if (l.price < lo || l.price > hi) return;
      const price = dragSR?.id === l.id ? dragSR.price : l.price;
      const y = yOf(price);

      const isPriceAbove = currentPrice !== null ? currentPrice > price : l.kind === "support";
      const lineColor = isPriceAbove ? "#22c55e" : "#ef4444";

      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(innerW, y); ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = isSelected ? "#fff" : lineColor;
      ctx.fillRect(innerW, y - 9, padR, 18);
      ctx.fillStyle = isSelected ? "#000" : "#fff";
      ctx.fillText(typeof price === 'number' ? fmtPriceLabel(price) : '', innerW + 4, y + 4);

      if (hoverSRId === l.id && !dragSR) {
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(innerW - 15, y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "white";
        ctx.font = "bold 9px Arial";
        ctx.fillText("X", innerW - 18, y + 3);
      }
    });

    // SR zones
    srZones.filter((z) => z.asset === asset).forEach((z) => {
      const isSelected = hoverZoneId === z.id;
      if (!showSRLines && !isSelected) return;

      const yTop = yOf(z.topPrice);
      const yBottom = yOf(z.bottomPrice);
      const h = yBottom - yTop;

      ctx.fillStyle = z.kind === "buy_zone" ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)";
      if (isSelected) ctx.fillStyle = z.kind === "buy_zone" ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)";

      ctx.fillRect(0, yTop, innerW, h);
      ctx.strokeStyle = z.kind === "buy_zone" ? "rgba(34, 197, 94, 0.5)" : "rgba(239, 68, 68, 0.5)";
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(0, yTop, innerW, h);

      if (isSelected) {
        const yMid = yTop + h / 2;
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(innerW - 15, yMid, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "white";
        ctx.font = "bold 9px Arial";
        ctx.fillText("X", innerW - 18, yMid + 3);
      }
    });

    // Helper functions for dynamic trendlines
    const getXOfTimestamp = (t: number) => {
      if (candles.length === 0) return 0;
      let closestIdx = 0;
      let minDiff = Infinity;
      for (let idx = 0; idx < candles.length; idx++) {
        const diff = Math.abs(candles[idx].t - t);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = idx;
        }
      }
      return xOf(closestIdx);
    };

    const getDistanceToSegment = (px: number, py: number, rx1: number, ry1: number, rx2: number, ry2: number): number => {
      const dx = rx2 - rx1;
      const dy = ry2 - ry1;
      const l2 = dx * dx + dy * dy;
      if (l2 === 0) return Math.sqrt((px - rx1) * (px - rx1) + (py - ry1) * (py - ry1));
      let t_factor = ((px - rx1) * dx + (py - ry1) * dy) / l2;
      t_factor = Math.max(0, Math.min(1, t_factor));
      const projX = rx1 + t_factor * dx;
      const projY = ry1 + t_factor * dy;
      return Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
    };

    // Render Diagonal Trendlines
    const currentTrendLines = (trendLines || []).filter(l => l.asset === asset);
    currentTrendLines.forEach(l => {
      const isSelected = hoverTrendId === l.id;
      if (!showSRLines && !isSelected) return;

      const x1 = getXOfTimestamp(l.t1);
      const y1 = yOf(l.p1);
      const x2 = getXOfTimestamp(l.t2);
      const y2 = yOf(l.p2);

      ctx.strokeStyle = l.kind === "support" ? "#22c55e" : "#ef4444";
      ctx.lineWidth = isSelected ? 3 : 2;
      
      // Draw main segment
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Extrapolate Trendline into future (ray extension)
      if (x2 > x1) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const slope = dy / dx;
        const extX = innerW;
        const extY = y2 + slope * (extX - x2);

        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.moveTo(x2, y2);
        ctx.lineTo(extX, extY);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw endpoints
      ctx.fillStyle = l.kind === "support" ? "#22c55e" : "#ef4444";
      ctx.beginPath();
      ctx.arc(x1, y1, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x2, y2, 4, 0, Math.PI * 2);
      ctx.fill();

      // Deletion icon in midpoint
      if (isSelected) {
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(mx, my, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "white";
        ctx.font = "bold 9px Arial";
        ctx.fillText("X", mx - 3, my + 3);
      }
    });

    // ----- Script Annotations -----
    if (scriptAnnotations && scriptAnnotations.length > 0) {
      const prevAlpha = ctx.globalAlpha;
      ctx.globalAlpha = Math.max(0.05, Math.min(1.0, scriptAnnotationOpacity));

      const getIdxX = (idx: number) => {
        if (idx < startIdx - 1 || idx > endIdx + 1) return null;
        return xOf(idx);
      };

      scriptAnnotations.forEach((a) => {
        // Layer visibility filter
        if (a.type !== "highlight" && a.meta?.layer && scriptLayerState) {
          if (a.meta.layer === "support" && !scriptLayerState.support) return;
          if (a.meta.layer === "resistance" && !scriptLayerState.resistance) return;
          if (a.meta.layer === "entry" && !scriptLayerState.entry) return;
          if (a.meta.layer === "analysis" && !scriptLayerState.analysis) return;
        }

        // Step threshold filter
        if (scriptStepThreshold !== undefined) {
          const idx = "candleIndex" in a ? a.candleIndex
            : "startIdx" in a ? a.startIdx
            : "idx1" in a ? a.idx1
            : -1;
          if (idx > scriptStepThreshold) return;
        }

        switch (a.type) {
          case "highlight": {
            const hx = getIdxX(a.candleIndex);
            if (hx === null) break;
            if (!scriptLayerState?.highlight) break;
            const hc = candles[a.candleIndex];
            if (!hc) break;
            const hw = Math.max(cw * 0.8, 2);
            ctx.fillStyle = a.color;
            const rectX = hx - hw / 2;
            const rectY = 0;
            ctx.fillRect(rectX, rectY, hw, innerH);
            break;
          }
          case "line": {
            if (a.price < lo || a.price > hi) return;
            const y = yOf(a.price);
            // Line starts at the originating candle and extends to the right
            const lx = getIdxX(a.candleIndex);
            if (lx === null) break;
            let rx = innerW;
            if (a.range !== undefined) {
              rx = Math.min(xOf(a.candleIndex + a.range), innerW);
              if (rx < lx) rx = lx;
            }
            ctx.strokeStyle = a.color || "rgba(255, 255, 255, 0.6)";
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 4]);
            ctx.beginPath(); ctx.moveTo(lx, y); ctx.lineTo(rx, y); ctx.stroke();
            ctx.setLineDash([]);
            if (a.label) {
              ctx.fillStyle = a.color || "rgba(255, 255, 255, 0.8)";
              ctx.font = "bold 9px JetBrains Mono, monospace";
              ctx.fillText(a.label, lx + 4, y - 4);
            }
            break;
          }
          case "arrow": {
            const ax = getIdxX(a.candleIndex);
            if (ax === null) break;
            const ac = candles[a.candleIndex];
            if (!ac) break;
            const isUp = a.direction === "up";
            const ay = isUp ? yOf(ac.l) + 20 : yOf(ac.h) - 20;
            ctx.fillStyle = a.color || (isUp ? "#22c55e" : "#ef4444");
            ctx.beginPath();
            if (isUp) {
              ctx.moveTo(ax, ay - 8);
              ctx.lineTo(ax - 6, ay + 4);
              ctx.lineTo(ax + 6, ay + 4);
            } else {
              ctx.moveTo(ax, ay + 8);
              ctx.lineTo(ax - 6, ay - 4);
              ctx.lineTo(ax + 6, ay - 4);
            }
            ctx.fill();
            if (a.label) {
              ctx.fillStyle = a.color || (isUp ? "#22c55e" : "#ef4444");
              ctx.font = "bold 9px JetBrains Mono, monospace";
              ctx.textAlign = "center";
              ctx.fillText(a.label, ax, isUp ? ay + 14 : ay - 8);
              ctx.textAlign = "left";
            }
            break;
          }
          case "text": {
            const tx = getIdxX(a.candleIndex);
            if (tx === null) break;
            const tc = candles[a.candleIndex];
            if (!tc) break;
            const ty = a.position === "below" ? yOf(tc.l) + 16 : yOf(tc.h) - 16;
            ctx.fillStyle = a.color || "rgba(255, 255, 255, 0.8)";
            ctx.font = "bold 10px JetBrains Mono, monospace";
            ctx.textAlign = "center";
            ctx.fillText(a.text, tx, ty);
            ctx.textAlign = "left";
            break;
          }
          case "zone": {
            if (a.priceHigh < lo || a.priceLow > hi) return;
            const zyTop = yOf(a.priceHigh);
            const zyBot = yOf(a.priceLow);
            const zh = zyBot - zyTop;
            if (zh <= 0) break;
            ctx.fillStyle = a.color?.replace(")", ", 0.15)").replace("rgb", "rgba") || "rgba(59, 130, 246, 0.15)";
            ctx.fillRect(0, zyTop, innerW, zh);
            ctx.strokeStyle = a.color || "rgba(59, 130, 246, 0.5)";
            ctx.lineWidth = 1;
            ctx.strokeRect(0, zyTop, innerW, zh);
            if (a.label) {
              ctx.fillStyle = a.color || "rgba(255, 255, 255, 0.6)";
              ctx.font = "9px JetBrains Mono, monospace";
              ctx.fillText(a.label, 4, zyTop + 12);
            }
            break;
          }
          case "trendline": {
            const x1 = getIdxX(a.idx1);
            const x2 = getIdxX(a.idx2);
            if (x1 === null || x2 === null) break;
            const y1 = yOf(a.price1);
            const y2 = yOf(a.price2);
            ctx.strokeStyle = a.color || "rgba(139, 92, 246, 0.7)";
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = a.color || "#8b5cf6";
            ctx.beginPath(); ctx.arc(x1, y1, 3, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(x2, y2, 3, 0, Math.PI * 2); ctx.fill();
            break;
          }
          case "marker": {
            const mx = getIdxX(a.candleIndex);
            if (mx === null) break;
            const mc = candles[a.candleIndex];
            if (!mc) break;
            const my = yOf(mc.c);
            ctx.fillStyle = a.color || "#eab308";
            if (a.shape === "circle") {
              ctx.beginPath();
              ctx.arc(mx, my, 5, 0, Math.PI * 2);
              ctx.fill();
            } else if (a.shape === "square") {
              ctx.fillRect(mx - 4, my - 4, 8, 8);
            } else if (a.shape === "diamond") {
              ctx.beginPath();
              ctx.moveTo(mx, my - 6);
              ctx.lineTo(mx + 5, my);
              ctx.lineTo(mx, my + 6);
              ctx.lineTo(mx - 5, my);
              ctx.closePath();
              ctx.fill();
            }
            break;
          }
        }
      });
      ctx.globalAlpha = prevAlpha;
    }

    // Floating dynamic preview during creation
    if ((drawingMode === "trend_support" || drawingMode === "trend_resistance") && pendingTrendLine && hover) {
      const x1 = getXOfTimestamp(pendingTrendLine.t1);
      const y1 = yOf(pendingTrendLine.p1);
      const x2 = hover.x;
      const y2 = hover.y;

      ctx.strokeStyle = drawingMode === "trend_support" ? "rgba(34, 197, 94, 0.7)" : "rgba(239, 68, 68, 0.7)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = drawingMode === "trend_support" ? "#22c55e" : "#ef4444";
      ctx.beginPath();
      ctx.arc(x1, y1, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x2, y2, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    if (pendingZone && hover) {
      const yTop = Math.min(pendingZone.startY, hover.y);
      const yBottom = Math.max(pendingZone.startY, hover.y);
      ctx.fillStyle = drawingMode === "buy_zone" ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)";
      ctx.fillRect(0, yTop, innerW, yBottom - yTop);
      ctx.strokeStyle = drawingMode === "buy_zone" ? "#22c55e" : "#ef4444";
      ctx.strokeRect(0, yTop, innerW, yBottom - yTop);
    }

    // current price line
    const lastReal = candles[candles.length - 1];
    if (lastReal) {
      const y = yOf(lastReal.c);
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(innerW, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = lastReal.c >= lastReal.o ? "#22c55e" : "#ef4444";
      ctx.fillRect(innerW, y - 9, padR, 18);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 10px JetBrains Mono";
      ctx.fillText(typeof lastReal.c === 'number' ? fmtPriceLabel(lastReal.c) : '', innerW + 4, y + 4);
    }

    // trades
    if (trades) {
      ctx.font = "bold 9px JetBrains Mono";
      trades.forEach(t => {
        const timeToMatch = t.entryTime || t.ts;

        // Match the closest candle
        let candleIdx = -1;
        let minDiff = Infinity;
        for (let i = 0; i < candles.length; i++) {
          const diff = Math.abs(candles[i].t - timeToMatch);
          if (diff < minDiff) {
            minDiff = diff;
            candleIdx = i;
          }
        }

        // Only draw if within a reasonable timeframe distance (e.g. within 2x interval)
        const intervalMs = candles.length > 1 ? candles[1].t - candles[0].t : 60000;
        if (minDiff > intervalMs * 2) {
          candleIdx = -1;
        }

        if (candleIdx !== -1 && candleIdx >= startIdx - 1 && candleIdx <= endIdx + 1) {
          const x = xOf(candleIdx);
          const isCall = t.type === "CALL" || t.type === "BUY";

          // Entry Arrow Background/Badge
          ctx.beginPath();
          if (isCall) {
            const yPos = yOf(candles[candleIdx].l) + 20;
            ctx.fillStyle = "#22c55e"; // Green Call
            // Arrow
            ctx.moveTo(x, yPos - 8);
            ctx.lineTo(x - 6, yPos + 4);
            ctx.lineTo(x + 6, yPos + 4);
            ctx.fill();
            // Label
            ctx.font = "bold 9px JetBrains Mono";
            ctx.textAlign = "center";
            ctx.fillText("BUY", x, yPos + 14);
          } else {
            const yPos = yOf(candles[candleIdx].h) - 20;
            ctx.fillStyle = "#ef4444"; // Red Put
            // Arrow
            ctx.moveTo(x, yPos + 8);
            ctx.lineTo(x - 6, yPos - 4);
            ctx.lineTo(x + 6, yPos - 4);
            ctx.fill();
            // Label
            ctx.font = "bold 9px JetBrains Mono";
            ctx.textAlign = "center";
            ctx.fillText("SELL", x, yPos - 8);
          }
          ctx.textAlign = "left"; // Reset
        }

        // Always draw the entry line to see the level
        const ey = yOf(t.entry);
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = t.type === "CALL" || t.type === "BUY" ? "#22c55e" : "#ef4444";
        ctx.lineWidth = 1;
        // If trade is closed, lower opacity of the line
        if (t.result !== "OPEN") {
          ctx.globalAlpha = 0.4;
        }
        ctx.moveTo(0, ey);
        ctx.lineTo(innerW, ey);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1.0; // Reset

        // Draw Left badge
        ctx.fillStyle = t.type === "CALL" || t.type === "BUY" ? (t.result !== "OPEN" ? "rgba(34, 197, 94, 0.1)" : "rgba(34, 197, 94, 0.2)") : (t.result !== "OPEN" ? "rgba(239, 68, 68, 0.1)" : "rgba(239, 68, 68, 0.2)");
        let lblW = 70;
        let lblTxt = `${t.type} $${t.amount}`;
        if (t.result === "WIN") { lblTxt += " (WIN)"; lblW = 100; ctx.fillStyle = "rgba(34, 197, 94, 0.3)"; }
        if (t.result === "LOSS") { lblTxt += " (LOSS)"; lblW = 105; ctx.fillStyle = "rgba(239, 68, 68, 0.3)"; }
        ctx.fillRect(0, ey - 7, lblW, 14);
        ctx.fillStyle = t.type === "CALL" || t.type === "BUY" ? "#22c55e" : "#ef4444";
        if (t.result === "WIN") ctx.fillStyle = "#22c55e";
        if (t.result === "LOSS") ctx.fillStyle = "#ef4444";
        ctx.fillText(lblTxt, 4, ey + 3);

        if (t.result === "OPEN" && t.durationS > 0) {
            const expireTimestamp = t.ts + t.durationS * 1000;
            const intMs = candles.length > 1 ? candles[1].t - candles[0].t : 60000;
            const firstVisible = view[0];
            if (firstVisible) {
              const diffMs = expireTimestamp - firstVisible.t;
              const diffCandles = diffMs / intMs;
              const expireIdx = startIdx + diffCandles;
              const exX = xOf(expireIdx);

              if (exX >= 0 && exX <= innerW + 100) {
                ctx.beginPath();
                ctx.setLineDash([2, 4]);
                ctx.strokeStyle = "rgba(255,255,255,0.3)";
                ctx.moveTo(exX, padT);
                ctx.lineTo(exX, innerH + padT);
                ctx.stroke();
                ctx.setLineDash([]);

                const remaining = Math.max(0, Math.ceil((expireTimestamp - Date.now()) / 1000));
                ctx.fillStyle = "rgba(255,255,255,0.7)";
                ctx.fillText(`${remaining}s`, exX + 4, padT + 12);
              }
            }
          }
        // removing extra brace
      });
    }

    if (hover) {
      ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(hover.x, 0); ctx.lineTo(hover.x, innerH + padT); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, hover.y); ctx.lineTo(innerW, hover.y); ctx.stroke();
      ctx.setLineDash([]);

      if (drawingMode) {
        const y = hover.y;
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = drawingMode === "support" ? "#22c55e" : "#ef4444";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(innerW, y); ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = drawingMode === "support" ? "#22c55e" : "#ef4444";
        ctx.fillRect(innerW, y - 9, padR, 18);
        ctx.fillStyle = "#fff";
        ctx.fillText(typeof hover.price === 'number' ? fmtPriceLabel(hover.price) : '', innerW + 4, y + 4);
      }
    }
  }, [size, candles, srLines, srZones, trendLines, showSRLines, asset, overlays, hover, startIdx, endIdx, viewCount, offset, drawingMode, trades, hoverTrendId, pendingTrendLine, fmtPriceLabel, scriptAnnotations, scriptLayerState, scriptStepThreshold, scriptAnnotationOpacity]);

  const onPointerMove = (e: React.PointerEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (dragSR) {
      setDragSR({ ...dragSR, price: priceOf(y) });
      return;
    }

    // Hover detection
    const nearSR = srLines.find(l => l.asset === asset && Math.abs(yOf(l.price) - y) < 14);
    setHoverSRId(nearSR?.id || null);

    const nearZone = srZones.find(z => {
      if (z.asset !== asset) return false;
      const yt = yOf(z.topPrice);
      const yb = yOf(z.bottomPrice);
      return y >= yt - 5 && y <= yb + 5 && x < innerW;
    });
    setHoverZoneId(nearZone?.id || null);

    // Dynamic hover check for Trendlines
    const getXOfTimestamp = (t: number) => {
      if (candles.length === 0) return 0;
      let closestIdx = 0;
      let minDiff = Infinity;
      for (let idx = 0; idx < candles.length; idx++) {
        const diff = Math.abs(candles[idx].t - t);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = idx;
        }
      }
      return xOf(closestIdx);
    };

    const getDistanceToSegment = (px: number, py: number, rx1: number, ry1: number, rx2: number, ry2: number): number => {
      const dx = rx2 - rx1;
      const dy = ry2 - ry1;
      const l2 = dx * dx + dy * dy;
      if (l2 === 0) return Math.sqrt((px - rx1) * (px - rx1) + (py - ry1) * (py - ry1));
      let t_factor = ((px - rx1) * dx + (py - ry1) * dy) / l2;
      t_factor = Math.max(0, Math.min(1, t_factor));
      const projX = rx1 + t_factor * dx;
      const projY = ry1 + t_factor * dy;
      return Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
    };

    const nearTrend = (trendLines || []).find(l => {
      if (l.asset !== asset) return false;
      const x1 = getXOfTimestamp(l.t1);
      const y1 = yOf(l.p1);
      const x2 = getXOfTimestamp(l.t2);
      const y2 = yOf(l.p2);
      const dist = getDistanceToSegment(x, y, x1, y1, x2, y2);
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const nearCenter = Math.sqrt((x - mx) ** 2 + (y - my) ** 2) < 14;
      return dist < 12 || nearCenter;
    });
    setHoverTrendId(nearTrend?.id || null);

    if (isDragging) {
      setOffset(dragStart.offset + (x - dragStart.x) / cw);
    }

    if (x < 0 || x > size.w || y < 0 || y > size.h) { setHover(null); return; }
    setHover({ x, y, price: priceOf(y), idx: Math.floor(startIdx + x / cw) });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Helper function for pointer coordinate resolution
    const getXOfTimestamp = (t: number) => {
      if (candles.length === 0) return 0;
      let closestIdx = 0;
      let minDiff = Infinity;
      for (let idx = 0; idx < candles.length; idx++) {
        const diff = Math.abs(candles[idx].t - t);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = idx;
        }
      }
      return xOf(closestIdx);
    };

    // Check for Trendline deletion click
    if (hoverTrendId) {
      const line = (trendLines || []).find(l => l.id === hoverTrendId);
      if (line) {
        const x1 = getXOfTimestamp(line.t1);
        const y1 = yOf(line.p1);
        const x2 = getXOfTimestamp(line.t2);
        const y2 = yOf(line.p2);
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        if (Math.sqrt((x - mx) ** 2 + (y - my) ** 2) < 16) {
          removeTrendLine(hoverTrendId);
          setHoverTrendId(null);
          return;
        }
      }
    }

    // Check for "X" button click (deletion)
    if (hoverSRId) {
      const line = srLines.find(l => l.id === hoverSRId);
      if (line) {
        const lx = innerW - 15;
        const ly = yOf(line.price);
        if (Math.abs(x - lx) < 15 && Math.abs(y - ly) < 15) {
          removeSR(hoverSRId);
          setHoverSRId(null);
          return;
        }
      }
    }
    if (hoverZoneId) {
      const zone = srZones.find(z => z.id === hoverZoneId);
      if (zone) {
        const lx = innerW - 15;
        const ly = yOf(zone.topPrice + (zone.bottomPrice - zone.topPrice) / 2);
        if (Math.abs(x - lx) < 15 && Math.abs(y - ly) < 15) {
          removeSRZone(hoverZoneId);
          setHoverZoneId(null);
          return;
        }
      }
    }

    const clickedSR = srLines.find(l => {
      if (l.asset !== asset) return false;
      const lineY = yOf(l.price);
      return Math.abs(lineY - y) < 10;
    });

    if (clickedSR) {
      setDragSR({ id: clickedSR.id, price: clickedSR.price });
      setIsDragging(false);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    if (drawingMode === "buy_zone" || drawingMode === "sell_zone") {
      if (!pendingZone) {
        setPendingZone({ startY: y, startPrice: priceOf(y) });
      } else {
        const p1 = pendingZone.startPrice;
        const p2 = priceOf(y);
        addSRZone({
          id: crypto.randomUUID(),
          asset,
          topPrice: Math.max(p1, p2),
          bottomPrice: Math.min(p1, p2),
          kind: drawingMode
        });
        setPendingZone(null);
        setDrawingMode(null);
      }
      return;
    }

    if (drawingMode === "trend_support" || drawingMode === "trend_resistance") {
      const candleIdx = Math.max(0, Math.min(candles.length - 1, Math.floor(startIdx + x / cw)));
      const t = candles[candleIdx]?.t || Date.now();
      const p = priceOf(y);

      if (!pendingTrendLine) {
        setPendingTrendLine({ t1: t, p1: p });
        toast.info("Ponto inicial marcado! Clique no final da linha diagonal.");
      } else {
        addTrendLine({
          id: crypto.randomUUID(),
          asset,
          t1: pendingTrendLine.t1,
          p1: pendingTrendLine.p1,
          t2: t,
          p2: p,
          kind: drawingMode === "trend_support" ? "support" : "resistance"
        });
        setPendingTrendLine(null);
        setDrawingMode(null);
        toast.success("Linha de tendência diagonal criada com sucesso!");
      }
      return;
    }

    if (drawingMode) {
      if (candles.length < 20) {
        toast.error("Aguarde pelo menos 20 velas para traçar linhas de suporte/resistência.");
        return;
      }
      addSR({ id: crypto.randomUUID(), asset, price: priceOf(y), kind: drawingMode === "support" ? "support" : "resistance" });
      return;
    }

    setIsDragging(true);
    setDragStart({ x, offset });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragSR) {
      useStore.getState().updateSR(dragSR.id, { price: dragSR.price });
      setDragSR(null);
    }
    setIsDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#131722] text-[#d1d4dc] border border-[#2a2e39] rounded-sm overflow-hidden select-none font-sans">
      {/* Top Toolbar */}
      <div className="h-10 border-b border-[#2a2e39] flex items-center px-3 gap-4 shrink-0 bg-[#131722]">
        <Popover open={isAssetSelectorOpen} onOpenChange={setIsAssetSelectorOpen}>
          <PopoverTrigger asChild>
            <button 
              className="flex items-center gap-1 font-bold text-sm text-white hover:bg-[#2a2e39] px-2 py-1 rounded transition-colors"
            >
              <span>{asset}</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent 
            align="start" 
            side="bottom" 
            sideOffset={5}
            className="w-[320px] p-0 bg-[#1e222d] border-[#2a2e39] text-[#d1d4dc] shadow-2xl z-[100]"
          >
            <div className="p-3">
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar ativos..."
                  className="pl-9 bg-[#131722] border-[#2a2e39] text-white h-9 text-xs focus:ring-primary/50"
                  value={assetSearch}
                  onChange={(e) => setAssetSearch(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar space-y-4">
                {/* Synthetic Indices */}
                <div>
                  <h4 className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1.5 px-2 flex items-center gap-1">
                    <Zap className="h-2.5 w-2.5 text-amber-500" /> Sintéticos
                  </h4>
                  <div className="grid grid-cols-1 gap-0.5">
                    {ASSETS.filter(a => a.type === "synthetic" && (a.symbol.toLowerCase().includes(assetSearch.toLowerCase()) || a.name.toLowerCase().includes(assetSearch.toLowerCase()))).map(a => (
                      <button
                        key={a.symbol}
                        onClick={() => {
                          onAssetChange?.(a.symbol);
                          setIsAssetSelectorOpen(false);
                          setAssetSearch("");
                        }}
                        className={`flex items-center justify-between p-2 rounded transition-all group ${asset === a.symbol ? 'bg-primary/10 border-l-2 border-primary' : 'hover:bg-[#2a2e39] border-l-2 border-transparent'}`}
                      >
                        <div className="flex flex-col items-start">
                          <span className={`font-bold text-xs ${asset === a.symbol ? 'text-primary' : 'text-white'}`}>{a.symbol}</span>
                          <span className="text-[9px] text-muted-foreground group-hover:text-white/60">{a.name}</span>
                        </div>
                        {asset === a.symbol && <div className="w-1 h-1 rounded-full bg-primary" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Forex */}
                {marketType !== "binary" && (
                  <div>
                    <h4 className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1.5 px-2 flex items-center gap-1">
                      <Globe className="h-2.5 w-2.5 text-blue-400" /> Forex
                    </h4>
                    <div className="grid grid-cols-1 gap-0.5">
                      {ASSETS.filter(a => a.type === "forex" && (a.symbol.toLowerCase().includes(assetSearch.toLowerCase()) || a.name.toLowerCase().includes(assetSearch.toLowerCase()))).map(a => (
                        <button
                          key={a.symbol}
                          onClick={() => {
                            onAssetChange?.(a.symbol);
                            setIsAssetSelectorOpen(false);
                            setAssetSearch("");
                          }}
                          className={`flex items-center justify-between p-2 rounded transition-all group ${asset === a.symbol ? 'bg-primary/10 border-l-2 border-primary' : 'hover:bg-[#2a2e39] border-l-2 border-transparent'}`}
                        >
                          <div className="flex flex-col items-start">
                            <span className={`font-bold text-xs ${asset === a.symbol ? 'text-primary' : 'text-white'}`}>{a.symbol}</span>
                            <span className="text-[9px] text-muted-foreground group-hover:text-white/60">{a.name}</span>
                          </div>
                          {asset === a.symbol && <div className="w-1 h-1 rounded-full bg-primary" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <div className="h-4 w-px bg-[#2a2e39]" />
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground uppercase mr-1 font-bold">
            {timeframeLabel || "Timeframe"}:
          </span>
          {(customTimeframes || ["1m", "2m", "3m", "5m", "10m", "15m", "30m", "1h", "1d"]).map((t) => {
            const active = selectedTimeframe ? t === selectedTimeframe : t === timeframe;
            return (
              <button
                key={t}
                onClick={() => onTimeframeChange ? onTimeframeChange(t) : setTimeframe(t)}
                className={`px-2 py-1 rounded text-xs hover:bg-[#2a2e39] transition-colors ${active ? "text-primary bg-[#2a2e39]" : ""}`}
              >
                {t}
              </button>
            );
          })}
        </div>
        <div className="h-4 w-px bg-[#2a2e39]" />
        <div className="flex items-center gap-2">
          <button className={`p-1.5 rounded hover:bg-[#2a2e39] ${indicator !== "none" ? "text-primary" : ""}`} title="Candles"><BarChart2 className="h-4 w-4" /></button>
          <button className="p-1.5 rounded hover:bg-[#2a2e39]" title="Line"><LineChart className="h-4 w-4" /></button>
        </div>
        <div className="h-4 w-px bg-[#2a2e39]" />
        <div className="relative group">
          {isRobotPerformance && robotsList && robotsList.length > 0 ? (
            <>
              <button className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[#2a2e39] text-xs font-semibold text-primary">
                🤖 Robô: {robotsList.find((r) => r.id === activeRobotId)?.name || activeRobotId || "Selecionar Robô"} <ChevronDown className="h-3 w-3" />
              </button>
              <div className="absolute top-full left-0 mt-1 w-48 bg-[#1e222d] border border-[#2a2e39] rounded shadow-xl hidden group-hover:block z-50">
                {robotsList.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => onSelectRobot && onSelectRobot(r.id, r.strategyId || r.id)}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-[#2a2e39] transition-colors truncate ${activeRobotId === r.id ? "text-primary font-bold bg-[#2a2e39]" : "text-muted-foreground"}`}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <button className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[#2a2e39] text-xs">
                Indicadores ({indicator}) <ChevronDown className="h-3 w-3" />
              </button>
              <div className="absolute top-full left-0 mt-1 w-40 bg-[#1e222d] border border-[#2a2e39] rounded shadow-xl hidden group-hover:block z-50">
                {["none", "sma", "rsi", "bb", "sar"].map((k) => (
                  <button
                    key={k}
                    onClick={() => setIndicator(k)}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-[#2a2e39] transition-colors uppercase ${indicator === k ? "text-primary" : ""}`}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground mr-1">{viewCount}</span>
          <button
            onClick={() => setViewCount((v) => Math.max(10, Math.round(v / 1.4)))}
            className="p-1.5 rounded hover:bg-[#2a2e39]"
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewCount((v) => Math.min(2000, Math.round(v * 1.4)))}
            className="p-1.5 rounded hover:bg-[#2a2e39]"
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <div className="h-4 w-px bg-[#2a2e39] mx-1" />
          <button className="p-1.5 rounded hover:bg-[#2a2e39]"><LayoutGrid className="h-4 w-4" /></button>
          <button className="p-1.5 rounded hover:bg-[#2a2e39]"><Settings2 className="h-4 w-4" /></button>
          <button className="p-1.5 rounded hover:bg-[#2a2e39]"><Maximize2 className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 relative">
        {/* Left Toolbar */}
        <div className="w-12 border-r border-[#2a2e39] flex flex-col items-center py-2 gap-3 bg-[#131722] shrink-0">
          <button
            className={`p-2 rounded hover:bg-[#2a2e39] ${!drawingMode ? "bg-[#2a2e39] text-primary" : ""}`}
            onClick={() => setDrawingMode(null)}
          >
            <MousePointer2 className="h-5 w-5" />
          </button>
          <button
            className={`p-2 rounded hover:bg-[#2a2e39] ${drawingMode === "support" ? "bg-[#2a2e39] text-bull" : ""}`}
            onClick={() => setDrawingMode("support")}
            onContextMenu={(e) => { e.preventDefault(); setDrawingMode("buy_zone"); toast.info("Modo Zona de Compra (Retângulo) ativado."); }}
            title="Suporte (Clique direito para Zona de Compra)"
          >
            <TrendingUp className="h-5 w-5" />
          </button>
          <button
            className={`p-2 rounded hover:bg-[#2a2e39] ${drawingMode === "resistance" ? "bg-[#2a2e39] text-bear" : ""}`}
            onClick={() => setDrawingMode("resistance")}
            onContextMenu={(e) => { e.preventDefault(); setDrawingMode("sell_zone"); toast.info("Modo Zona de Venda (Retângulo) ativado."); }}
            title="Resistência (Clique direito para Zona de Venda)"
          >
            <Minus className="h-5 w-5" />
          </button>
          <button
            className={`p-2 rounded hover:bg-[#2a2e39] ${drawingMode === "trend_support" ? "bg-[#2a2e39] text-bull" : ""}`}
            onClick={() => { setDrawingMode("trend_support"); setPendingTrendLine(null); }}
            title="Linha de Tendência de Alta (Diagonal S)"
          >
            <ArrowUpRight className="h-5 w-5" />
          </button>
          <button
            className={`p-2 rounded hover:bg-[#2a2e39] ${drawingMode === "trend_resistance" ? "bg-[#2a2e39] text-bear" : ""}`}
            onClick={() => { setDrawingMode("trend_resistance"); setPendingTrendLine(null); }}
            title="Linha de Tendência de Baixa (Diagonal R)"
          >
            <ArrowDownRight className="h-5 w-5" />
          </button>
          <button
            className={`p-2 rounded hover:bg-[#2a2e39] ${drawingMode === "buy_zone" ? "bg-[#2a2e39] text-bull" : ""}`}
            onClick={() => setDrawingMode("buy_zone")}
            title="Zona de Compra (Retângulo)"
          >
            <div className="w-5 h-4 border-2 border-bull/50 bg-bull/20 rounded-sm" />
          </button>
          <button
            className={`p-2 rounded hover:bg-[#2a2e39] ${drawingMode === "sell_zone" ? "bg-[#2a2e39] text-bear" : ""}`}
            onClick={() => setDrawingMode("sell_zone")}
            title="Zona de Venda (Retângulo)"
          >
            <div className="w-5 h-4 border-2 border-bear/50 bg-bear/20 rounded-sm" />
          </button>
          <button className="p-2 rounded hover:bg-[#2a2e39]"><LayoutGrid className="h-5 w-5" /></button>
          <button className="p-2 rounded hover:bg-[#2a2e39]"><Type className="h-5 w-5" /></button>
          <button className="p-2 rounded hover:bg-[#2a2e39]"><Ruler className="h-5 w-5" /></button>
          <div className="mt-auto flex flex-col gap-3 pb-2">
            <button
              className={`p-2 rounded hover:bg-[#2a2e39] ${!showSRLines ? "text-muted-foreground" : ""}`}
              onClick={() => setShowSRLines(!showSRLines)}
            >
              {showSRLines ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
            </button>
            <button 
              className="p-2 rounded hover:bg-[#2a2e39] text-destructive/70 hover:text-destructive" 
              onClick={() => useStore.getState().clearSR(asset)}
              title="Apagar traçados deste ativo"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Chart Area */}
        <div ref={wrapRef} className="flex-1 relative overflow-hidden bg-[#131722] cursor-crosshair">
          <canvas
            ref={ref}
            onPointerMove={onPointerMove}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={() => !dragSR && !isDragging && setHover(null)}
            onWheel={(e) => { e.preventDefault(); setViewCount((v) => Math.max(10, Math.min(2000, v * (e.deltaY > 0 ? 1.1 : 0.9)))); }}
            className={dragSR ? "cursor-ns-resize" : isDragging ? "cursor-grabbing" : hoverSRId ? "cursor-pointer" : "cursor-crosshair"}
            style={{ touchAction: 'none' }}
          />

          {/* Watermark */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-[0.03] select-none text-center">
            <div className="text-8xl font-bold tracking-tighter">QUANTTERM</div>
            <div className="text-2xl tracking-[0.5em] mt-2">TRADING PRO</div>
          </div>

          {hover && (
            <div className="absolute right-[60px] top-0 bottom-0 pointer-events-none">
              <div className="absolute bg-[#363a45] text-white text-[10px] px-1.5 py-0.5 rounded-sm" style={{ top: hover.y - 10 }}>
                {typeof hover.price === 'number' ? fmtPriceLabel(hover.price) : ''}
              </div>
            </div>
          )}

          {offset > -15 && (
            <button
              onClick={() => setOffset(-20)}
              className="absolute bottom-6 right-20 bg-[#2a2e39] hover:bg-[#363a45] text-white text-[10px] px-3 py-1.5 rounded border border-[#434651] shadow-xl transition-all flex items-center gap-2"
            >
              <ChevronDown className="h-3 w-3 rotate-180" /> Ir para o Tempo Real
            </button>
          )}
        </div>
      </div>

      {/* Bottom Axis Area */}
      <div className="h-8 border-t border-[#2a2e39] bg-[#131722] flex items-center justify-between px-14 text-[10px] text-muted-foreground">
        <div className="flex gap-12">
          {["15:00", "16:00", "17:00", "18:00", "19:00"].map(t => <span key={t}>{t}</span>)}
        </div>
        <div className="flex items-center gap-4 pr-16">
          <span>UTC+1</span>
          <span>%</span>
          <span>LOG</span>
          <span className="text-primary font-bold">AUTO</span>
        </div>
      </div>
    </div>
  );
}
