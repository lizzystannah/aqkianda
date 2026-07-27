import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { CandlestickChart } from "@/components/CandlestickChart";
import { ASSETS, type Candle } from "@/lib/market";
import { derivAPI } from "@/lib/deriv";
import type { ScriptAnnotation, ScriptLogEntry, ScriptLayerState } from "@/lib/scriptAnnotations";
import { DEFAULT_LAYER_STATE } from "@/lib/scriptAnnotations";
import { executeBacktest } from "@/lib/scriptSandbox";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Play, Trash2, Terminal, AlertCircle, CheckCircle2, Layers, StepForward, RotateCcw, LineChart, FileText, ChevronLeft, X, Eye } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";

// Persiste script entre navegações SPA (componente desmonta/monta); morre ao dar refresh
let cachedScript = "";

const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h"];
const WARM_UP = 150;

function getIntervalMs(tf: string): number {
  const map: Record<string, number> = {
    "1m": 60_000,
    "5m": 300_000,
    "15m": 900_000,
    "30m": 1_800_000,
    "1h": 3_600_000,
  };
  return map[tf] || 60_000;
}

const LAYER_BTNS: { key: keyof ScriptLayerState; label: string; color: string }[] = [
  { key: "support", label: "Suportes", color: "text-[#22c55e]" },
  { key: "resistance", label: "Resistências", color: "text-[#ef4444]" },
  { key: "entry", label: "Entradas", color: "text-[#8b5cf6]" },
  { key: "analysis", label: "Análise", color: "text-[#f59e0b]" },
  { key: "highlight", label: "Highlight", color: "text-[#fbbf24]" },
];

