import { AppShell } from "@/components/AppShell";
import { type Strategy, type StrategyFilterDef, type StrategyFilterRange, type StrategyFilterValue } from "@/strategies";
import { Switch } from "@/components/ui/switch";
import { useStore } from "@/lib/store";
import { ASSETS } from "@/lib/market";
import { Bot, Terminal, Shield, Play, Plus, X, AlertTriangle, Trash2, MousePointer2, Pencil, Copy, ChevronDown, ChevronUp, Filter, SlidersHorizontal, ArrowLeftRight, Ban, Repeat2, Check, Cpu, ArrowUp, ArrowDown, Search, Star, Zap, Repeat } from "lucide-react";
import type { RobotConfig } from "@/lib/store";
import { toast } from "sonner";
import { useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import type { Trade } from "@/lib/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { loadStrategyById } from "@/lib/strategyLoader";


const parsedStrategies: any[] = [];


export default function Strategies() {
  const { activeStrategyId, setActiveStrategyId, resetTrades, tradingMode, setAutomationMode, strategyFilters, setStrategyFilter, clearStrategyFilters, strategyInvert, setStrategyInvert, strategyDirection, setStrategyDirection, strategySequenceConfig, setStrategySequenceConfig, addRobot, risk, marketType } = useStore();
  const store = useStore();
  const trades = (store as any).trades as Trade[] | undefined;
  const navigate = useNavigate();
  const location = useLocation();
  const [newCode, setNewCode] = useState("");

  // Helper: setStrategyFilter + propagate the new filters to any running robot that uses this strategy.
  // Without this, the server-side runtime.config.filters never gets updated and the filter has no effect on live trades.
  const applyStrategyFilter = (strategyId: string, filterKey: string, value: StrategyFilterValue) => {
    setStrategyFilter(strategyId, filterKey, value);
    // Compute the new full filters for this strategy after the update
    const nextFilters = {
      ...(strategyFilters[strategyId] || {}),
      [filterKey]: value,
    };
    const socket = (typeof window !== "undefined" ? (window as any).__socket : null);
    if (!socket) return;
    // Push to all running robots using this strategy
    (store.robots || [])
      .filter((r: any) => r.strategyId === strategyId && r.active)
      .forEach((r: any) => {
        socket.emit("update-robot-config", { id: r.id, updates: { filters: nextFilters } });
      });
  };
  const [newId, setNewId] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedFilters, setExpandedFilters] = useState<Record<string, boolean>>({});
  const [dynamicStrategies, setDynamicStrategies] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  const [favoriteStrategies, setFavoriteStrategies] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem("favoriteStrategies");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  const toggleFavorite = (id: string) => {
    setFavoriteStrategies(prev => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem("favoriteStrategies", JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    fetchStrategies();
  }, []);

  const fetchStrategies = async () => {
    try {
      const res = await fetch("/api/strategies");
      const data = await res.json();
      if (data.strategies) {
        setDynamicStrategies(data.strategies);
      }
    } catch (err) {
      console.error("Failed to fetch dynamic strategies:", err);
    }
  };

  // FIX: Prioritize dynamic strategies from server to reflect the actual filesystem state.
  const [allStrategies, setAllStrategies] = useState<(Strategy & { error?: boolean; fileName: string; isDynamic?: boolean; createdAt?: string | number })[]>([]);

  useEffect(() => {
    const syncStrategies = async () => {
      const merged = await Promise.all(dynamicStrategies.map(async ds => {
        // 1. Check if it's already in the bundle (pre-parsed)
        let stratMod = parsedStrategies.find(s => s.id === ds.id);
        
        // 2. If not in bundle, it's a dynamic strategy. Try to load its executable code.
        if (!stratMod || !stratMod.onTick) {
          try {
            // This fetches source from API, transpiles TS -> JS in browser, and returns the module
            const dynamicMod = await loadStrategyById(ds.id);
            if (dynamicMod) {
              stratMod = { ...dynamicMod, fileName: ds.fileName || ds.id } as any;
            }
          } catch (e) {
            console.error(`[Strategies] Failed to load executable code for dynamic strategy ${ds.id}`, e);
          }
        }

        return {
          ...ds,
          onTick: stratMod?.onTick,
          error: ds.error || (!stratMod?.onTick),
          isDynamic: true
        };
      }));

      // Also include bundled strategies that might not be on disk but are essential
      const extra: any[] = [];
      parsedStrategies.forEach(ps => {
        if (!merged.find(s => s.id === ps.id)) {
          const isEssential = ps.id === "example" || ps.id === "sr_semi_auto" || ps.id === "sr-semi-auto";
          if (isEssential) {
            extra.push({ ...ps, isDynamic: false });
          }
        }
      });

      setAllStrategies([...merged, ...extra]);
    };
    
    syncStrategies();
  }, [dynamicStrategies, parsedStrategies]);

  // Sort by createdAt descending (most recent first) and exclude forex strategies
  const sortedStrategies = [...allStrategies]
    .filter((s) => (s as any).market !== "forex")
    .sort((a, b) => {
      const timeA = typeof a.createdAt === 'string' ? new Date(a.createdAt).getTime() : (a.createdAt || 0);
      const timeB = typeof b.createdAt === 'string' ? new Date(b.createdAt).getTime() : (b.createdAt || 0);
      return timeB - timeA;
    });

  // Built-in filter definitions available to ALL strategies
  const BUILTIN_FILTERS: StrategyFilterDef[] = useMemo(() => {
    return [
    { key: "_asset", label: "Ativos Específicos", type: "multiselect", options: ASSETS.filter(a => marketType === "binary" ? a.type === "synthetic" : true).map(a => a.symbol) },
    { key: "_rsi", label: "Faixa RSI", type: "range", defaultMin: 0, defaultMax: 100, step: 5 },
    { key: "_adx", label: "Faixa ADX", type: "range", defaultMin: 0, defaultMax: 100, step: 5 },
    { key: "_macd", label: "MACD Histograma", type: "select", options: ["Bullish (Hist > 0)", "Bearish (Hist < 0)"] },
    { key: "_maTrend", label: "Tendência de Médias", type: "select", options: ["Strong Bullish", "Strong Bearish", "Bullish", "Bearish", "Ranging/Mixed"] },
    { key: "_pattern", label: "Padrão de Velas", type: "multiselect", options: ["Doji", "Hammer/HangingMan", "ShootingStar", "BullishEngulfing", "BearishEngulfing", "BullishHarami", "BearishHarami"] },
    { key: "_expiryCandles", label: "Expiração (candles)", type: "range", defaultMin: 1, defaultMax: 10, step: 1 },
    { key: "_sar", label: "Parabolic SAR (Tendência)", type: "select", options: ["SAR: Fortemente Altista (Preço > SAR > 1%)", "SAR: Altista (Preço > SAR)", "SAR: Baixista (Preço < SAR)", "SAR: Fortemente Baixista (Preço < SAR < -1%)"] },
    { key: "_williams", label: "Williams %R Bands", type: "select", options: ["Oversold (<= -80)", "Neutral (-80 a -20)", "Overbought (>= -20)"] },
    { key: "_atr", label: "Volatilidade ATR", type: "select", options: ["Low Vol (< 0.03%)", "Medium Vol (0.03% - 0.1%)", "High Vol (> 0.1%)"] },
    { key: "_fibLevel", label: "Proximidade Fibonacci", type: "multiselect", options: ["Fib R0.0", "Fib R23.6", "Fib R38.2", "Fib R50.0", "Fib R61.8", "Fib R100.0", "N/A"] },
    { key: "_pivotLevel", label: "Proximidade Níveis Pivot", type: "multiselect", options: (() => {
      // Dynamically discover real pivot level values from trade snapshots (like Stats page line 687)
      const seen = new Set<string>();
      (trades || []).forEach(t => {
        const v = (t.snapshot as any)?.pivotLevel;
        if (v !== undefined && v !== null) seen.add(String(v));
      });
      // Always include canonical levels, merge with discovered values, sorted
      const canonical = ["PP", "R1", "S1", "R2", "S2", "R3", "S3", "N/A"];
      const merged = Array.from(new Set([...canonical, ...Array.from(seen)]));
      return merged.sort((a, b) => {
        const order = ["PP", "R1", "R2", "R3", "S1", "S2", "S3", "N/A"];
        const ai = order.indexOf(a);
        const bi = order.indexOf(b);
        if (ai === -1 && bi === -1) return a.localeCompare(b);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
    })() },
    { key: "_marketMoment", label: "Momento de Mercado", type: "multiselect", options: ["Sem Padrão Clássico", "Forte Impulso de Alta (3+ Velas)", "Forte Impulso de Baixa (3+ Velas)", "Aceleração Explosiva Compradora", "Aceleração Explosiva Vendedora", "Consolidação Estreita / Ruído", "Lateralização Ordenada", "Fib R0.0 Bounce", "Fib R23.6 Bounce", "Fib R38.2 Bounce", "Fib R50.0 Bounce", "Fib R61.8 Bounce", "Fib R100.0 Bounce", "Rebate Pivot PP", "Rebate Pivot S1", "Rebate Pivot S2", "Rebate Pivot R1", "Rebate Pivot R2"] },
    { key: "_marketStructure", label: "Estrutura de Mercado", type: "select", options: ["Zig-Zag de Alta (HH+HL)", "Zig-Zag de Baixa (LH+LL)", "Alta Forte (HH+HL+ADX+EMA)", "Alta com ADX (HH+HL)", "Baixa Forte (LH+LL+ADX+EMA)", "Baixa com ADX (LH+LL)", "Alta (ADX+EMA)", "Baixa (ADX+EMA)", "Canal Lateral", "Expansão / Reversão", "Compressão / Triângulo", "Range Comprimido", "Lateral Baixa Volatilidade", "Oscilação", "Sem Estrutura Definida"] },
    { key: "_candleSize", label: "Tamanho de Candle", type: "select", options: ["Pequeno (<0.02%)", "Médio (0.02%-0.06%)", "Grande (>0.06%)"] },
    { key: "_pavioClass", label: "Classificação do Pavio", type: "select", options: [
      "pavio call", "pavio forte call", "pavio muito forte call",
      "pavio put", "pavio forte put", "pavio muito forte put",
      "pavio contra", "pavio forte contra", "pavio muito forte contra",
      "doji call", "doji forte call", "doji muito forte call",
      "doji put", "doji forte put", "doji muito forte put",
      "doji contra", "doji forte contra", "doji muito forte contra"
    ] },
    { key: "_preEntryMomentum", label: "Força Pré-Entrada", type: "select", options: ["Impulso Altista Forte", "Impulso Altista Moderado", "Impulso Baixista Forte", "Impulso Baixista Moderado", "Lateralização / Sem Força", "Misto / Correção"] },
    { key: "_bollingerState", label: "Estado de Bollinger", type: "select", options: ["Squeeze (Bandas Estreitas)", "Estouro / Expansão Volatilidade", "Neutro / Altas e Baixas Padrão"] },
    { key: "_indicatorCrossover", label: "Cruzamento de Médias", type: "select", options: ["Alinhamento de Alta (9 > 21)", "Alinhamento de Baixa (9 < 21)", "Cruzamento de Alta Recente (9x21)", "Cruzamento de Baixa Recente (9x21)"] },
  ];
  }, [marketType, trades]);

  /** Auto-generate filter definitions from customStatKeys — data sent to statistics also becomes filterable */
  const getAutoStatFilters = (strategy: Strategy & { error?: boolean }): StrategyFilterDef[] => {
    if (strategy.error || !strategy.customStatKeys) return [];
    const existingCustomKeys = new Set((strategy.customFilterKeys || []).map(f => f.key));
    const { trades } = useStore.getState();

    return strategy.customStatKeys
      .filter(sk => !existingCustomKeys.has(`_stat_${sk.key}`))
      .map(sk => {
        const rawKey = sk.key;
        // Sample data to determine type if hint not provided
        let isNumeric = sk.type === "number";
        if (sk.type === undefined) {
          const samples = trades.filter(t => t.strategyId === strategy.id && t.customStats && t.customStats[rawKey] !== undefined)
            .slice(0, 10)
            .map(t => t.customStats![rawKey]);
          isNumeric = samples.length > 0 && samples.every(s => typeof s === "number");
        }

        return {
          key: `_stat_${sk.key}`,
          label: `📊 ${sk.label}`,
          type: (isNumeric ? "range" : "multiselect") as "range" | "multiselect",
          options: [] as string[], // Will be filled by getStatFilterOptions if multiselect
          defaultMin: isNumeric ? 0 : undefined,
          defaultMax: isNumeric ? 100 : undefined,
          step: isNumeric ? 1 : undefined,
        };
      });
  };

  /** Collect unique values for auto-stat filters from existing backtest trades */
  const getStatFilterOptions = (strategyId: string, statKey: string): string[] => {
    const { trades } = useStore.getState();
    const values = new Set<string>();
    trades.filter(t => t.strategyId === strategyId && t.customStats)
      .forEach(t => {
        const rawKey = statKey.replace('_stat_', '');
        const val = t.customStats?.[rawKey];
        if (val !== undefined && val !== null) values.add(String(val));
      });
    return Array.from(values).sort();
  };

  const handleCreateRobot = (strategy: Strategy & { error?: boolean; fileName: string }) => {
    if (strategy.error) return;
    const currentFilters = strategyFilters[strategy.id] || {};
    const isInverted = strategyInvert[strategy.id] || false;
    const robotId = `robot_${strategy.id}_${Date.now()}`;

    // Extract assets from the strategy's _asset filter
    const assetFilter = currentFilters["_asset"];
    let robotAssets: string[] = [];
    if (assetFilter?.enabled) {
      const configs = assetFilter.optionConfigs || [];
      const globalAction = assetFilter.action || "allow"; // global default: allow other assets

      if (globalAction === "allow") {
        // Operates all assets, EXCEPT those explicitly ignored
        const ignoredAssets = new Set(configs.filter(c => c.action === "ignore").map(c => c.option));
        robotAssets = ASSETS.map(a => a.symbol).filter(sym => !ignoredAssets.has(sym));
      } else {
        // Operates ONLY those explicitly allowed
        robotAssets = configs.filter(c => c.action === "allow").map(c => c.option);
      }
    } else {
      // Default: use all available assets from ASSETS list
      robotAssets = ASSETS.map(a => a.symbol);
    }

    // Cleanup: Enforce that robots only operate on the 10 "R" synthetic assets (binary options only)
    robotAssets = robotAssets.filter(symbol => symbol.startsWith("R_"));
    if (robotAssets.length === 0) {
      robotAssets = ["R_100"];
    }

    const currentDirection = useStore.getState().strategyDirection[strategy.id] || "all";

    const newRobot: RobotConfig = {
      id: robotId,
      name: `${strategy.name} #${Math.floor(Math.random() * 900) + 100}`,
      strategyId: strategy.id,
      strategyFileName: strategy.fileName,
      filters: JSON.parse(JSON.stringify(currentFilters)),
      globalInvert: isInverted,
      strategyDirection: currentDirection,
      sequenceConfig: strategySequenceConfig[strategy.id],
      active: false,
      mode: "demo",
      timeframe: "1m",
      durationCandles: 1,
      assets: robotAssets,
      management: {
        active: true,
        stake: risk.defaultStake || 10,
        payout: risk.payout || 87,
        dailyGoal: 50,
        dailyStopLoss: 30,
        mode: "fixed",
        sorosMaxStake: 0,
        entryAfterWin: false,
        vdFilter: false,
      },
      managementState: {
        lastDemoResult: null,
        vdCycle: "",
        isPausedByVD: false,
        waitingForWins: 0,
        currentDailyPnl: 0,
        totalPnl: 0,
        lastResetDate: new Date().toISOString().split("T")[0],
      },
      trades: [],
      lastTradeResult: null,
      currentStake: risk.defaultStake || 10,
      warmupActive: false,
      createdAt: Date.now(),
    };
    addRobot(newRobot);
    toast.success(`Robô "${newRobot.name}" criado com ${robotAssets.length} ativo(s)! Vá à página de Robôs para configurar e ativar.`);
  };

  useEffect(() => {
    if (!isDialogOpen) {
      setNewCode("");
      setNewId("");
      setIsEditing(false);
      setEditingId(null);
    }
  }, [isDialogOpen]);

  useEffect(() => {
    const match = newCode.match(/id:\s*['"]([^'"]+)['"]/);
    if (match && match[1] && !newId && !isEditing) {
      setNewId(match[1]);
    }
  }, [newCode, newId, isEditing]);

  // Handle clone robot navigation state — pre-populate filters from an existing robot
  useEffect(() => {
    const cloneData = (location.state as any)?.cloneRobot;
    if (cloneData) {
      // Set active strategy
      setActiveStrategyId(cloneData.strategyId);
      setAutomationMode("auto");

      // Filter the strategy list — search by strategy ID
      setSearchTerm(cloneData.strategyId);

      // Expand filters panel so pre-populated filters are visible
      setExpandedFilters(prev => ({ ...prev, [cloneData.strategyId]: true }));

      // Pre-populate filters
      if (cloneData.filters) {
        Object.entries(cloneData.filters).forEach(([key, filter]) => {
          setStrategyFilter(cloneData.strategyId, key, filter as any);
        });
      }

      // Set global invert
      if (cloneData.globalInvert) {
        setStrategyInvert(cloneData.strategyId, true);
      }

      // Set direction
      if (cloneData.strategyDirection) {
        setStrategyDirection(cloneData.strategyId, cloneData.strategyDirection);
      }

      // Set sequence config
      if (cloneData.sequenceConfig) {
        setStrategySequenceConfig(cloneData.strategyId, cloneData.sequenceConfig);
      }

      // Clear location state so it doesn't re-trigger
      window.history.replaceState({}, document.title);

      toast.success(`Filtros do robô carregados! Pode ajustar e criar um novo robô.`);
    }
  }, [location.state]);

  const handleOpenEdit = async (id: string, copy = false) => {
    try {
      const res = await fetch(`/api/strategies/${id}`);
      if (res.ok) {
        const data = await res.json();
        setNewCode(data.code);
        if (copy) {
          setNewId(id + "_copy");
          setIsEditing(false);
          setEditingId(null);
        } else {
          setNewId(id);
          setIsEditing(true);
          setEditingId(id);
        }
        setIsDialogOpen(true);
      } else {
        toast.error("Estratégia padrão não pode ser editada via UI. Crie uma cópia.");
      }
    } catch (e) {
      toast.error("Erro ao carregar código.");
    }
  };

  const handleCopyToClipboard = async (id: string, code?: string) => {
    try {
      let textToCopy = code;
      if (!textToCopy) {
        const res = await fetch(`/api/strategies/${id}`);
        if (res.ok) {
          const data = await res.json();
          textToCopy = data.code;
        }
      }

      if (textToCopy) {
        await navigator.clipboard.writeText(textToCopy);
        toast.success("Código copiado para a área de transferência!");
      } else {
        toast.error("Não foi possível carregar o código para cópia.");
      }
    } catch (e) {
      toast.error("Erro ao copiar código.");
    }
  };

  const handleCreate = async () => {
    if (!newId || !newCode) {
      toast.error("Preencha o ID e o código.");
      return;
    }
    try {
      const res = await fetch("/api/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: newId, code: newCode })
      });
      if (res.ok) {
        toast.success("Estratégia salva com sucesso!");
        setIsDialogOpen(false);
        setNewCode("");
        setNewId("");
        fetchStrategies();
      } else {
        const err = await res.json();
        toast.error(err.error || "Erro ao salvar.");
      }
    } catch (e) {
      toast.error("Backend não configurado. Você está no ambiente estático?");
    }
  };

  const handleDelete = async (fileName: string, strategyId: string) => {
    console.log(`[Strategies] Attempting to delete: fileName=${fileName}, strategyId=${strategyId}`);
    if (!window.confirm("Tem certeza que deseja apagar esta estratégia?")) return;

    try {
      const res = await fetch(`/api/strategies/${fileName}`, { method: "DELETE" });
      console.log(`[Strategies] Delete response status: ${res.status}`);

      if (res.ok || res.status === 404) {
        if (res.ok) toast.success("Estratégia apagada com sucesso!");
        else toast.info("A estratégia já não existia no servidor.");

        if (activeStrategyId === strategyId) setActiveStrategyId(null);
        fetchStrategies();
      } else {
        const err = await res.json();
        console.error("[Strategies] Delete failed:", err);
        toast.error(err.error || "Erro ao apagar");
      }
    } catch (e: any) {
      console.error("[Strategies] Delete error:", e);
      toast.error(`Erro ao apagar: ${e.message || 'Erro de conexão'}`);
      fetchStrategies(); // Try to sync anyway
    }
  };

  const renderStrategyCard = (strategy: Strategy & { error?: boolean, fileName: string }) => {
    const isActive = activeStrategyId === strategy.id;
    const isSemiAuto = strategy.category === "semi-auto";

    if (strategy.error) {
      return (
        <div key={strategy.id} className="panel p-4 flex flex-col gap-3 transition-colors border border-destructive/70 bg-destructive/10 relative rounded-lg overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="font-bold text-base text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {strategy.name || strategy.id}
              <button
                onClick={(e) => { e.stopPropagation(); toggleFavorite(strategy.id); }}
                className={`shrink-0 transition-all duration-200 ${favoriteStrategies[strategy.id] ? "text-yellow-400 drop-shadow-[0_0_4px_rgba(250,204,21,0.4)]" : "text-muted-foreground/30 hover:text-muted-foreground/60"}`}
                title={favoriteStrategies[strategy.id] ? "Remover dos favoritos" : "Adicionar aos favoritos"}
              >
                <Star className="h-3.5 w-3.5" fill={favoriteStrategies[strategy.id] ? "currentColor" : "none"} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleOpenEdit(strategy.fileName, false)}
                className="text-[10px] bg-muted-foreground/10 text-muted-foreground p-1.5 rounded transition-colors hover:bg-white hover:text-black"
                title="Editar Script para Corrigir Erros"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={() => handleDelete(strategy.fileName, strategy.id!)}
                className="text-[10px] bg-destructive/10 text-destructive p-1.5 rounded transition-colors hover:bg-destructive hover:text-white"
                title="Apagar"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
          <div className="bg-black/20 p-2 rounded border border-destructive/30">
            <p className="text-[11px] font-mono text-destructive leading-tight whitespace-pre-wrap break-all">
              {strategy.description || "Erro desconhecido ao carregar o script."}
            </p>
          </div>
          <div className="flex items-center justify-between text-[10px] text-destructive/60 mt-auto pt-2 border-t border-destructive/20">
            <span>ID: <code className="bg-destructive/10 px-1 rounded">{strategy.id}</code></span>
            <span className="flex items-center gap-1 font-bold uppercase italic">Status: Falha no Script</span>
          </div>
        </div>
      );
    }

    const isInverted = strategyInvert[strategy.id] || false;
    const currentDir = strategyDirection[strategy.id] || "all";

    return (
      <div
        key={strategy.id}
        className={`panel p-4 flex flex-col gap-3 transition-colors overflow-hidden ${isActive ? 'border-primary shadow-[0_0_15px_rgba(34,197,94,0.1)]' : ''} ${isInverted ? 'ring-1 ring-amber-500/30' : ''}`}
      >
        <div className="flex items-center justify-between">
          <div className="font-bold text-base text-white flex items-center gap-2 min-w-0 max-w-[45%]">
            <button
              onClick={(e) => { e.stopPropagation(); toggleFavorite(strategy.id); }}
              className={`shrink-0 transition-all duration-200 ${favoriteStrategies[strategy.id] ? "text-yellow-400 drop-shadow-[0_0_4px_rgba(250,204,21,0.4)]" : "text-muted-foreground/30 hover:text-muted-foreground/60"}`}
              title={favoriteStrategies[strategy.id] ? "Remover dos favoritos" : "Adicionar aos favoritos"}
            >
              <Star className="h-4 w-4" fill={favoriteStrategies[strategy.id] ? "currentColor" : "none"} />
            </button>
            <div className="flex flex-col min-w-0">
              <span className="truncate">{strategy.name}</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal">
                {isSemiAuto ? "Semi-Automático" : "100% Automático"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end min-w-0 max-w-[55%]">
            {/* Direction Selector Button Group */}
            <div className="flex bg-background border border-border/50 rounded overflow-hidden shrink-0">
              <button
                onClick={() => setStrategyDirection(strategy.id, "all")}
                className={`px-2 py-1 text-[9px] font-bold transition-all duration-150 ${currentDir === "all" ? "bg-primary text-black" : "text-muted-foreground hover:text-white"}`}
                title="Todos os Sinais"
              >
                Todos
              </button>
              <button
                onClick={() => setStrategyDirection(strategy.id, "buy")}
                className={`px-2 py-1 text-[9px] font-bold transition-all duration-150 ${currentDir === "buy" ? "bg-emerald-500/20 text-emerald-400 border-x border-border/20" : "text-muted-foreground hover:text-white border-x border-border/20"}`}
                title="Apenas Compras (CALL / BUY)"
              >
                Compra
              </button>
              <button
                onClick={() => setStrategyDirection(strategy.id, "sell")}
                className={`px-2 py-1 text-[9px] font-bold transition-all duration-150 ${currentDir === "sell" ? "bg-rose-500/20 text-rose-400" : "text-muted-foreground hover:text-white"}`}
                title="Apenas Vendas (PUT / SELL)"
              >
                Venda
              </button>
            </div>

            {/* Global Invert Toggle */}
            <button
              onClick={() => setStrategyInvert(strategy.id, !isInverted)}
              className={`p-1.5 rounded border transition-all duration-200 ${isInverted
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.15)]'
                  : 'bg-background border-border/50 text-muted-foreground hover:text-white hover:border-amber-500/30'
                }`}
              title={isInverted ? "Sinais INVERTIDOS — clique para desativar" : "Clique para INVERTER todos os sinais"}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
            </button>
            <Switch
              checked={isActive}
              onCheckedChange={(v) => {
                if (v) {
                  resetTrades("backtest");
                  setActiveStrategyId(strategy.id);
                  setAutomationMode(isSemiAuto ? "semi-auto" : "auto");
                  toast.success(`Estratégia "${strategy.name}" ativada. Histórico de backtest limpo.`);
                } else {
                  setActiveStrategyId(null);
                  setAutomationMode("manual");
                  toast.warning(`Estratégia "${strategy.name}" desativada.`);
                }
              }}
            />
          </div>
        </div>

        {isInverted && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-[9px] text-amber-400">
            <ArrowLeftRight className="h-3 w-3" />
            <span className="font-bold uppercase">Inversão Global Ativa</span>
            <span className="text-amber-400/60">— Todos os sinais serão invertidos</span>
          </div>
        )}

        {currentDir !== "all" && (
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-[9px] ${currentDir === "buy" ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" : "bg-rose-500/10 border border-rose-500/20 text-rose-400"}`}>
            {currentDir === "buy" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            <span className="font-bold uppercase">Apenas {currentDir === "buy" ? "Compras" : "Vendas"} Ativo</span>
            <span className="opacity-60">— Sinais do lado oposto serão descartados</span>
          </div>
        )}

        <p className="text-xs text-muted-foreground line-clamp-2">
          {strategy.description}
        </p>

        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
          <div className="flex items-center gap-2">
            <span className="opacity-70">ID:</span>
            <code className="text-primary bg-primary/10 px-1 rounded font-mono">{strategy.id}</code>
          </div>
          {(strategy as any).createdAt && (
            <div className="flex items-center gap-1.5 opacity-60 bg-muted/30 px-2 py-0.5 rounded-full border border-border/30">
              <Terminal className="h-2.5 w-2.5" />
              <span>Criado em {new Date((strategy as any).createdAt || Date.now()).toLocaleDateString('pt-BR')}</span>
            </div>
          )}
        </div>

        <div className="flex-1"></div>

        {/* Expandable Filters Panel */}
        <div className="border-t border-border/50 mt-2">
          <button
            onClick={() => setExpandedFilters(prev => ({ ...prev, [strategy.id]: !prev[strategy.id] }))}
            className="w-full flex items-center justify-between py-2 text-[10px] text-muted-foreground hover:text-white transition-colors"
          >
            <span className="flex items-center gap-1.5 font-bold uppercase">
              <SlidersHorizontal className="h-3 w-3" />
              Filtros
              {Object.keys(strategyFilters[strategy.id] || {}).filter(k => strategyFilters[strategy.id]?.[k]?.enabled).length > 0 && (
                <span className="bg-primary/20 text-primary px-1.5 rounded-full text-[9px]">
                  {Object.keys(strategyFilters[strategy.id] || {}).filter(k => strategyFilters[strategy.id]?.[k]?.enabled).length}
                </span>
              )}
            </span>
            {expandedFilters[strategy.id] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          {expandedFilters[strategy.id] && (
            <div className="pb-3 space-y-2">
              {/* Combine built-in + custom + auto-stat filters */}
              {[...BUILTIN_FILTERS, ...(strategy.customFilterKeys || []), ...getAutoStatFilters(strategy)].map(fd => {
                // For auto-stat filters, dynamically inject collected options
                const finalFd = fd.key.startsWith('_stat_') && fd.options?.length === 0
                  ? { ...fd, options: getStatFilterOptions(strategy.id, fd.key) }
                  : fd;
                const filterVal = strategyFilters[strategy.id]?.[finalFd.key];
                const enabled = filterVal?.enabled || false;
                const filterAction = filterVal?.action || "allow";
                const ranges = filterVal?.ranges || [];

                const addRange = () => {
                  const newRange: StrategyFilterRange = {
                    id: crypto.randomUUID(),
                    min: finalFd.defaultMin ?? 0,
                    max: finalFd.defaultMax ?? 100,
                    action: "allow",
                  };
                  applyStrategyFilter(strategy.id, finalFd.key, {
                    ...filterVal,
                    enabled: true,
                    ranges: [...ranges, newRange],
                  });
                };

                const updateRange = (rangeId: string, updates: Partial<StrategyFilterRange>) => {
                  applyStrategyFilter(strategy.id, finalFd.key, {
                    ...filterVal!,
                    ranges: ranges.map(r => r.id === rangeId ? { ...r, ...updates } : r),
                  });
                };

                const removeRange = (rangeId: string) => {
                  applyStrategyFilter(strategy.id, finalFd.key, {
                    ...filterVal!,
                    ranges: ranges.filter(r => r.id !== rangeId),
                  });
                };

                const cycleAction = (current: "allow" | "ignore" | "invert") => {
                  const order: ("allow" | "ignore" | "invert")[] = ["allow", "ignore", "invert"];
                  const idx = order.indexOf(current);
                  return order[(idx + 1) % order.length];
                };

                const cycleOptionAction = (current: "allow" | "ignore" | "invert" | "invertBuy" | "invertSell") => {
                  const order: ("allow" | "ignore" | "invert" | "invertBuy" | "invertSell")[] = ["allow", "ignore", "invert", "invertBuy", "invertSell"];
                  const idx = order.indexOf(current);
                  return order[(idx + 1) % order.length];
                };

                const actionIcon = (action: "allow" | "ignore" | "invert" | "invertBuy" | "invertSell") => {
                  if (action === "ignore") return <Ban className="h-3 w-3" />;
                  if (action === "invert") return <ArrowLeftRight className="h-3 w-3" />;
                  if (action === "invertBuy") return <ArrowUp className="h-3 w-3" />;
                  if (action === "invertSell") return <ArrowDown className="h-3 w-3" />;
                  return <Check className="h-3 w-3" />;
                };

                const actionColor = (action: "allow" | "ignore" | "invert" | "invertBuy" | "invertSell") => {
                  if (action === "ignore") return "bg-red-500/20 border-red-500/50 text-red-400";
                  if (action === "invert") return "bg-amber-500/20 border-amber-500/50 text-amber-400";
                  if (action === "invertBuy") return "bg-emerald-500/30 border-emerald-500/60 text-emerald-300";
                  if (action === "invertSell") return "bg-rose-500/30 border-rose-500/60 text-rose-300";
                  return "bg-emerald-500/20 border-emerald-500/50 text-emerald-400";
                };

                const actionLabel = (action: "allow" | "ignore" | "invert" | "invertBuy" | "invertSell") => {
                  if (action === "ignore") return "Ignorar";
                  if (action === "invert") return "Inverter";
                  if (action === "invertBuy") return "Inv. ↑";
                  if (action === "invertSell") return "Inv. ↓";
                  return "Operar";
                };

                const filterDirection = filterVal?.direction || "all";

                return (
                  <div key={finalFd.key} className={`rounded border p-2 transition-colors ${enabled ? "border-primary/50 bg-primary/5" : "border-border/30 bg-[#131722]"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">{finalFd.label}</label>
                      <div className="flex items-center gap-1.5">
                        {/* Filter Direction Selector Toggle Buttons */}
                        {enabled && (
                          <div className="flex bg-background border border-border/50 rounded overflow-hidden h-5.5 items-center shrink-0 text-[8px] font-bold">
                            <button
                              onClick={() => applyStrategyFilter(strategy.id, finalFd.key, { ...filterVal!, direction: "all" })}
                              className={`px-1.5 h-full transition-all duration-150 ${filterDirection === "all" ? "bg-primary text-black" : "text-muted-foreground hover:text-white"}`}
                              title="Ambas as direções permitidas"
                            >
                              Todos
                            </button>
                            <button
                              onClick={() => applyStrategyFilter(strategy.id, finalFd.key, { ...filterVal!, direction: "buy" })}
                              className={`px-1.5 h-full transition-all border-x border-border/20 duration-150 ${filterDirection === "buy" ? "bg-emerald-500/20 text-emerald-400" : "text-muted-foreground hover:text-white"}`}
                              title="Apenas ordens de COMPRA"
                            >
                              Comp
                            </button>
                            <button
                              onClick={() => applyStrategyFilter(strategy.id, finalFd.key, { ...filterVal!, direction: "sell" })}
                              className={`px-1.5 h-full transition-all duration-150 ${filterDirection === "sell" ? "bg-rose-500/20 text-rose-400" : "text-muted-foreground hover:text-white"}`}
                              title="Apenas ordens de VENDA"
                            >
                              Vend
                            </button>
                          </div>
                        )}

                        {/* Per-filter invert toggle (for select/multiselect types) */}
                        {enabled && (finalFd.type === "select" || finalFd.type === "multiselect") && (
                          <button
                            onClick={() => {
                              const nextAction = cycleAction(filterAction);
                              applyStrategyFilter(strategy.id, finalFd.key, { ...filterVal!, action: nextAction });
                            }}
                            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[8px] font-bold uppercase transition-all ${actionColor(filterAction)}`}
                            title={`Ação: ${actionLabel(filterAction)} — clique para alternar`}
                          >
                            {actionIcon(filterAction)}
                            {actionLabel(filterAction)}
                          </button>
                        )}
                        <Switch
                          checked={enabled}
                          onCheckedChange={(v) => {
                            applyStrategyFilter(strategy.id, finalFd.key, {
                              ...filterVal,
                              enabled: v,
                              ranges: filterVal?.ranges || (finalFd.type === "range" ? [{
                                id: crypto.randomUUID(),
                                min: finalFd.defaultMin ?? 0,
                                max: finalFd.defaultMax ?? 100,
                                action: "allow" as const,
                                direction: "all" as const,
                              }] : []),
                            });
                          }}
                        />
                      </div>
                    </div>

                    {/* RANGE type — supports multiple ranges */}
                    {enabled && finalFd.type === "range" && (
                      <div className="space-y-1.5 mt-1">
                        {ranges.map((range, idx) => (
                          <div key={range.id} className={`flex items-center gap-1.5 p-1.5 rounded border transition-all ${actionColor(range.action).replace(/\/20/g, '/10').replace(/\/50/g, '/20')}`}>
                            {/* Action toggle button */}
                            <button
                              onClick={() => updateRange(range.id, { action: cycleAction(range.action) })}
                              className={`flex items-center gap-0.5 px-1 py-0.5 rounded border text-[8px] font-bold uppercase transition-all shrink-0 ${actionColor(range.action)}`}
                              title={`${actionLabel(range.action)} — clique para alternar`}
                            >
                              {actionIcon(range.action)}
                              <span className="hidden sm:inline">{actionLabel(range.action)}</span>
                            </button>
                            {/* Min input */}
                            <input
                              type="number"
                              step={finalFd.step || 1}
                              value={range.min}
                              onChange={(e) => updateRange(range.id, { min: Number(e.target.value) })}
                              className="w-14 bg-background border rounded px-1 py-0.5 text-[10px] text-center shrink-0"
                            />
                            <span className="text-[8px] text-muted-foreground shrink-0">até</span>
                            {/* Max input */}
                            <input
                              type="number"
                              step={finalFd.step || 1}
                              value={range.max}
                              onChange={(e) => updateRange(range.id, { max: Number(e.target.value) })}
                              className="w-14 bg-background border rounded px-1 py-0.5 text-[10px] text-center shrink-0"
                            />
                            {/* Range Direction Selector Switch */}
                            <button
                              type="button"
                              onClick={() => {
                                const nextDirMap = { all: "buy", buy: "sell", sell: "all" } as const;
                                const nextDir = nextDirMap[range.direction || "all"];
                                updateRange(range.id, { direction: nextDir });
                              }}
                              className={`flex items-center gap-0.5 px-1 py-0.5 rounded border text-[8px] font-bold uppercase transition-all shrink-0 ${
                                !range.direction || range.direction === "all"
                                  ? "bg-secondary text-muted-foreground border-border/30 hover:text-white"
                                  : range.direction === "buy"
                                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                                  : "bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20"
                              }`}
                              title={`Direção: ${
                                !range.direction || range.direction === "all"
                                  ? "Compra/Venda"
                                  : range.direction === "buy"
                                  ? "Compra"
                                  : "Venda"
                              } — clique para alternar`}
                            >
                              {!range.direction || range.direction === "all" ? (
                                <ArrowLeftRight className="h-2 w-2" />
                              ) : range.direction === "buy" ? (
                                <ArrowUp className="h-2 w-2 animate-bounce" />
                              ) : (
                                <ArrowDown className="h-2 w-2 animate-bounce" />
                              )}
                              <span>
                                {!range.direction || range.direction === "all"
                                  ? "Ambos"
                                  : range.direction === "buy"
                                  ? "Compra"
                                  : "Venda"}
                              </span>
                            </button>
                            {/* Remove range button */}
                            {ranges.length > 1 && (
                              <button
                                onClick={() => removeRange(range.id)}
                                className="p-0.5 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0 m-l-auto"
                                title="Remover faixa"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        ))}
                        {/* Add range button */}
                        <button
                          onClick={addRange}
                          className="w-full flex items-center justify-center gap-1 py-1 rounded border border-dashed border-border/50 text-[9px] text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
                        >
                          <Plus className="h-3 w-3" />
                          Adicionar Faixa
                        </button>
                      </div>
                    )}

                    {enabled && finalFd.type === "multiselect" && finalFd.options && (
                      <div className="space-y-1 mt-1">
                        {finalFd.options.map(opt => {
                          const optCfg = (filterVal?.optionConfigs || []).find(oc => oc.option === opt);
                          const isConfigured = !!optCfg;
                          return (
                            <div key={opt} className={`flex items-center gap-1 p-1 rounded border transition-all ${isConfigured ? "border-border/40 bg-black/30" : "border-transparent"}`}>
                              {/* Option label — click to toggle config on/off */}
                              <button
                                onClick={() => {
                                  const configs = filterVal?.optionConfigs || [];
                                  const newConfigs = optCfg
                                    ? configs.filter(c => c.option !== opt)
                                    : [...configs, { option: opt, action: "allow" as const, direction: "all" as const }];
                                  const newValues = newConfigs
                                    .filter(c => c.action === "allow" || c.action === "invert" || !c.action)
                                    .map(c => c.option);
                                  applyStrategyFilter(strategy.id, finalFd.key, {
                                    ...filterVal!,
                                    enabled: true,
                                    action: filterVal?.action || "allow",
                                    optionConfigs: newConfigs,
                                    values: newValues,
                                  });
                                }}
                                className={`text-[9px] px-1.5 py-0.5 rounded border font-bold transition-colors shrink-0 ${isConfigured ? "bg-primary/20 text-primary border-primary/50" : "bg-background border-border/50 text-muted-foreground hover:text-white hover:border-border"}`}
                              >
                                {opt}
                              </button>

                              {isConfigured && (
                                <>
                                  {/* Per-option Action toggle (Operar/Ignorar/Inverter) */}
                                  <button
                                    onClick={() => {
                                      const nextAction = cycleOptionAction(optCfg.action);
                                      const newConfigs = (filterVal?.optionConfigs || []).map(oc => oc.option === opt ? { ...oc, action: nextAction } : oc);
                                      const newValues = newConfigs
                                        .filter(c => c.action === "allow" || c.action === "invert" || !c.action)
                                        .map(c => c.option);
                                      applyStrategyFilter(strategy.id, finalFd.key, {
                                        ...filterVal!,
                                        optionConfigs: newConfigs,
                                        values: newValues,
                                      });
                                    }}
                                    className={`flex items-center gap-0.5 px-1 py-0.5 rounded border text-[8px] font-bold uppercase transition-all ${actionColor(optCfg.action)}`}
                                    title={actionLabel(optCfg.action)}
                                  >
                                    {actionIcon(optCfg.action)}
                                    <span className="hidden sm:inline">{actionLabel(optCfg.action)}</span>
                                  </button>

                                  {/* Per-option Direction toggle (Todos/Compra/Venda) */}
                                  <button
                                    onClick={() => {
                                      const nextDirMap: Record<string, "all" | "buy" | "sell"> = { all: "buy", buy: "sell", sell: "all" };
                                      const nextDir = nextDirMap[optCfg.direction || "all"];
                                      const newConfigs = (filterVal?.optionConfigs || []).map(oc => oc.option === opt ? { ...oc, direction: nextDir } : oc);
                                      const newValues = newConfigs
                                        .filter(c => c.action === "allow" || c.action === "invert" || !c.action)
                                        .map(c => c.option);
                                      applyStrategyFilter(strategy.id, finalFd.key, {
                                        ...filterVal!,
                                        optionConfigs: newConfigs,
                                        values: newValues,
                                      });
                                    }}
                                    className={`flex items-center gap-0.5 px-1 py-0.5 rounded border text-[8px] font-bold uppercase transition-all shrink-0 ${
                                      !optCfg.direction || optCfg.direction === "all"
                                        ? "bg-secondary text-muted-foreground border-border/30 hover:text-white"
                                        : optCfg.direction === "buy"
                                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                                        : "bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20"
                                    }`}
                                  >
                                    {!optCfg.direction || optCfg.direction === "all" ? (
                                      <ArrowLeftRight className="h-2 w-2" />
                                    ) : optCfg.direction === "buy" ? (
                                      <ArrowUp className="h-2 w-2" />
                                    ) : (
                                      <ArrowDown className="h-2 w-2" />
                                    )}
                                    <span>
                                      {!optCfg.direction || optCfg.direction === "all" ? "Ambos" : optCfg.direction === "buy" ? "Compra" : "Venda"}
                                    </span>
                                  </button>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {Object.keys(strategyFilters[strategy.id] || {}).some(k => strategyFilters[strategy.id]?.[k]?.enabled) && (
                <button
                  onClick={() => clearStrategyFilters(strategy.id)}
                  className="text-[9px] text-destructive hover:underline"
                >
                  Limpar todos os filtros
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Sequential Entry Config ─────────────────────────────────── */}
        <div className="border-t border-border/50 pt-2 pb-1">
          <div className="flex items-center justify-between px-1 mb-1">
            <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
              <span>Sequência</span>
            </span>
            <div className="flex items-center gap-2">
              {strategySequenceConfig[strategy.id]?.enabled && (
                <input
                  type="number"
                  min={1}
                  max={5}
                  step={1}
                  value={strategySequenceConfig[strategy.id]?.maxEntradas ?? 1}
                  onChange={(e) => {
                    const val = Math.min(5, Math.max(1, parseInt(e.target.value) || 1));
                    setStrategySequenceConfig(strategy.id, {
                      enabled: true,
                      maxEntradas: val,
                    });
                  }}
                  className="w-12 h-6 text-[10px] text-center bg-background border border-border/50 rounded [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              )}
              <Switch
                checked={strategySequenceConfig[strategy.id]?.enabled ?? false}
                onCheckedChange={(v) =>
                  setStrategySequenceConfig(strategy.id, {
                    enabled: v,
                    maxEntradas: v ? (strategySequenceConfig[strategy.id]?.maxEntradas || 3) : 1,
                  })
                }
              />
            </div>
          </div>

          {/* ── Advanced sequence options (per-level modes + ignore main signal + invert) ─────── */}
          {strategySequenceConfig[strategy.id]?.enabled && (
            <div className="flex flex-col gap-2 px-1 pb-1 border-b border-border/30">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-bold pt-1 flex items-center justify-between">
                <span>Sequência: Níveis a Operar</span>
                <span className="text-[8px] text-muted-foreground/60 font-normal">Clica nos botões p/ alternar modo</span>
              </div>

              {/* Multi-mode step buttons #1..maxEntradas */}
              <div className="flex gap-1.5 flex-wrap">
                {Array.from({ length: strategySequenceConfig[strategy.id]?.maxEntradas ?? 3 }, (_, idx) => idx + 1).map((n) => {
                  const cfg = strategySequenceConfig[strategy.id] || { enabled: true, maxEntradas: 3 };
                  const currentModes = cfg.levelModes || {};
                  const mode = currentModes[n] || "normal";

                  const MODE_SEQUENCE: ("normal" | "skip" | "invert" | "invert_sell" | "invert_buy" | "only_sell" | "only_buy")[] = [
                    "normal", "skip", "invert", "invert_sell", "invert_buy", "only_sell", "only_buy"
                  ];

                  const handleNextMode = () => {
                    const nextIdx = (MODE_SEQUENCE.indexOf(mode) + 1) % MODE_SEQUENCE.length;
                    const nextMode = MODE_SEQUENCE[nextIdx];
                    const newModes = { ...currentModes, [n]: nextMode };

                    setStrategySequenceConfig(strategy.id, {
                      ...cfg,
                      levelModes: newModes,
                    });
                  };

                  const modeInfo: Record<string, { label: string; badge: string; colorClass: string; title: string }> = {
                    normal: {
                      label: `#${n}`,
                      badge: "Normal",
                      colorClass: "bg-background border-border/50 text-muted-foreground hover:text-white",
                      title: "Operar normalmente (sem filtro)",
                    },
                    skip: {
                      label: `#${n}`,
                      badge: "🚫 Ignorar",
                      colorClass: "bg-amber-500/15 border-amber-500/50 text-amber-400 font-bold shadow-[0_0_8px_rgba(245,158,11,0.15)]",
                      title: "Ignorar: pula esta etapa da sequência",
                    },
                    invert: {
                      label: `#${n}`,
                      badge: "↺ Inverter",
                      colorClass: "bg-purple-500/15 border-purple-500/50 text-purple-400 font-bold shadow-[0_0_8px_rgba(168,85,247,0.15)]",
                      title: "Inverte o sinal (CALL ↔ PUT) nesta etapa",
                    },
                    invert_sell: {
                      label: `#${n}`,
                      badge: "↺V Inv. Venda",
                      colorClass: "bg-pink-500/15 border-pink-500/50 text-pink-400 font-bold shadow-[0_0_8px_rgba(236,72,153,0.15)]",
                      title: "Inverte apenas ordens de Venda (PUT → CALL)",
                    },
                    invert_buy: {
                      label: `#${n}`,
                      badge: "↺C Inv. Compra",
                      colorClass: "bg-cyan-500/15 border-cyan-500/50 text-cyan-400 font-bold shadow-[0_0_8px_rgba(6,182,212,0.15)]",
                      title: "Inverte apenas ordens de Compra (CALL → PUT)",
                    },
                    only_sell: {
                      label: `#${n}`,
                      badge: "↓V Só Venda",
                      colorClass: "bg-red-500/15 border-red-500/50 text-red-400 font-bold shadow-[0_0_8px_rgba(239,68,68,0.15)]",
                      title: "Opera apenas Venda; ignora se for Compra",
                    },
                    only_buy: {
                      label: `#${n}`,
                      badge: "↑C Só Compra",
                      colorClass: "bg-emerald-500/15 border-emerald-500/50 text-emerald-400 font-bold shadow-[0_0_8px_rgba(16,185,129,0.15)]",
                      title: "Opera apenas Compra; ignora se for Venda",
                    },
                  };

                  const info = modeInfo[mode] || modeInfo.normal;

                  return (
                    <button
                      key={n}
                      onClick={handleNextMode}
                      className={`flex-1 min-w-[62px] py-1 px-1.5 rounded border text-[10px] flex flex-col items-center justify-center transition-all duration-150 cursor-pointer ${info.colorClass}`}
                      title={`${info.title} (Clica para alternar)`}
                    >
                      <span className="font-bold">{info.label}</span>
                      <span className="text-[8px] opacity-90 truncate max-w-full">{info.badge}</span>
                    </button>
                  );
                })}
              </div>

              {/* Controls Row: Ignore Main Signal toggle + Sequence Invert toggle */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => {
                    const cfg = strategySequenceConfig[strategy.id] || { enabled: true, maxEntradas: 3 };
                    setStrategySequenceConfig(strategy.id, {
                      ...cfg,
                      ignoreMainSignal: !cfg.ignoreMainSignal,
                    });
                  }}
                  className={`flex-1 py-1.5 px-2 rounded border text-[10px] font-semibold flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer ${
                    strategySequenceConfig[strategy.id]?.ignoreMainSignal
                      ? "bg-violet-500/20 border-violet-500/50 text-violet-300 shadow-[0_0_8px_rgba(139,92,246,0.2)]"
                      : "bg-background border-border/50 text-muted-foreground hover:text-white hover:border-violet-500/30"
                  }`}
                  title="Se ativo, a operação principal (sinal original da estratégia) NÃO é executada na corretora. Apenas a sequência de entradas será operada."
                >
                  <Ban className="h-3 w-3" />
                  <span className="truncate">
                    {strategySequenceConfig[strategy.id]?.ignoreMainSignal ? "Ignorar Operação Principal (Ativo)" : "Ignorar Operação Principal"}
                  </span>
                </button>

                <button
                  onClick={() => {
                    const cfg = strategySequenceConfig[strategy.id] || { enabled: true, maxEntradas: 3 };
                    setStrategySequenceConfig(strategy.id, {
                      ...cfg,
                      sequenceInvert: !cfg.sequenceInvert,
                    });
                  }}
                  className={`py-1.5 px-2 rounded border text-[10px] font-semibold flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer shrink-0 ${
                    strategySequenceConfig[strategy.id]?.sequenceInvert
                      ? "bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.2)]"
                      : "bg-background border-border/50 text-muted-foreground hover:text-white hover:border-amber-500/30"
                  }`}
                  title="Inverte o sinal em todas as entradas executadas da sequência."
                >
                  <Repeat className="h-3 w-3" />
                  <span>Inverter Todas</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="pt-2 border-t border-border/50 flex justify-between items-center mt-auto">
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <Terminal className="h-3 w-3" />
            Pronto
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end min-w-0">
            <button
              onClick={() => handleCreateRobot(strategy)}
              className="text-[10px] bg-cyan-500/10 text-cyan-400 px-2 py-1 rounded flex items-center gap-1 hover:bg-cyan-500 hover:text-white transition-colors border border-cyan-500/30 shrink-0"
              title="Criar Robô de Produção"
            >
              <Cpu className="h-3 w-3" /> <span className="hidden sm:inline">Criar </span>Robô
            </button>
            <button
              onClick={() => handleOpenEdit(strategy.fileName, false)}
              className="text-[10px] bg-muted-foreground/10 text-muted-foreground p-1.5 rounded transition-colors hover:bg-white hover:text-black"
              title="Editar Script"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              onClick={() => handleCopyToClipboard(strategy.fileName)}
              className="text-[10px] bg-muted-foreground/10 text-muted-foreground p-1.5 rounded transition-colors hover:bg-white hover:text-black"
              title="Copiar Código"
            >
              <Copy className="h-3 w-3" />
            </button>
            <button
              onClick={() => handleOpenEdit(strategy.fileName, true)}
              className="text-[10px] bg-muted-foreground/10 text-muted-foreground p-1.5 rounded transition-colors hover:bg-white hover:text-black"
              title="Duplicar Script"
            >
              <Repeat2 className="h-3 w-3" />
            </button>
            <button
              onClick={() => handleDelete(strategy.fileName, strategy.id!)}
              className="text-[10px] bg-destructive/10 text-destructive p-1.5 rounded transition-colors hover:bg-destructive hover:text-white"
              title="Apagar"
            >
              <Trash2 className="h-3 w-3" />
            </button>
            {isActive && (
              <button
                onClick={() => navigate("/trading")}
                className="text-[10px] bg-primary/20 text-primary px-1.5 py-1 rounded flex items-center gap-1 hover:bg-primary hover:text-primary-foreground transition-colors shrink-0"
              >
                <Play className="h-3 w-3" /> <span className="hidden sm:inline">Trading</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const searchedStrategies = sortedStrategies.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.description || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const autoStrategies = searchedStrategies.filter(s => s.category !== "semi-auto" && !s.error);
  const semiAutoStrategies = searchedStrategies.filter(s => s.category === "semi-auto" && !s.error);
  const errorStrategies = searchedStrategies.filter(s => s.error);
  const favStrategies = searchedStrategies.filter(s => !s.error && favoriteStrategies[s.id]);

  return (
    <AppShell>
      <div className="p-4 max-w-5xl mx-auto">
        <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div className="w-full md:w-auto">
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Bot className="h-6 w-6 text-primary" />
              Estratégias de Trading
            </h1>
            <p className="text-muted-foreground text-sm mt-1 mb-4">
              Ativa robôs 100% automáticos ou ferramentas de auxílio semi-automático.
            </p>
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por estratégia..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-10"
              />
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={fetchStrategies} className="gap-2 h-10 px-3">
              <Repeat2 className="h-4 w-4" /> Atualizar
            </Button>
            <Button variant="outline" onClick={() => setIsDocsOpen(true)} className="gap-2"><Shield className="h-4 w-4" /> Documentação</Button>
            <Button onClick={() => setIsDialogOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Novo Script</Button>
          </div>

          {/* Documentation Dialog */}
          <Dialog open={isDocsOpen} onOpenChange={setIsDocsOpen}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto border-border/50">
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <DialogTitle className="flex items-center gap-2"><Shield className="h-5 w-5 text-primary" /> Documentação — Como Criar Estratégias</DialogTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-2 text-xs"
                    onClick={() => handleCopyToClipboard("", `import { Strategy, StrategyContext, StrategyResult } from "./index";
import { rsi, sma, ema, adx, macd } from "@/lib/market";

const MinhaEstrategia: Strategy = {
  id: "minha_estrategia",        // ID único (será o nome do arquivo)
  name: "Minha Estratégia",      // Nome exibido na UI
  description: "Descrição...",   // Breve descrição
  category: "auto",              // "auto" ou "semi-auto"

  // Opcional: Definir chaves de customStats para painéis na página Stats
  customStatKeys: [
    { key: "metodo", label: "Método Utilizado" },
    { key: "confluencia", label: "Nível de Confluência" }
  ],

  // NOVO: Definir filtros customizados que aparecem na página de Estratégias
  customFilterKeys: [
    { key: "min_confluence", label: "Confluência Mínima", type: "range", defaultMin: 0, defaultMax: 5, step: 1 },
    { key: "method_filter", label: "Método", type: "multiselect", options: ["RSI_Bounce", "SR_Touch", "BB_Squeeze"] },
  ],

  onTick: (ctx: StrategyContext): StrategyResult | null => {
    // 1. Ler filtros configurados pelo utilizador
    const filters = ctx.activeFilters || {};
    
    // 2. Acesso aos filtros (IMPORTANTE):
    // - Para "range": filters.meu_filtro.ranges[0].min
    // - Para "select": filters.meu_filtro.value
    // - Para "multiselect": filters.meu_filtro.values

    // 3. Exemplo de uso de indicador:
    // const closes = ctx.history.map(v => v.c);
    // const rsiValues = rsi(closes, 14);
    // const lastRsi = rsiValues[rsiValues.length - 1];

    return null;
  }
};

export default MinhaEstrategia;`)}
                  >
                    <Copy className="h-3.5 w-3.5" /> Copiar Tudo
                  </Button>
                </div>
              </DialogHeader>
              <div className="prose prose-invert prose-sm max-w-none space-y-4 text-sm mt-4">
                <h3 className="text-primary font-bold text-lg">Estrutura Obrigatória</h3>
                <p className="text-muted-foreground">Cada estratégia é um arquivo <code>.ts</code> na pasta <code>src/strategies/</code>. Deve exportar um objeto <code>default</code> com a seguinte interface:</p>
                <pre className="bg-[#0d1117] p-4 rounded-lg text-xs overflow-x-auto border border-border/50">{`import { Strategy, StrategyContext, StrategyResult } from "./index";

const MinhaEstrategia: Strategy = {
  id: "minha_estrategia",        // ID único (será o nome do arquivo)
  name: "Minha Estratégia",      // Nome exibido na UI
  description: "Descrição...",   // Breve descrição
  category: "auto",              // "auto" ou "semi-auto"

  // Opcional: Definir chaves de customStats para painéis na página Stats
  customStatKeys: [
    { key: "metodo", label: "Método Utilizado" },
    { key: "confluencia", label: "Nível de Confluência" }
  ],

  // NOVO: Definir filtros customizados que aparecem na página de Estratégias
  customFilterKeys: [
    { key: "min_confluence", label: "Confluência Mínima", type: "range", defaultMin: 0, defaultMax: 5, step: 1 },
    { key: "method_filter", label: "Método", type: "multiselect", options: ["RSI_Bounce", "SR_Touch", "BB_Squeeze"] },
    { key: "trend", label: "Tendência", type: "select", options: ["Alta", "Baixa", "Lateral"] },
  ],

  onTick: (ctx: StrategyContext): StrategyResult | null => {
    // 1. Acesso aos filtros (IMPORTANTE):
    // - Para "range": filters.meu_filtro.ranges[0].min
    // - Para "select": filters.meu_filtro.value
    // - Para "multiselect": filters.meu_filtro.values

    // 2. Uso do MTF (Multi-Timeframe)
    // const velasM5 = ctx.getMTF(5); // Velas de 5m FECHADAS
    // if (velasM5.length < 20) return null;
    
    // 3. Analisar timeframe maior para filtrar gatilho no menor
    // const rsi5m = ctx.indicators.rsi(14, velasM5.map(v => v.c));
    // const lastRsi5m = rsi5m[rsi5m.length - 1];
    // if (lastRsi5m < 30) { /* Procurar CALL em 1m... */ }

    return null;
  }
};

export default MinhaEstrategia;`}</pre>

                <h3 className="text-primary font-bold text-lg mt-6">StrategyContext — Dados Disponíveis</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border border-border/50">
                    <thead className="bg-[#1a1e29]"><tr><th className="p-2 text-left">Campo</th><th className="p-2 text-left">Tipo</th><th className="p-2 text-left">Descrição</th></tr></thead>
                    <tbody className="divide-y divide-border/30">
                      <tr><td className="p-2"><code>asset</code></td><td className="p-2">string</td><td className="p-2">Símbolo do ativo (ex: "R_100")</td></tr>
                      <tr><td className="p-2"><code>history</code></td><td className="p-2">Candle[]</td><td className="p-2">Array de velas fechadas (formato objeto).</td></tr>
                      <tr><td className="p-2"><code>candles</code></td><td className="p-2">Candle[]</td><td className="p-2">Array de velas fechadas (tipado). Recomendo usar este.</td></tr>
                      <tr><td className="p-2"><code>lastPrice</code></td><td className="p-2">number</td><td className="p-2">Preço da última vela fechada.</td></tr>
                      <tr><td className="p-2"><code>currentPrice</code></td><td className="p-2">number</td><td className="p-2">Preço atual (tick em tempo real).</td></tr>
                      <tr><td className="p-2"><code>balance</code></td><td className="p-2">number</td><td className="p-2">Saldo atual da conta</td></tr>
                      <tr><td className="p-2"><code>tradingMode</code></td><td className="p-2">string</td><td className="p-2">"real", "demo" ou "backtest"</td></tr>
                      <tr><td className="p-2"><code>isBacktest</code></td><td className="p-2">boolean</td><td className="p-2">true se estiver em modo backtest</td></tr>
                      <tr><td className="p-2"><code>intervalMs</code></td><td className="p-2">number</td><td className="p-2">Duração da vela em ms (60000=1m, 300000=5m)</td></tr>
                      <tr><td className="p-2"><code>candleTimeRemainingMs</code></td><td className="p-2">number</td><td className="p-2">Tempo restante até a vela atual fechar (ms). No backtest = 0</td></tr>
                      <tr><td className="p-2"><code>hasOpenTrade</code></td><td className="p-2">boolean</td><td className="p-2">Se já existe um trade aberto neste ativo</td></tr>
                      <tr><td className="p-2"><code>lastTrade</code></td><td className="p-2">Trade | undefined</td><td className="p-2"><strong>Novo</strong>: Objeto do último trade finalizado (WIN/LOSS). Útil para recuperar stake (Martingale, Soros) ou pausas após perdas.</td></tr>
                       <tr><td className="p-2"><code>srLines</code></td><td className="p-2">array</td><td className="p-2">Linhas de suporte/resistência do ativo</td></tr>
                      <tr><td className="p-2"><code>srZones</code></td><td className="p-2">array</td><td className="p-2">Zonas de compra/venda do ativo</td></tr>
                      <tr><td className="p-2"><code>activeFilters</code></td><td className="p-2">Record</td><td className="p-2">Filtros configurados. Contém <code>.ranges</code>, <code>.value</code> ou <code>.values</code>.</td></tr>
                      <tr><td className="p-2"><code>getMTF(min)</code></td><td className="p-2">function</td><td className="p-2">Retorna array de velas agrupadas. Suporta qualquer timeframe (1, 2, 5, 10, 15...).</td></tr>
                    </tbody>
                  </table>
                </div>

                <div className="bg-warning/10 border-l-4 border-warning p-5 my-6 text-sm text-muted-foreground space-y-4 rounded-r-md">
                  <h4 className="font-bold text-warning text-base flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-5 w-5" />
                    Guia Definitivo: Estrutura das Velas e Sinalização de Entrada
                  </h4>

                  <div className="space-y-2">
                    <p className="font-semibold text-foreground">1. Estrutura de Atributos do Objeto Candle</p>
                    <p>Cada vela individual (<code>Candle</code>) no array local <code>ctx.history</code> e no array agrupado de Multi-Timeframe (<code>ctx.getMTF</code>) possui a seguinte estrutura de dados rigorosa:</p>
                    <div className="bg-[#0d1117] p-3 rounded border border-border/40 font-mono text-xs text-[#e1e4e8] space-y-1 my-2">
                      <div>interface Candle {"{"}</div>
                      <div className="pl-4"><code>t: number;</code> <span className="text-muted-foreground">// Timestamp Unix em milissegundos correspondente ao início exato da vela</span></div>
                      <div className="pl-4"><code>o: number;</code> <span className="text-muted-foreground">// Preço de Abertura (Open)</span></div>
                      <div className="pl-4"><code>h: number;</code> <span className="text-muted-foreground">// Preço Máximo atingido no período (High)</span></div>
                      <div className="pl-4"><code>l: number;</code> <span className="text-muted-foreground">// Preço Mínimo atingido no período (Low)</span></div>
                      <div className="pl-4"><code>c: number;</code> <span className="text-muted-foreground">// Preço de Fechamento definitivo (Close)</span></div>
                      <div>{"}"}</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="font-semibold text-foreground">2. Como Acessar Corretamente os Dados do Histórico</p>
                    <ul className="list-disc ml-6 space-y-1">
                      <li><strong>Última Vela Fechada (Vela de Análise):</strong> Para ler a última vela que de fato fechou e se consolidou, acesse <code>const velaAnalise = ctx.history[ctx.history.length - 1];</code>. Todas as suas variáveis de decisão técnica e indicadores (ex: RSI, Médias) devem ser calculados com base nessa última vela fechada.</li>
                      <li><strong>Vela Anterior:</strong> Para analisar cruzamentos ou padrões de velas anteriores, acesse <code>const velaAnterior = ctx.history[ctx.history.length - 2];</code>.</li>
                      <li><strong>Segurança Absoluta:</strong> No trading real e demo, a plataforma filtra automaticamente os dados e nunca disponibiliza a vela atual (em formação) em <code>ctx.history</code>. Isso garante que sua lógica calcule indicadores apenas em dados definitivos, mantendo simetria absoluta com os testes do Backtest!</li>
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <p className="font-semibold text-foreground">3. Regra de Sinalização: Vela de Análise vs. Vela Operada</p>
                    <p>Uma dúvida comum é: <em>"O robô entra na vela onde o sinal apareceu ou na vela seguinte?"</em></p>
                    <div className="border border-border/40 p-3 bg-card/50 rounded space-y-2 text-foreground/95">
                      <p><strong>A plataforma funciona da seguinte forma:</strong></p>
                      <ul className="list-disc ml-5 space-y-1 text-sm text-muted-foreground">
                        <li>Sua estratégia roda o <code>onTick()</code> analisando a <span className="text-warning font-semibold">Última Vela da Análise (Fechada)</span> (<code>ctx.history.length - 1</code>) para detectar o sinal técnico (ex. RSI menor que 30 + Vela de alta).</li>
                        <li>Se sua lógica retornar um sinal de ordem, ex: <code>{"{ action: \"CALL\" }"}</code>, este sinal é disparado imediatamente na abertura da <span className="text-emerald-500 font-semibold">Vela Operada (Vela Seguinte)</span>, que é a vela que está se iniciando naquele instante.</li>
                        <li><strong>Sinalização Visual:</strong> Toda a sinalização visual do gráfico (setas verdes de Compra e vermelhas de Venda) é posicionada e validada na **Vela Operada (Vela de Entrada)**. Ou seja, a seta aparecerá indicando o início da operação na vela em que o robô efetivamente abriu a posição, após a confirmação do sinal no fechamento da vela anterior!</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <h3 className="text-primary font-bold text-lg mt-6">Importações Obrigatórias</h3>
                <p className="text-muted-foreground">O sistema fornece a importação dos dados do histórico e dos indicadores. Para importar os indicadores predefinidos não causaremm problemas: você <strong>deve</strong> importar de <code>@/lib/market</code> e utilizar no `onTick`. Não tente instalar livratias adicionais.</p>
                <pre className="bg-[#0d1117] p-4 rounded-lg text-xs overflow-x-auto border border-border/50">{`import { rsi, adx, sma, ema, bollinger, macd, parabolicSar } from "@/lib/market";`}</pre>

                <h3 className="text-primary font-bold text-lg mt-6">Indicadores Disponíveis (via ctx.indicators)</h3>
                <p className="text-muted-foreground">É recomendado usar <code>ctx.indicators</code>, que utiliza os dados limpos e evita importações manuais. Agora com suporte a <strong>Estratégias Híbridas</strong>: você pode passar um <code>dataSource</code> customizado (obtido via <code>getMTF</code>) como segundo parâmetro:</p>
                <pre className="bg-[#0d1117] p-4 rounded-lg text-xs overflow-x-auto border border-border/50">{`// RSI (Relative Strength Index)
const rsiArr = ctx.indicators.rsi(14);
const lastRsi = rsiArr[rsiArr.length - 1]; // Sempre o indicador da última vela fechada!

// SMA (Simple Moving Average)
const sma20 = ctx.indicators.sma(20);
const lastSma = sma20[sma20.length - 1];

// EMA (Exponential Moving Average)
const ema9 = ctx.indicators.ema(9);

// Bollinger Bands
const bb = ctx.indicators.bollinger(20, 2);
const upperBB = bb.upper[bb.upper.length - 1];
const lowerBB = bb.lower[bb.lower.length - 1];

// ADX (Average Directional Index)
const adxData = ctx.indicators.adx(14);
const lastAdx = adxData.adx[adxData.adx.length - 1];
const plusDi = adxData.plusDi[adxData.plusDi.length - 1];
const minusDi = adxData.minusDi[adxData.minusDi.length - 1];

// MACD
const macdData = ctx.indicators.macd(12, 26, 9);
const macdLine = macdData.macd[macdData.macd.length - 1];

// Parabolic SAR
const sarData = ctx.indicators.parabolicSar(0.02, 0.2);
const lastSar = sarData.sar[sarData.sar.length - 1];
const lastTrend = sarData.trend[sarData.trend.length - 1]; // 'up' ou 'down' `}</pre>

                <h3 className="text-primary font-bold text-lg mt-6">StrategyResult — Retorno do Sinal</h3>
                <pre className="bg-[#0d1117] p-4 rounded-lg text-xs overflow-x-auto border border-border/50">{`return {
  action: "CALL",          // "CALL" | "PUT" | "BUY" | "SELL" | null
  expiryCandles: 1,        // Quantas velas até expirar (1 = expira no fim da próxima vela)
  stake: 10,               // Valor da aposta (opcional. Por padrão, usa gestão configurada no robô)

  // NOVO: Ordens Pendentes (Reteste / Pico)
  pendingPrice: 1234.50,   // O trade só será aberto se o preço TOCAR neste valor
  pendingExpiryCandles: 5, // A ordem pendente expira após 5 velas se não for tocada

  // Opcional: Adicionar dados às Estatísticas Global (Custom Stats)
  customStats: {
    metodo: "Bounce_Suporte", // O painel de stats agora criará abas para esta chave e mostrará resultados de WIN/LOSS
    confluencia: 3
  }
};`}</pre>

                <h3 className="text-primary font-bold text-lg mt-6">Evitando Erros (Best Practices)</h3>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li><strong>Ordens Pendentes:</strong> Ao usar <code>pendingPrice</code>, o robô monitora o preço tick-a-tick. Quando o preço toca ou cruza o alvo, a ordem é enviada instantâneamente. A duração da ordem configurada no robô (ex. fim da vela) é respeitada a partir do momento do toque.</li>
                  <li><strong>Tamanho do Histórico:</strong> Verifique <code>if (ctx.history.length &lt; 20) return null;</code> antes de chamar indicadores para evitar erros (RSI e outros falham se dados forem curtos).</li>
                  <li><strong>Variáveis de Estado (Memória):</strong> O <code>onTick</code> é executado a cada tick. Salve variáveis (ex. último cruzamento) forá da função <code>onTick</code> (no corpo superior) mas certifique-se de indexar por <code>ctx.asset</code> se a estratégia rodar em múltiplos ativos simultâneamente.</li>
                  <li><strong>Tratamento de Exceções:</strong> Retorne <code>null</code> nas condições indefinidas para evitar falhas de sistema e garantir a persistência segura.</li>
                  <li><strong>Custom Stats:</strong> Para separar resultados no Painel de Estatísticas, use uma propriedade principal (ex. <code>{`{ padraoEncontrado: "Doji" }`}</code>) e ela fará filtros de WIN% automáticos no painel.</li>
                </ul>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDocsOpen(false)}>Fechar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="max-w-4xl border-border/50">
              <DialogHeader>
                <DialogTitle>{isEditing ? `Editando: ${editingId}` : "Novo Script"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid gap-1.5">
                  <label className="text-xs text-muted-foreground uppercase font-bold">ID da Estratégia (nome do arquivo)</label>
                  <input
                    className="w-full bg-background border rounded px-3 py-2 text-sm"
                    placeholder="ID (ex: minha_estratégia)"
                    value={newId}
                    onChange={e => setNewId(e.target.value)}
                    disabled={isEditing}
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-xs text-muted-foreground uppercase font-bold">Código TypeScript</label>
                  <Textarea className="font-mono h-[50vh] text-xs bg-background" value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="export default { id: '...', name: '...', category: 'auto', ... }" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreate}>{isEditing ? "Atualizar" : "Salvar"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="auto" className="space-y-6">
          <TabsList className="bg-card w-full justify-start border-b border-border rounded-none h-auto p-0 mb-4 bg-transparent">
            <TabsTrigger value="auto" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3">
              <Bot className="h-4 w-4 mr-2" />
              100% Automático
            </TabsTrigger>
            <TabsTrigger value="semi-auto" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3">
              <MousePointer2 className="h-4 w-4 mr-2" />
              Semi-Automático
            </TabsTrigger>
            <TabsTrigger value="fav" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3 relative">
              <Star className="h-4 w-4 mr-2" fill="currentColor" />
              Favoritas
              {Object.values(favoriteStrategies).filter(Boolean).length > 0 && (
                <span className="ml-1.5 bg-yellow-500/20 text-yellow-400 text-[10px] px-1.5 py-0.5 rounded-full">
                  {Object.values(favoriteStrategies).filter(Boolean).length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="auto" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 outline-none">
            {autoStrategies.map(renderStrategyCard)}
            {autoStrategies.length === 0 && (
              <div className="col-span-full py-20 text-center border border-dashed border-border rounded-lg text-muted-foreground/50">
                Sem estratégias automáticas disponíveis.
              </div>
            )}
          </TabsContent>

          <TabsContent value="semi-auto" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 outline-none">
            {semiAutoStrategies.map(renderStrategyCard)}
            {semiAutoStrategies.length === 0 && (
              <div className="col-span-full py-20 text-center border border-dashed border-border rounded-lg text-muted-foreground/50">
                Sem estratégias semi-automáticas. Ative a estratégia de S/R.
              </div>
            )}
          </TabsContent>

          <TabsContent value="fav" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 outline-none">
            {favStrategies.map(renderStrategyCard)}
            {favStrategies.length === 0 && (
              <div className="col-span-full py-20 text-center border border-dashed border-border rounded-lg text-muted-foreground/50">
                Nenhuma estratégia favorita. Clique na estrela ⭐ ao lado do nome para favoritar.
              </div>
            )}
          </TabsContent>
        </Tabs>

        {errorStrategies.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Erros de Compilação
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {errorStrategies.map(renderStrategyCard)}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