export default function RobotPerformance() {
  const [selectedAsset, setSelectedAsset] = useState(ASSETS[0].symbol);
  const [selectedTimeframe, setSelectedTimeframe] = useState("1m");
  const [scriptText, setScriptText] = useState(cachedScript);
  const [annotations, setAnnotations] = useState<ScriptAnnotation[]>([]);
  const [logs, setLogs] = useState<ScriptLogEntry[]>([]);
  const [status, setStatus] = useState<"idle" | "running" | "success" | "error">("idle");
  const [activeTab, setActiveTab] = useState("log");
  const [isAssetOpen, setIsAssetOpen] = useState(false);
  const [layerState, setLayerState] = useState<ScriptLayerState>({ ...DEFAULT_LAYER_STATE });
  const [annotationOpacity, setAnnotationOpacity] = useState<number>(0.65);
  const [stepMode, setStepMode] = useState(false);

  const handleRemoveAnnotation = (indexToRemove: number) => {
    setAnnotations((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };
  const [currentStep, setCurrentStep] = useState(0);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [entryCount, setEntryCount] = useState(0);
  const [winRate, setWinRate] = useState<{ wins: number; losses: number; total: number } | null>(null);
  const [showStrategyDialog, setShowStrategyDialog] = useState(false);
  const [newStrategyId, setNewStrategyId] = useState("");
  const [newStrategyName, setNewStrategyName] = useState("");
  const [newStrategyDesc, setNewStrategyDesc] = useState("");
  const [candleCount, setCandleCount] = useState(1000);
  const [realCandles, setRealCandles] = useState<Candle[]>([]);
  const [isLoadingCandles, setIsLoadingCandles] = useState(false);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stop step replay on unmount
  useEffect(() => {
    return () => {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
    };
  }, []);

  const asset = useMemo(
    () => ASSETS.find((a) => a.symbol === selectedAsset) || ASSETS[0],
    [selectedAsset]
  );

  // Fetch real candles from the Deriv platform
  useEffect(() => {
    let cancelled = false;
    setIsLoadingCandles(true);

    const intervalSec = Math.round(getIntervalMs(selectedTimeframe) / 1000);

    derivAPI.getCandles(selectedAsset, candleCount, intervalSec)
      .then((data: any) => {
        if (cancelled) return;
        if (data && data.length > 0) {
          const parsed: Candle[] = data.map((c: any) => ({
            t: c.epoch * 1000,
            o: c.open,
            h: c.high,
            l: c.low,
            c: c.close,
          }));
          setRealCandles(parsed);
        } else {
          setRealCandles([]);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("Falha ao carregar velas da plataforma", err);
        toast.error("Falha ao carregar velas da plataforma");
        setRealCandles([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingCandles(false);
      });

    return () => { cancelled = true; };
  }, [selectedAsset, selectedTimeframe, candleCount]);

  const candles = realCandles;

  const toggleLayer = useCallback((key: keyof ScriptLayerState) => {
    setLayerState((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const clearAll = useCallback(() => {
    setAnnotations([]);
    setLogs([]);
    setStatus("idle");
    setWinRate(null);
    setStepMode(false);
    setCurrentStep(0);
    if (stepTimerRef.current) {
      clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }
  }, []);

  const handleScriptChange = useCallback((value: string) => {
    cachedScript = value;
    setScriptText(value);
  }, []);

  const handleEliminar = useCallback(() => {
    clearAll();
    cachedScript = "";
    setScriptText("");
  }, [clearAll]);

  const handleRun = useCallback(() => {
    clearAll();
    if (candles.length === 0) {
      toast.error("Sem velas para analisar");
      setStatus("error");
      return;
    }
    setStatus("running");

    const newAnnotations: ScriptAnnotation[] = [];
    const newLogs: ScriptLogEntry[] = [];

    const backtestResult = executeBacktest(
      scriptText,
      candles,
      WARM_UP,
      (ann) => newAnnotations.push(ann),
      (log) => newLogs.push(log),
      () => {
        newAnnotations.length = 0;
        newLogs.length = 0;
      }
    );

    setAnnotations([...newAnnotations]);
    setLogs([...newLogs]);

    // Auto-calcular win rate comparando direção com vela real
    const entryAnnotations = newAnnotations.filter(
      (a): a is typeof a & { type: "arrow"; direction: "up" | "down" } =>
        a.type === "arrow" && a.meta?.layer === "entry"
    );
    let wins = 0;
    let losses = 0;
    for (const ann of entryAnnotations) {
      if (ann.type !== "arrow") continue;
      const candle = candles[ann.candleIndex];
      if (!candle) continue;
      const isCall = ann.direction === "up";
      const won = isCall ? candle.c > candle.o : candle.c < candle.o;
      if (won) wins++; else losses++;
    }
    setWinRate({ wins, losses, total: entryAnnotations.length });

    const { success, error, entryCount: ec } = backtestResult;
    setEntryCount(ec || 0);

    if (!success) {
      setStatus("error");
      newLogs.push({ id: Date.now(), text: `❌ ERRO: ${error}`, ts: Date.now() });
      setLogs([...newLogs]);
      toast.error(`Script error: ${error}`);
    } else {
      setStatus("success");
      const count = newAnnotations.length;
      toast.success(`Backtest concluído: ${candles.length} velas, ${count} anotação${count !== 1 ? "ões" : ""}`);
      // Auto-activar step replay para mostrar progressão vela a vela
      setStepMode(true);
      setCurrentStep(0);
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
      stepTimerRef.current = setInterval(() => {
        setCurrentStep((prev) => {
          if (prev >= candles.length - 1) {
            if (stepTimerRef.current) clearInterval(stepTimerRef.current);
            stepTimerRef.current = null;
            return candles.length - 1;
          }
          return prev + 5;
        });
      }, 50);
    }
  }, [scriptText, candles, clearAll]);

  const handleConvertToStrategy = useCallback(() => {
    setNewStrategyId("");
    setNewStrategyName("");
    setNewStrategyDesc("");
    setShowStrategyDialog(true);
  }, []);

  const handleCreateStrategy = useCallback(async () => {
    if (!newStrategyId.trim()) return;
    try {
      // Strip ctx.api.* lines from the script (annotations are sandbox-only)
      const lines = scriptText.split("\n");
      const preamble = [];
      const bodyLines = [];
      let inOnTick = false;
      let braceDepth = 0;
      let skipParenDepth = 0; // tracks unbalanced ( in ctx.api.* multi-line calls

      for (const line of lines) {
        const trimmed = line.trim();

        // Skip multi-line ctx.api.* call arguments until parens balance
        if (skipParenDepth > 0) {
          for (const ch of line) { if (ch === "(") skipParenDepth++; if (ch === ")") skipParenDepth--; }
          if (skipParenDepth > 0) continue;
          continue; // skip the closing line too
        }

        // Detect 'function onTick(ctx)' entry
        if (!inOnTick && /^function\s+onTick\s*\(/.test(trimmed)) {
          inOnTick = true;
          // Count opening brace on this line
          for (const ch of line) { if (ch === "{") braceDepth++; if (ch === "}") braceDepth--; }
          continue;
        }

        if (inOnTick) {
          for (const ch of line) { if (ch === "{") braceDepth++; if (ch === "}") braceDepth--; }
          if (braceDepth <= 0) {
            inOnTick = false;
            continue; // skip closing brace line
          }
          // Filter out lines with ctx.api.* calls (visual annotations) within onTick body
          // We use includes() to catch inline usage like: if (cond) ctx.api.addLine(...)
          if (trimmed.includes("ctx.api.")) {
            // Check for multi-line call (unbalanced parens)
            let unbalanced = 0;
            for (const ch of line) { if (ch === "(") unbalanced++; if (ch === ")") unbalanced--; }
            if (unbalanced > 0) skipParenDepth = unbalanced;
            continue; // skip this line
          }
          if (!trimmed.startsWith("//")) {
            bodyLines.push(line);
          }
        } else {
          // Preamble: filter out ctx.api.* and comment-only lines (preamble is included before strategy)
          if (trimmed.includes("ctx.api.")) {
            let unbalanced = 0;
            for (const ch of line) { if (ch === "(") unbalanced++; if (ch === ")") unbalanced--; }
            if (unbalanced > 0) skipParenDepth = unbalanced;
            continue;
          }
          if (!trimmed.startsWith("//")) {
            preamble.push(line);
          }
        }
      }

      // Build the full module code
      const sid = newStrategyId.trim();
      // Sanitize for use as a JS variable name (replace invalid chars with underscore)
      const varName = sid.replace(/[^a-zA-Z0-9_$]/g, "_").replace(/^(\d)/, "_$1");
      if (!varName) {
        toast.error("O ID da estratégia não pode ficar vazio após sanitização.");
        return;
      }
      const sname = newStrategyName.trim() || sid;
      const sdesc = newStrategyDesc.trim();

      const cleanPreamble = preamble.join("\n");
      const indentedBody = bodyLines.map(l => "    " + l).join("\n");

      const header = [
        'import { Strategy, StrategyContext, StrategyResult } from "./index";',
        "",
      ].join("\n");

      const strategyObj = [
        "",
        "const " + varName + 'Strategy: Strategy = {',
        '  id: "' + sid + '",',
        '  name: "' + sname + '",',
        '  description: "' + sdesc + '",',
        '  category: "auto",',
        "  onTick: (ctx: StrategyContext): StrategyResult | null => {",
        indentedBody,
        "  }",
        "};",
        "",
        "export default " + varName + "Strategy;",
      ].join("\n");

      const strategyCode = header + cleanPreamble + strategyObj;

      const res = await fetch("/api/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sid, code: strategyCode })
      });

      if (res.ok) {
        toast.success("Estratégia criada com sucesso!");
        setShowStrategyDialog(false);
        setNewStrategyId("");
        setNewStrategyName("");
        setNewStrategyDesc("");
      } else {
        const err = await res.json();
        toast.error(err.error || "Erro ao salvar estratégia.");
      }
    } catch (e) {
      toast.error("Erro de conexão com o servidor.");
    }
  }, [scriptText, newStrategyId, newStrategyName, newStrategyDesc]);

  const handleStepToggle = useCallback(() => {
    if (stepMode) {
      // Stop step mode
      setStepMode(false);
      setCurrentStep(0);
      if (stepTimerRef.current) {
        clearInterval(stepTimerRef.current);
        stepTimerRef.current = null;
      }
    } else {
      // Start step mode
      setStepMode(true);
      setCurrentStep(0);
      if (annotations.length === 0) {
        toast.error("Executa o script primeiro");
        return;
      }
    }
  }, [stepMode, annotations.length]);

  const handleStepPlay = useCallback(() => {
    if (stepTimerRef.current) {
      clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
      return;
    }
    stepTimerRef.current = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= candles.length - 1) {
          if (stepTimerRef.current) clearInterval(stepTimerRef.current);
          stepTimerRef.current = null;
          return candles.length - 1;
        }
        return prev + 5;
      });
    }, 50);
  }, []);

  const statusIcon = status === "success" ? <CheckCircle2 className="h-3 w-3 text-bull" /> : status === "error" ? <AlertCircle className="h-3 w-3 text-bear" /> : null;
  const statusText = status === "idle" ? "Pronto" : status === "running" ? "A executar..." : status === "success" ? `${annotations.length} anotação${annotations.length !== 1 ? "ões" : ""}` : "Erro";
  const winRateText = winRate && winRate.total > 0
    ? `${winRate.wins}/${winRate.total} (${(winRate.wins / winRate.total * 100).toFixed(1)}%)`
    : null;

  return (
    <AppShell>
    <div className="h-full flex flex-col bg-[#131722] text-[#d1d4dc]">
      {/* === Top Bar === */}
      <div className="min-h-11 border-b border-[#2a2e39] flex flex-wrap items-center px-4 py-1 gap-2.5 shrink-0 bg-[#131722] overflow-x-auto no-scrollbar">
        <h1 className="text-sm font-bold text-white uppercase tracking-wider">
          Script Sandbox
        </h1>
        <div className="h-4 w-px bg-[#2a2e39]" />

        {/* Asset Selector — Lista de ativos disponível */}
        <select
          value={selectedAsset}
          onChange={(e) => setSelectedAsset(e.target.value)}
          className="bg-[#1e222d] border border-[#2a2e39] hover:border-[#434651] rounded px-2.5 py-1 text-xs font-semibold text-white transition-colors cursor-pointer outline-none focus:border-primary"
        >
          {ASSETS.map((a) => (
            <option key={a.symbol} value={a.symbol} className="bg-[#1e222d] text-white py-1">
              {a.symbol} - {a.name}
            </option>
          ))}
        </select>

        {/* Timeframe */}
        <div className="flex items-center gap-0.5">
          {TIMEFRAMES.map((t) => (
            <button
              key={t}
              onClick={() => setSelectedTimeframe(t)}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                selectedTimeframe === t
                  ? "text-primary bg-[#2a2e39] font-semibold"
                  : "text-muted-foreground hover:text-white hover:bg-[#2a2e39]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Candle Count */}
        <div className="flex items-center gap-2 ml-2">
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            Velas:
          </span>
          <input
            type="range"
            min={150}
            max={1500}
            step={10}
            value={candleCount}
            onChange={(e) => setCandleCount(Number(e.target.value))}
            className="w-20 h-1 accent-primary cursor-pointer"
            title="Número de velas (150-1500)"
          />
          <span className="text-[10px] text-muted-foreground w-8 text-right tabular-nums">
            {candleCount}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>
            {candles.length} velas ·{" "}
            {selectedAsset}
          </span>
        </div>
      </div>

      {/* === Main Split === */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Left: Chart */}
        <div className={`min-w-0 border-r border-[#2a2e39] flex flex-col ${panelCollapsed ? 'flex-1' : 'flex-[2]'}`}>
          {/* Layer Toggles & Opacity */}
          <div className="h-8 border-b border-[#2a2e39] flex items-center px-3 gap-2 shrink-0">
            <Layers className="h-3 w-3 text-muted-foreground" />
            {LAYER_BTNS.map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => toggleLayer(key)}
                className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                  layerState[key]
                    ? `${color} bg-[#2a2e39] font-semibold`
                    : "text-muted-foreground hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground pr-1">
              <Eye className="h-3 w-3 text-muted-foreground" />
              <span>Opacidade:</span>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={annotationOpacity}
                onChange={(e) => setAnnotationOpacity(parseFloat(e.target.value))}
                className="w-16 h-1 accent-primary cursor-pointer"
                title={`Transparência das marcações: ${Math.round(annotationOpacity * 100)}%`}
              />
              <span className="w-7 text-right tabular-nums text-white">{Math.round(annotationOpacity * 100)}%</span>
            </div>
          </div>
          <div className="flex-1 min-h-0 relative">
            {isLoadingCandles && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#131722]/80">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <div className="h-3 w-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  A carregar velas...
                </div>
              </div>
            )}
            <CandlestickChart
              asset={selectedAsset}
              candles={candles}
              drawingMode={null}
              setDrawingMode={() => {}}
              indicator="none"
              setIndicator={() => {}}
              tradingMode="backtest"
              scriptAnnotations={annotations}
              scriptLayerState={layerState}
              scriptStepThreshold={stepMode ? currentStep : undefined}
              scriptAnnotationOpacity={annotationOpacity}
            />
          </div>
          {/* Step-by-step replay bar */}
          {stepMode && (
            <div className="h-8 border-t border-[#2a2e39] flex items-center px-3 gap-2 shrink-0">
              <button
                onClick={handleStepPlay}
                className="h-5 w-5 flex items-center justify-center rounded hover:bg-[#2a2e39] transition-colors"
                title={stepTimerRef.current ? "Pausar" : "Reproduzir"}
              >
                {stepTimerRef.current ? (
                  <div className="w-2.5 h-2.5 bg-muted-foreground" />
                ) : (
                  <StepForward className="h-3 w-3 text-muted-foreground" />
                )}
              </button>
              <button
                onClick={() => setCurrentStep(0)}
                className="h-5 w-5 flex items-center justify-center rounded hover:bg-[#2a2e39] transition-colors"
                title="Reiniciar"
              >
                <RotateCcw className="h-3 w-3 text-muted-foreground" />
              </button>
              <input
                type="range"
                min={0}
                max={candles.length > 0 ? candles.length - 1 : 0}
                value={currentStep}
                onChange={(e) => setCurrentStep(Number(e.target.value))}
                className="flex-1 h-1 accent-primary cursor-pointer"
              />
              <span className="text-[10px] text-muted-foreground w-16 text-right tabular-nums">
                {currentStep} / {candles.length - 1}
              </span>
            </div>
          )}
        </div>

        {/* Right: Script Panel */}
        <div className={`${panelCollapsed ? 'w-0 min-w-0 overflow-hidden' : 'flex-1 min-w-[320px] max-w-[480px]'} flex flex-col bg-[#131722] transition-all duration-200`}>
          {/* Collapse toggle button - positioned on the border */}
          <button
            onClick={() => setPanelCollapsed(!panelCollapsed)}
            className="absolute z-20 top-1/2 -translate-y-1/2 w-6 h-10 bg-[#1e222d] border border-[#2a2e39] rounded-r flex items-center justify-center hover:bg-[#2a2e39] transition-colors cursor-pointer"
            style={{ left: panelCollapsed ? '0' : '-12px' }}
            title={panelCollapsed ? "Expandir painel" : "Recolher painel"}
          >
            <ChevronLeft className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${panelCollapsed ? 'rotate-180' : ''}`} />
          </button>
          {!panelCollapsed && (
            <>
              {/* Script Editor */}
          <div className="flex-1 flex flex-col min-h-0 p-3 gap-2">
            <div className="flex flex-wrap items-center justify-between gap-1.5 pb-1 border-b border-[#2a2e39]/50">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Terminal className="h-3 w-3" />
                Script Editor
              </span>
              <div className="flex flex-wrap items-center gap-1">
                <div className="flex items-center gap-1 text-[10px] mr-1">
                  {statusIcon}
                  <span
                    className={
                      status === "success"
                        ? "text-bull"
                        : status === "error"
                          ? "text-bear"
                          : "text-muted-foreground"
                    }
                  >
                    {statusText}
                  </span>
                  {winRateText && (
                    <span className="text-bull font-semibold ml-1">
                      {winRateText}
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleStepToggle}
                  disabled={annotations.length === 0}
                  className={`h-6 px-2 text-[10px] ${stepMode ? "text-primary" : "text-muted-foreground hover:text-white"}`}
                >
                  <StepForward className="h-3 w-3 mr-1" />
                  Step
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearAll}
                  disabled={annotations.length === 0 && logs.length === 0}
                  className="h-6 px-2 text-[10px] text-muted-foreground hover:text-white"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Limpar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleEliminar}
                  disabled={!scriptText.trim()}
                  className="h-6 px-2 text-[10px] text-bear hover:text-white"
                >
                  <X className="h-3 w-3 mr-1" />
                  Eliminar
                </Button>
                <Button
                  size="sm"
                  onClick={handleRun}
                  disabled={status === "running" || !scriptText.trim()}
                  className="h-6 px-2.5 text-[10px] bg-primary hover:bg-primary/90"
                >
                  <Play className="h-3 w-3 mr-1" />
                  Executar
                </Button>
                <Button
                  size="sm"
                  onClick={handleConvertToStrategy}
                  disabled={status !== "success" || entryCount === 0}
                  className="h-6 px-2.5 text-[10px] bg-emerald-600 hover:bg-emerald-700"
                >
                  <FileText className="h-3 w-3 mr-1" />
                  Criar Estratégia
                </Button>
              </div>
            </div>
            <Textarea
              value={scriptText}
              onChange={(e) => handleScriptChange(e.target.value)}
              className="flex-1 font-mono text-[11px] leading-relaxed bg-[#1e222d] border-[#2a2e39] text-white resize-none focus-visible:ring-0 rounded p-3"
              placeholder="// Cole o seu script aqui..."
              spellCheck={false}
            />
          </div>

          {/* Bottom Tabs: Log + Documentation */}
          <div className="h-52 border-t border-[#2a2e39] flex flex-col">
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="flex-1 flex flex-col"
            >
              <TabsList className="bg-transparent border-b border-[#2a2e39] px-3 justify-start gap-0 h-8 rounded-none">
                <TabsTrigger
                  value="log"
                  className="text-[11px] data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none px-3 h-full border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-white"
                >
                  Log
                </TabsTrigger>
                <TabsTrigger
                  value="annotations"
                  className="text-[11px] data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none px-3 h-full border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-white flex items-center gap-1"
                >
                  Marcações ({annotations.length})
                </TabsTrigger>
                <TabsTrigger
                  value="docs"
                  className="text-[11px] data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none px-3 h-full border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-white"
                >
                  Documentação
                </TabsTrigger>
              </TabsList>
              <TabsContent value="log" className="flex-1 p-2 overflow-y-auto m-0 data-[state=active]:flex flex-col">
                {logs.length === 0 && (
                  <div className="text-[10px] text-muted-foreground italic p-1">
                    Nenhuma saída. Clique em "Executar" para rodar o script.
                  </div>
                )}
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="text-[11px] font-mono py-0.5 px-1 border-b border-[#2a2e39]/50 last:border-0 text-muted-foreground"
                  >
                    {log.text}
                  </div>
                ))}
              </TabsContent>
              <TabsContent value="annotations" className="flex-1 p-2 overflow-y-auto m-0 data-[state=active]:flex flex-col gap-1.5">
                {annotations.length === 0 ? (
                  <div className="text-[10px] text-muted-foreground italic p-1">
                    Nenhuma marcação adicionada. As marcações geradas pelo script aparecerão aqui.
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between px-1 pb-1 border-b border-[#2a2e39] shrink-0">
                      <span className="text-[10px] text-muted-foreground font-semibold">
                        {annotations.length} marcação(ões) lista(s)
                      </span>
                      <button
                        onClick={() => setAnnotations([])}
                        className="text-[10px] text-bear hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" /> Limpar Todas
                      </button>
                    </div>
                    <div className="space-y-1 overflow-y-auto max-h-36 pr-1 flex-1">
                      {annotations.map((ann, idx) => {
                        const label =
                          "label" in ann && ann.label
                            ? ann.label
                            : "text" in ann
                            ? ann.text
                            : "price" in ann
                            ? `Preço ${ann.price}`
                            : `Vela #${"candleIndex" in ann ? ann.candleIndex : "idx1" in ann ? ann.idx1 : idx}`;
                        const color = ann.color || "#8b5cf6";
                        const layer = ann.meta?.layer || (ann.type === "highlight" ? "highlight" : "análise");

                        return (
                          <div
                            key={ann.id || idx}
                            className="flex items-center justify-between p-1.5 bg-[#1e222d] border border-[#2a2e39] rounded text-[11px] gap-2 hover:border-border/40 transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: color }}
                              />
                              <span className="font-semibold text-white uppercase text-[9px] px-1 py-0.2 bg-[#2a2e39] rounded shrink-0">
                                {ann.type}
                              </span>
                              <span className="truncate text-slate-200" title={label}>
                                {label}
                              </span>
                              <span className="text-[9px] text-muted-foreground shrink-0">
                                [{layer}]
                              </span>
                            </div>
                            <button
                              onClick={() => handleRemoveAnnotation(idx)}
                              className="text-muted-foreground hover:text-bear p-0.5 rounded hover:bg-[#2a2e39] transition-colors shrink-0 cursor-pointer"
                              title="Remover marcação"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </TabsContent>
              <TabsContent
                value="docs"
                className="flex-1 p-3 overflow-y-auto m-0 data-[state=active]:flex flex-col"
              >
                <DocPanel />
              </TabsContent>
            </Tabs>
          </div>
            </>
          )}
        </div>
      </div>
    </div>
      {/* Strategy Creation Dialog */}
      <Dialog open={showStrategyDialog} onOpenChange={setShowStrategyDialog}>
        <DialogContent className="bg-[#1e222d] border-[#2a2e39] text-white">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Criar Estratégia</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="strategy-id" className="text-[11px] text-muted-foreground">ID da Estratégia *</Label>
              <Input
                id="strategy-id"
                value={newStrategyId}
                onChange={(e) => setNewStrategyId(e.target.value)}
                placeholder="ex: rsi_reversal_simple"
                className="h-8 text-[12px] bg-[#131722] border-[#2a2e39] text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="strategy-name" className="text-[11px] text-muted-foreground">Nome</Label>
              <Input
                id="strategy-name"
                value={newStrategyName}
                onChange={(e) => setNewStrategyName(e.target.value)}
                placeholder="ex: RSI Reversal Simple"
                className="h-8 text-[12px] bg-[#131722] border-[#2a2e39] text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="strategy-desc" className="text-[11px] text-muted-foreground">Descrição</Label>
              <Input
                id="strategy-desc"
                value={newStrategyDesc}
                onChange={(e) => setNewStrategyDesc(e.target.value)}
                placeholder="Descrição opcional da estratégia"
                className="h-8 text-[12px] bg-[#131722] border-[#2a2e39] text-white"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowStrategyDialog(false)}
              className="h-8 px-3 text-[11px] text-muted-foreground hover:text-white"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={!newStrategyId.trim()}
              onClick={handleCreateStrategy}
              className="h-8 px-3 text-[11px] bg-primary hover:bg-primary/90"
            >
              <FileText className="h-3 w-3 mr-1" />
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function DocPanel() {
  const entries: { sig: string; desc: string }[] = [
    {
      sig: "onTick(ctx)",
      desc: "Função obrigatória chamada para cada vela (backtest). Variáveis fora dela persistem entre chamadas. Formato IDÊNTICO ao das Estratégias reais.",
    },
    {
      sig: "ctx.history",
      desc: "Array com velas até a atual { t, o, h, l, c }. Não vê o futuro!",
    },
    {
      sig: "ctx.candles",
      desc: "Mesmo que ctx.history (alias de compatibilidade).",
    },
    {
      sig: "ctx.lastPrice",
      desc: "Preço de fecho da última vela (ctx.history[last].c).",
    },
    {
      sig: "ctx.currentPrice",
      desc: "Alias de ctx.lastPrice.",
    },
    {
      sig: "ctx.index",
      desc: "Índice da vela atual (0..N-1).",
    },
    {
      sig: "ctx.candle",
      desc: "Vela atual (ctx.history[ctx.index]).",
    },
    {
      sig: "ctx.isLast",
      desc: "true se é a última vela.",
    },
    {
      sig: "ctx.warmUp",
      desc: "Número de velas de warm-up. Entradas bloqueadas durante warm-up.",
    },
    {
      sig: "ctx.isWarmUp",
      desc: "true se ctx.index < ctx.warmUp.",
    },
    {
      sig: "ctx.indicators.rsi(period, dataSource?)",
      desc: "RSI (Relative Strength Index). dataSource = array de preços (padrão: closes).",
    },
    {
      sig: "ctx.indicators.sma(period, dataSource?)",
      desc: "Média móvel simples.",
    },
    {
      sig: "ctx.indicators.ema(period, dataSource?)",
      desc: "Média móvel exponencial.",
    },
    {
      sig: "ctx.indicators.bollinger(period, mult, dataSource?)",
      desc: "Bandas de Bollinger. Retorna { upper, lower }.",
    },
    {
      sig: "ctx.indicators.adx(period, dataSource?)",
      desc: "ADX + DI. dataSource = array de Candle. Retorna { adx, plusDi, minusDi }.",
    },
    {
      sig: "ctx.indicators.macd(fast, slow, signal, dataSource?)",
      desc: "MACD. Retorna { macd, signal, histogram }.",
    },
    {
      sig: "ctx.indicators.parabolicSar(afStep?, afMax?, dataSource?)",
      desc: "Parabolic SAR. dataSource = array de Candle. Retorna { sar, trend, af }.",
    },
    {
      sig: "ctx.api.addLine(idx, price, label?, color?, meta?, range?)",
      desc: "Linha horizontal no preço.",
    },
    {
      sig: "ctx.api.addArrow(idx, dir, label?, color?, meta?)",
      desc: "Seta na vela. dir = \"up\" | \"down\"",
    },
    {
      sig: "ctx.api.addText(idx, text, pos?, color?, meta?)",
      desc: "Texto numa vela. pos = \"above\" | \"below\"",
    },
    {
      sig: "ctx.api.addZone(s, e, high, low, label?, color?, meta?)",
      desc: "Zona retangular entre candles e preços.",
    },
    {
      sig: "ctx.api.addResistance(i, label?)",
      desc: "Marca resistência automática (linha + círculo vermelho).",
    },
    {
      sig: "ctx.api.addSupport(i, label?)",
      desc: "Marca suporte automático (linha + losango verde).",
    },
    {
      sig: "ctx.api.highlight(i, color?)",
      desc: "Destaca vela com fundo colorido.",
    },
  ];

  return (
    <div className="space-y-3 text-[11px]">
      <div>
        <h3 className="text-xs font-bold text-white mb-1">Script Sandbox API</h3>
        <p className="text-muted-foreground leading-relaxed">
          Escreve JavaScript para analisar velas e anotar o gráfico. Controla o número de velas com o slider "Velas" na barra superior.
          A entrada (CALL/PUT) é executada na <strong className="text-white">PRÓXIMA vela</strong> após a vela de análise — o motor coloca automaticamente o sinal em <code className="text-primary text-[10px]">i + 1</code>, simulando o comportamento real do robô ao vivo.
          O objeto <code className="text-primary text-[10px]">ctx</code> segue o formato das <strong>Estratégias</strong>:
        </p>
      </div>

      <div className="space-y-1">
        {entries.map(({ sig, desc }) => (
          <div key={sig} className="flex items-start gap-2 py-0.5">
            <code className="text-primary shrink-0 text-[10px] leading-relaxed">
              {sig}
            </code>
            <span className="text-muted-foreground leading-relaxed">{desc}</span>
          </div>
        ))}
      </div>

      <div>
        <h4 className="text-[11px] font-bold text-white mt-3 mb-1">Exemplo completo (formato Estratégia)</h4>
        <pre className="bg-[#1e222d] border border-[#2a2e39] rounded p-2 text-[10px] text-muted-foreground leading-relaxed overflow-x-auto">
{
`// Estado persiste entre chamadas
let ultimoSinal = null;

function onTick(ctx) {
  if (ctx.history.length < 20) return null;

  // Indicadores (API idêntica às Estratégias)
  const rsi = ctx.indicators.rsi(14);
  const lastRsi = rsi[rsi.length - 1];

  // Anotações visuais (apenas sandbox)
  ctx.api.addLine(ctx.index - 1, ctx.history[ctx.index - 1].h, "Linha");

  // Sinal (entrada na PRÓXIMA vela)
  if (lastRsi < 30) {
    ctx.api.log("RSI baixo - CALL");
    return { action: "CALL", expiryCandles: 1 };
  }

  return null;
}`
}
        </pre>
      </div>

      <div className="pt-1 pb-2">
        <h4 className="text-[11px] font-bold text-white mb-1">Layers</h4>
        <p className="text-muted-foreground leading-relaxed">
          Os botões no topo do gráfico permitem ligar/desligar: <strong>Suportes</strong>, <strong>Resistências</strong>, <strong>Entradas</strong>, <strong>Análise</strong> e <strong>Highlight</strong>.
        </p>
      </div>

      <div className="pt-1 pb-2">
        <h4 className="text-[11px] font-bold text-white mb-1">Entrada na PRÓXIMA vela (i+1)</h4>
        <p className="text-muted-foreground leading-relaxed">
          Quando o script retorna <code className="text-primary text-[10px]">{'return { action: "CALL", expiryCandles: 1 }'}</code>, a entrada <strong>não</strong> é na vela atual — é na <strong className="text-white">vela seguinte</strong> (i+1). Isto replica o comportamento de um robô real: a análise ocorre na vela <em>N</em>, e a ordem só pode ser executada na vela <em>N+1</em>.
        </p>
        <p className="text-muted-foreground leading-relaxed mt-1">
          A taxa de acerto é calculada automaticamente: para CALL, a entrada vence se a vela de entrada fechar acima da abertura; para PUT, se fechar abaixo.
        </p>
      </div>

      <div className="pt-1 pb-2">
        <h4 className="text-[11px] font-bold text-white mb-1">Formato onTick (igual às Estratégias)</h4>
        <p className="text-muted-foreground leading-relaxed">
          O script é executado <strong>vela a vela</strong> — a função <code className="text-primary text-[10px]">onTick(ctx)</code> é chamada para cada candle.
          <code className="text-primary text-[10px]">ctx.history</code> contém apenas as velas até a atual, pelo que o script <strong>não consegue ver o futuro</strong>.
        </p>
        <p className="text-muted-foreground leading-relaxed mt-1">
          Variáveis declaradas fora da <code className="text-primary text-[10px]">onTick</code> persistem entre velas. O retorno <code className="text-primary text-[10px]">{'return { action: "CALL" }'}</code> gera uma entrada na <strong>PRÓXIMA vela</strong> (i+1).
        </p>
      </div>

      <div className="pt-1 pb-2">
        <h4 className="text-[11px] font-bold text-white mb-1">Warm-up (análise inicial)</h4>
        <p className="text-muted-foreground leading-relaxed">
          As primeiras <strong>{WARM_UP} velas</strong> são de aquecimento: o script pode desenhar anotações e calcular indicadores, mas <strong>não pode gerar entradas</strong>. O motor bloqueia automaticamente o retorno de action durante esta fase.
        </p>
      </div>

      <div className="pt-1 pb-2">
        <h4 className="text-[11px] font-bold text-white mb-1">Modo Step</h4>
        <p className="text-muted-foreground leading-relaxed">
          Após executar o script, o modo <strong>Step</strong> é activado automaticamente para mostrar a progressão vela a vela. Podes pausar/continuar com o botão Play, ajustar o passo manualmente com o slider, ou voltar ao início com o botão de reset.
        </p>
      </div>

      <div className="pt-1 pb-2">
        <h4 className="text-[11px] font-bold text-white mb-1">Interface da página</h4>
        <p className="text-muted-foreground leading-relaxed">
          <strong>Barra superior:</strong> selector de ativo, timeframe (1m–1h), slider <strong>"Velas"</strong> (150–1500) para controlar quantas velas aparecem no gráfico. A taxa de acerto (wins/total) é exibida automaticamente após cada execução.
        </p>
        <p className="text-muted-foreground leading-relaxed mt-1">
          <strong>Painel direito:</strong> editor de script com botões <strong>Executar</strong> (corre o script), <strong>Criar Estratégia</strong> (converte para estratégia real), <strong>Step</strong> (replay vela-a-vela) e <strong>Limpar</strong> (remove anotações e logs).
        </p>
        <p className="text-muted-foreground leading-relaxed mt-1">
          <strong>Log / Documentação:</strong> separadores na parte inferior do painel direito. O Log mostra mensagens do <code className="text-primary text-[10px]">ctx.api.log()</code> e erros. A Documentação descreve toda a API disponível.
        </p>
      </div>

      <div className="pt-1 pb-2">
        <h4 className="text-[11px] font-bold text-white mb-1">Criar Estratégia</h4>
        <p className="text-muted-foreground leading-relaxed">
          Quando o backtest termina com sucesso e há pelo menos uma entrada, o botão <strong>Criar Estratégia</strong> fica disponível. As chamadas <code className="text-primary text-[10px]">ctx.api.*</code> (anotações visuais) são removidas automaticamente, e o código é convertido para o formato de Estratégia real.
        </p>
      </div>
    </div>
  );
}
