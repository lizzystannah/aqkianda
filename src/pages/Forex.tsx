import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { useStore, type RobotConfig, type Trade } from "@/lib/store";
import { ASSETS } from "@/lib/market";
import { getRobotRuntime, resetRobotOnServer, resetRobotDailyOnServer } from "@/lib/robotClient";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Cpu,
  BrainCircuit,
  Play,
  Pause,
  TrendingUp,
  TrendingDown,
  Info,
  Settings2,
  SlidersHorizontal,
  Terminal,
  ArrowLeftRight,
  Trash2,
  Pencil,
  Plus,
  Search,
  Code2,
  X,
  FileCode,
  ShieldCheck,
  Target,
  Signal,
  Wifi,
  BarChart2,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  History,
  Power,
  PowerOff,
  Monitor,
  Layers,
  Compass,
  BookOpen,
  Eye,
  EyeOff,
  Loader2,
  Server,
  RefreshCw
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

const DOC_MARKDOWN = `### MANUAL DE INTEGRAÇÃO — ENGINE FOREX QUANTERN

Guia completo para criar estratégias de trading algorítmico Forex. Copie e forneça para IAs externas (Gemini, OpenAI, Claude) gerarem estratégias compatíveis.

---

## 1. ESTRUTURA BASILAR DE VELAS (ctx.candles)

O argumento 'ctx' expõe um array histórico 'ctx.candles', onde cada item possui:

    {
      "t": 1675209600000,  // Timestamp UNIX em milisegundos
      "o": 1.0854,         // Preço de Abertura (Open)
      "h": 1.0862,         // Preço Máximo (High)
      "l": 1.0848,         // Preço Mínimo (Low)
      "c": 1.0858,         // Preço de Fechamento (Close)
      "v": 154.2           // Volume total de ticks
    }

## 2. RESAMPLING MULTI-TIMEFRAME (MTF)

O motor sincroniza velas de 1 minuto em tempo real. Para analisar tempos gráficos maiores, use a função de agregação:

    function aggregateCandles(m1Candles, timeframeMinutes) {
      const aggregated = [];
      let currentUnit = null;
      for (const c of m1Candles) {
        const bucketStart = Math.floor(c.t / (timeframeMinutes * 60 * 1000)) * (timeframeMinutes * 60 * 1000);
        if (!currentUnit || currentUnit.t !== bucketStart) {
          if (currentUnit) aggregated.push(currentUnit);
          currentUnit = { t: bucketStart, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v };
        } else {
          currentUnit.h = Math.max(currentUnit.h, c.h);
          currentUnit.l = Math.min(currentUnit.l, c.l);
          currentUnit.c = c.c;
          currentUnit.v += c.v;
        }
      }
      if (currentUnit) aggregated.push(currentUnit);
      return aggregated;
    }

    // Exemplo: velas de 4 Horas (240 minutos)
    const h4 = aggregateCandles(ctx.candles, 240);
    // Velas de 1 Hora (60 minutos)
    const h1 = aggregateCandles(ctx.candles, 60);
    // Velas de 15 Minutos
    const m15 = aggregateCandles(ctx.candles, 15);

## 3. INDICADORES DISPONÍVEIS (ctx.indicators)

O motor expõe indicadores técnicos pré-computados via ctx.indicators:

    ctx.indicators.rsi(period)             // RSI (ex: ctx.indicators.rsi(14))
    ctx.indicators.sma(period)             // Média Móvel Simples
    ctx.indicators.ema(period)             // Média Móvel Exponencial
    ctx.indicators.bollinger(period, mult) // Bandas de Bollinger
    ctx.indicators.adx(period)             // ADX (força da tendência)
    ctx.indicators.macd(fast, slow, sig)   // MACD
    ctx.indicators.parabolicSar(step, max) // Parabolic SAR

## 4. PROTOCOLO DE RETORNO DO SINAL (onTick)

A função 'onTick(ctx)' deve analisar as velas e indicadores, devolvendo:

### Para ordens de COMPRA (BUY) ou VENDA (SELL):

    return {
      action: "BUY" | "SELL",
      price: ctx.candles[ctx.candles.length - 1].c,
      confidence: 85,  // Grau de confiança (0-100)
      reason: "RSI Sobrevendido + Cruzamento MACD em MTF H4"
    };

### Se neutro (sem sinal):

    return null;

### Para ordens com Stop Loss e Take Profit:

    return {
      action: "BUY",
      price: currentPrice,
      stopLoss: currentPrice - 0.0020,  // 20 pips abaixo
      takeProfit: currentPrice + 0.0030, // 30 pips acima
      confidence: 75,
      reason: "Rompimento de resistência com volume"
    };

## 5. CRIAÇÃO DE ESTRATÉGIAS — BOAS PRÁTICAS

### Estrutura mínima de uma estratégia:

    export default {
      id: "forex_minha_estrategia",
      name: "Minha Estratégia Forex",
      market: "forex",
      onTick(ctx) {
        // Análise aqui
        return null;
      }
    };

### Validação de resultados:

1. **Backtest histórico**: Execute contra dados históricos de pelo menos 3 meses
2. **Múltiplos pares**: Teste em EURUSD, GBPUSD, USDJPY — se funcionar em todos, é robusta
3. **Walk-forward**: Separe os dados em treino (70%) e validação (30%)
4. **Mínimo de amostras**: Uma estratégia só é válida após 100+ operações
5. **Sharpe Ratio**: Prefira estratégias com retorno consistente (pequenas vitórias frequentes) em vez de ganhos esporádicos grandes

### Artifícios e filtros recomendados:

1. **Filtro RSI (30-70)**: Evite comprar em overbought ou vender em oversold
2. **Filtro MACD**: Só opere na direção do histograma (Bullish > 0, Bearish < 0)
3. **Multi-Timeframe**: Confirme sinais no H4 antes de operar no M15
4. **Horário de mercado**: Evite entrar durante notícias econômicas (alta volatilidade)
5. **VD Filter (Consistência)**: Só opere após N vitórias consecutivas perdidas

## 6. ESTRATÉGIA COMPLETA — EXEMPLO MTF + RSI + MACD

    export default {
      id: "forex_mtf_trend",
      name: "MTF Trend Trader",
      market: "forex",

      onTick(ctx) {
        const candles = ctx.candles;
        if (candles.length < 60) return null;

        // MTF: construir velas de 1h e 4h
        const h1 = aggregateCandles(candles, 60);
        const h4 = aggregateCandles(candles, 240);

        // Indicadores no timeframe atual (1m)
        const rsi14 = ctx.indicators.rsi(14);
        const currentRsi = rsi14[rsi14.length - 1];

        // Médias no H4 para tendência
        const h4Closes = h4.map(c => c.c);
        const ema20 = ctx.indicators.ema(20);
        const ema50 = ctx.indicators.ema(50);

        const lastPrice = candles[candles.length - 1].c;

        // BUY: Tendência de alta no H4 + RSI < 40 (oversold)
        if (lastPrice > ema20[ema20.length - 1] && currentRsi && currentRsi < 40) {
          return {
            action: "BUY",
            price: lastPrice,
            stopLoss: lastPrice - 0.0020,
            takeProfit: lastPrice + 0.0030,
            confidence: 80,
            reason: \`H4 altista + RSI \${currentRsi.toFixed(0)} (sobrevendido)\`
          };
        }

        // SELL: Tendência de baixa no H4 + RSI > 60 (overbought)
        if (lastPrice < ema20[ema20.length - 1] && currentRsi && currentRsi > 60) {
          return {
            action: "SELL",
            price: lastPrice,
            stopLoss: lastPrice + 0.0020,
            takeProfit: lastPrice - 0.0030,
            confidence: 80,
            reason: \`H4 baixista + RSI \${currentRsi.toFixed(0)} (sobrecomprado)\`
          };
        }

        return null;
      }
    };

## 7. MODOS OPERACIONAIS

### Modo Backtest:
- Executa simulação histórica sobre dados reais
- Usa o mesmo motor que o mercado binário
- Você pode testar em múltiplos pares simultaneamente
- Relatório completo: win rate, PnL, drawdown, sequências

### Modo Real (Robô):
- Conecta-se à conta Deriv real
- Respeita as configurações de risco (stop loss diário, meta de ganho)
- Executa ordens automaticamente via WebSocket
- Gerencia lotes e alavancagem conforme configurado

### Modo Demo (Robô):
- Idêntico ao modo real, mas usa saldo virtual
- Útil para validação em tempo real sem risco
- Todos os robôs iniciam em modo demo por padrão
`;

// Default template for a Forex script
const DEFAULT_FOREX_STRATEGY = `export default {
  id: "forex_custom_strategy",
  name: "Minha Estratégia Forex",
  market: "forex",

  onTick(ctx) {
    return null;
  }
};
`;

// Helper to estimate realistic forex spreads in pips
function getForexSpread(symbol: string): number {
  switch (symbol) {
    case "EURUSD": return 1.2;
    case "GBPUSD": return 1.6;
    case "USDJPY": return 1.4;
    case "AUDUSD": return 1.8;
    case "USDCAD": return 1.7;
    case "USDCHF": return 1.9;
    case "EURGBP": return 1.5;
    default: return 2.2;
  }
}

const TIMEFRAMES = ["1m", "2m", "3m", "5m", "10m", "15m", "30m", "1h", "4h", "1d"];

// Live runtime status badge — refreshes every 2 s
function RuntimeBadge({ robotId }: { robotId: string }) {
  const [status, setStatus] = useState<{ connected: boolean; candleCount: number; ready: boolean; assetCount: number } | null>(null);

  useEffect(() => {
    const update = () => setStatus(getRobotRuntime(robotId));
    update();
    const iv = setInterval(update, 2000);
    return () => clearInterval(iv);
  }, [robotId]);

  if (!status) {
    return (
      <span className="flex items-center gap-1 text-[9px] text-muted-foreground bg-secondary/30 px-2 py-0.5 rounded-full">
        <AlertCircle className="h-2.5 w-2.5" /> Offline
      </span>
    );
  }

  if (!status.connected) {
    return (
      <span className="flex items-center gap-1 text-[9px] text-warning bg-warning/10 px-2 py-0.5 rounded-full">
        <Signal className="h-2.5 w-2.5 animate-pulse" /> Conectando…
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1 text-[9px] text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">
      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
      {status.ready ? `${status.assetCount} ativos · ${status.candleCount} velas` : "Carregando…"}
    </span>
  );
}

// ─── MT5 Account Panel ──────────────────────────────────────────────
function Mt5AccountPanel() {
  const { mt5LoginId, mt5Password, setMt5Credentials, demoToken } = useStore();
  const [localLogin, setLocalLogin] = useState(mt5LoginId);
  const [localPass, setLocalPass] = useState(mt5Password);
  const [showPass, setShowPass] = useState(false);
  const [mt5Status, setMt5Status] = useState<{ balance: number; equity: number; margin: number } | null>(null);
  const [mt5Loading, setMt5Loading] = useState(false);
  const [mt5Error, setMt5Error] = useState("");

  const handleLogin = async () => {
    if (!localLogin.trim() || !localPass.trim()) return;
    setMt5Loading(true);
    setMt5Error("");
    try {
      const derivToken = demoToken;
      const res = await fetch("/api/mt5/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId: localLogin.trim(), password: localPass.trim(), token: derivToken })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Falha ao conectar MT5");
      setMt5Credentials(localLogin.trim(), localPass.trim());
      if (data.settings) {
        setMt5Status({ balance: data.settings.balance, equity: data.settings.equity, margin: data.settings.margin });
      }
      toast.success("MT5 conectado!");
    } catch (err: any) {
      setMt5Error(err.message || "Falha ao conectar MT5");
      toast.error("MT5: " + (err.message || "Falha na conexão"));
    } finally {
      setMt5Loading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/mt5/logout", { method: "POST" });
    } catch (_) { /* ignore */ }
    setMt5Credentials("", "");
    setMt5Status(null);
    setMt5Error("");
    toast.info("MT5 desconectado.");
  };

  const handleFetchStatus = async () => {
    setMt5Loading(true);
    try {
      const res = await fetch("/api/mt5/settings");
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Erro ao obter status");
      if (data.settings) {
        setMt5Status({ balance: data.settings.balance, equity: data.settings.equity, margin: data.settings.margin });
      }
    } catch (err: any) {
      toast.error("MT5: " + (err.message || "Erro ao obter status"));
    } finally {
      setMt5Loading(false);
    }
  };

  const isConnected = !!mt5LoginId;

  return (
    <div className="space-y-3">
      {!isConnected ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div className="md:col-span-1">
            <label className="text-[9px] text-muted-foreground uppercase font-bold block mb-1">Login ID</label>
            <input
              value={localLogin}
              onChange={(e) => setLocalLogin(e.target.value)}
              placeholder="Ex: MT5D1234567"
              className="w-full h-8 text-xs bg-slate-800 border border-border/50 rounded-md px-2 outline-none text-white placeholder:text-muted-foreground/40 font-mono"
            />
          </div>
          <div className="md:col-span-1">
            <label className="text-[9px] text-muted-foreground uppercase font-bold block mb-1">Password</label>
            <div className="flex items-center gap-1">
              <input
                type={showPass ? "text" : "password"}
                value={localPass}
                onChange={(e) => setLocalPass(e.target.value)}
                placeholder="Investor password"
                className="flex-1 h-8 text-xs bg-slate-800 border border-border/50 rounded-md px-2 outline-none text-white placeholder:text-muted-foreground/40 font-mono"
              />
              <button onClick={() => setShowPass(!showPass)} className="p-1.5 text-muted-foreground hover:text-white">
                {showPass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          <div className="md:col-span-1 flex items-end">
            <button
              onClick={handleLogin}
              disabled={mt5Loading || !localLogin.trim() || !localPass.trim()}
              className="w-full h-8 flex items-center justify-center gap-1.5 text-xs font-bold rounded-md bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50"
            >
              {mt5Loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Server className="h-3.5 w-3.5" />}
              Conectar MT5
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-black/30 p-2 rounded border border-border/30">
              <div className="text-[8px] text-muted-foreground uppercase">Balanço</div>
              <div className="text-xs font-bold ticker text-white">${mt5Status?.balance?.toFixed(2) || "—"}</div>
            </div>
            <div className="bg-black/30 p-2 rounded border border-border/30">
              <div className="text-[8px] text-muted-foreground uppercase">Equity</div>
              <div className="text-xs font-bold ticker text-bull">${mt5Status?.equity?.toFixed(2) || "—"}</div>
            </div>
            <div className="bg-black/30 p-2 rounded border border-border/30">
              <div className="text-[8px] text-muted-foreground uppercase">Margem</div>
              <div className="text-xs font-bold ticker text-bear">${mt5Status?.margin?.toFixed(2) || "—"}</div>
            </div>
            <div className="bg-black/30 p-2 rounded border border-border/30">
              <div className="text-[8px] text-muted-foreground uppercase">Login</div>
              <div className="text-xs font-bold ticker text-cyan-400">{mt5LoginId}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleFetchStatus}
              disabled={mt5Loading}
              className="h-7 px-2.5 text-[10px] font-bold rounded bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30"
            >
              {mt5Loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Atualizar
            </button>
            <button
              onClick={handleLogout}
              className="h-7 px-2.5 text-[10px] font-bold rounded bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20"
            >
              Desconectar
            </button>
          </div>
        </div>
      )}

      {mt5Error && (
        <p className="text-[10px] text-rose-400 bg-rose-500/10 p-2 rounded border border-rose-500/30">{mt5Error}</p>
      )}

      <p className="text-[9px] text-muted-foreground leading-relaxed border-t border-border/20 pt-2">
        <strong>MT5 Demo</strong> — Usa o token <strong>demo</strong> da API Deriv.
        Introduz os dados da <strong>conta demo MT5</strong> (ex: MT5D1234567).
        O lote e SL/TP são definidos na configuração de cada robô.
        <em> Precisa de uma conta Deriv MT5 demo separada.</em>
      </p>
    </div>
  );
}

export default function Forex() {
  const [activeTab, setActiveTab] = useState<"strategies" | "robots">("strategies");
  const [searchQuery, setSearchQuery] = useState("");
  const [isDocOpen, setIsDocOpen] = useState(false);

  const navigate = useNavigate();

  // Backend strategies fetching
  const [allStrategies, setAllStrategies] = useState<any[]>([]);
  const [strategiesLoading, setStrategiesLoading] = useState(false);

  // Zustand State hooks
  const robots = useStore((s) => s.robots);
  const addRobot = useStore((s) => s.addRobot);
  const updateRobot = useStore((s) => s.updateRobot);
  const removeRobot = useStore((s) => s.removeRobot);
  const clearRobotTrades = useStore((s) => s.clearRobotTrades);
  const resetRobotDaily = useStore((s) => s.resetRobotDaily);
  const replaceRobotTradesToStats = useStore((s) => s.replaceRobotTradesToStats);
  const clearManagementHistory = useStore((s) => s.clearManagementHistory);
  const mt5LoginId = useStore((s) => s.mt5LoginId);

  // Expanded panel states
  const [expandedConfig, setExpandedConfig] = useState<Record<string, boolean>>({});
  const [expandedTrades, setExpandedTrades] = useState<Record<string, boolean>>({});
  const [expandedDaily, setExpandedDaily] = useState<Record<string, boolean>>({});

  const toggleConfig = (id: string) =>
    setExpandedConfig((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleTrades = (id: string) =>
    setExpandedTrades((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleDaily = (id: string) =>
    setExpandedDaily((prev) => ({ ...prev, [id]: !prev[id] }));

  // Dialog State
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorId, setEditorId] = useState("");
  const [editorCode, setEditorCode] = useState("");
  const [isEditingMode, setIsEditingMode] = useState(false);

  // Robot Creation Modal specific states
  const [isRobotModalOpen, setIsRobotModalOpen] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<any>(null);
  
  // Custom form state for Forex Robot Setup
  const [robotAssetName, setRobotAssetName] = useState("EURUSD");
  const [robotLeverage, setRobotLeverage] = useState(100); // 1:100 leverage
  const [robotAvailableValue, setRobotAvailableValue] = useState(1000); // Valor disponível
  const [robotTotalValue, setRobotTotalValue] = useState(5000); // Valor total
  const [robotLotSize, setRobotLotSize] = useState(0.1); // Lote operacional (Stake)
  const [robotStopLossPercent, setRobotStopLossPercent] = useState(10); // Deseja perder %
  const [robotGoalPercent, setRobotGoalPercent] = useState(30); // Meta de ganho %
  
  // Real-time calculated live values in Robot Creation Modal
  const currentSpread = useMemo(() => {
    // Simulates dynamic live spread fluctuation to represent Deriv feed
    const base = getForexSpread(robotAssetName);
    const fluctuation = parseFloat((Math.random() * 0.4 - 0.2).toFixed(2));
    return parseFloat(Math.max(0.6, base + fluctuation).toFixed(2));
  }, [robotAssetName]);

  // Convert Percentage constraints back to dynamic lot / pips internally
  const calculatedStopLossVal = useMemo(() => {
    return (robotAvailableValue * robotStopLossPercent) / 100;
  }, [robotAvailableValue, robotStopLossPercent]);

  const calculatedGoalVal = useMemo(() => {
    return (robotAvailableValue * robotGoalPercent) / 100;
  }, [robotAvailableValue, robotGoalPercent]);

  // Filters state replicated from binary strategies
  const [rsiFilterActive, setRsiFilterActive] = useState(false);
  const [macdFilterActive, setMacdFilterActive] = useState(false);
  const [vdvFilterActive, setVdvFilterActive] = useState(false);

  // Fetch all strategies from backend and filter by market === "forex"
  const fetchStrategies = async () => {
    setStrategiesLoading(true);
    try {
      const res = await fetch("/api/strategies");
      if (res.ok) {
        const data = await res.json();
        // Show only strategies marked with market: "forex"
        const filtered = (data.strategies || []).filter(
          (s: any) => s.market === "forex"
        );
        setAllStrategies(filtered);
      }
    } catch (e) {
      toast.error("Erro ao carregar estratégias Forex.");
    } finally {
      setStrategiesLoading(false);
    }
  };

  useEffect(() => {
    fetchStrategies();
  }, []);

  // Filter strategy list with search bar
  const displayedStrategies = useMemo(() => {
    return allStrategies.filter(
      (s) =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.id.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [allStrategies, searchQuery]);

  // Filter robot list: show only those with marketType === "forex"
  const displayedRobots = useMemo(() => {
    return (robots || []).filter((r) => r.marketType === "forex");
  }, [robots]);

  // Opens Editor Dialog to Create a New Strategy
  const handleOpenCreator = () => {
    const newGeneratedId = "forex_custom_strategy_" + Date.now().toString().slice(-4);
    setEditorId(newGeneratedId);
    
    // Customize the initial clean template code to include the newly generated ID
    const customTemplate = DEFAULT_FOREX_STRATEGY
      .replace(/forex_custom_strategy/g, newGeneratedId);
      
    setEditorCode(customTemplate);
    setIsEditingMode(false);
    setIsEditorOpen(true);
  };

  // Opens Editor Dialog to Edit Strategy Code
  const handleOpenEdit = async (fileName: string, id: string) => {
    try {
      const res = await fetch(`/api/strategies/${id}`);
      if (res.ok) {
        const data = await res.json();
        setEditorCode(data.code);
        setEditorId(id);
        setIsEditingMode(true);
        setIsEditorOpen(true);
      } else {
        toast.error("Estratégia padrão não pode ser editada direta via UI.");
      }
    } catch (err) {
      toast.error("Erro ao carregar ficheiro.");
    }
  };

  // Save Code to Server
  const handleSaveStrategy = async () => {
    if (!editorId || !editorCode) {
      toast.error("Preencha o ID e o código da estratégia.");
      return;
    }
    try {
      const res = await fetch("/api/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editorId, code: editorCode })
      });
      if (res.ok) {
        toast.success("Estratégia Forex guardada com sucesso!");
        setIsEditorOpen(false);
        fetchStrategies();
      } else {
        toast.error("Falha ao salvar estratégia Forex.");
      }
    } catch (e) {
      toast.error("Erro de conexão ao salvar script.");
    }
  };

  // Delete Strategy File from Server
  const handleDeleteStrategy = async (fileName: string, id: string) => {
    if (!confirm(`Deseja realmente eliminar a estratégia "${id}"?`)) return;
    try {
      const res = await fetch(`/api/strategies/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Estratégia eliminada com sucesso.");
        fetchStrategies();
      } else {
        const errData = await res.json();
        toast.error(errData.error || "Não foi possível apagar.");
      }
    } catch (e) {
      toast.error("Erro ao apagar ficheiro.");
    }
  };

  // Robot creation opener setup
  const triggerCreateRobot = (strategy: any) => {
    setSelectedStrategy(strategy);
    // Reset default robot setup values
    setRobotAssetName("EURUSD");
    setRobotAvailableValue(1000);
    setRobotTotalValue(5000);
    setRobotLotSize(0.1);
    setRobotStopLossPercent(10);
    setRobotGoalPercent(30);
    setRobotLeverage(100);
    setRsiFilterActive(false);
    setMacdFilterActive(false);
    setVdvFilterActive(false);

    setIsRobotModalOpen(true);
  };

  // Dispatch the finalized new robot to state store and production
  const handleConfirmCreateRobot = () => {
    if (!selectedStrategy) return;

    const robotId = `robot_fx_${Date.now()}`;
    const name = `FxRobô ${selectedStrategy.name.replace("Estratégia", "")} #${Math.floor(Math.random() * 90) + 10}`;

    // Pack filters
    const assembledFilters: Record<string, any> = {
      _asset: {
        enabled: true,
        action: "allow",
        optionConfigs: [{ option: robotAssetName, action: "allow", direction: "all" }]
      }
    };

    if (rsiFilterActive) {
      assembledFilters._rsi = { enabled: true, min: 30, max: 70 };
    }
    if (macdFilterActive) {
      assembledFilters._macd = { enabled: true, opt: "Bullish" };
    }

    const newRobot: RobotConfig = {
      id: robotId,
      name,
      strategyId: selectedStrategy.id,
      strategyFileName: selectedStrategy.fileName || selectedStrategy.id,
      filters: assembledFilters,
      globalInvert: false,
      active: false,
      mode: "demo",
      timeframe: "4h", // Best suited for forex default
      durationCandles: 1,
      assets: [robotAssetName],
      marketType: "forex",
      forexConfig: {
        availableValue: Number(robotAvailableValue),
        totalValue: Number(robotTotalValue),
        stake: Number(robotLotSize),
        stopLoss: calculatedStopLossVal,
        goal: calculatedGoalVal,
        leverage: Number(robotLeverage),
        spread: currentSpread
      },
      management: {
        active: true,
        stake: Number(robotLotSize),
        payout: 85,
        dailyGoal: calculatedGoalVal,
        dailyStopLoss: calculatedStopLossVal,
        mode: "fixed",
        sorosMaxStake: 0,
        entryAfterWin: false,
        vdFilter: vdvFilterActive,
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
      currentStake: Number(robotLotSize),
      warmupActive: false,
      createdAt: Date.now()
    };

    // Store dispatch and notify client
    addRobot(newRobot);
    setIsRobotModalOpen(false);
    toast.success(`Robô Forex "${newRobot.name}" de alta frequência criado com sucesso!`);
    setActiveTab("robots");
  };

  // Start / Stop a Robot
  const handleToggleRobotActive = (robot: RobotConfig, activeState: boolean) => {
    updateRobot(robot.id, { active: activeState });
    toast.success(
      activeState
        ? `Robô Forex "${robot.name}" está ONLINE na rede.`
        : `Robô Forex "${robot.name}" foi colocado OFFLINE.`
    );
  };

  // Clean Robot history completely from client and server persistent storage
  const handleClearHistory = (robotId: string) => {
    if (!confirm("Tem a certeza que deseja limpar completamente o histórico de operações deste robô?")) return;
    clearRobotTrades(robotId);
    toast.success("Histórico de transações limpo!");
  };

  // Completely delete Robot Config and active tasks
  const handleDeleteRobot = (robotId: string) => {
    if (!confirm("Remover permanentemente este robô e as suas posições do servidor?")) return;
    // Step 1: Deactivate first so syncRobotEngine sends stop-robot via socket
    updateRobot(robotId, { active: false });
    // Step 2: Brief delay to let the subscriber process active:false before removing from store
    setTimeout(() => {
      removeRobot(robotId);
      toast.error("Robô Forex removido do servidor.");
    }, 150);
  };

  // Fetch forex assets only
  const forexAssets = ASSETS.filter((a) => a.type === "forex");

  return (
    <AppShell>
      <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto w-full">
        
        {/* Banner Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
              <BrainCircuit className="h-8 w-8 text-cyan-400" />
              Forex Engine
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Desenvolva algoritmos avançados e configure robôs autônomos para o mercado internacional e moedas líquidas.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsDocOpen(true)}
              className="px-4 py-2 text-xs font-bold bg-slate-800 text-cyan-400 hover:text-white border border-slate-700 hover:bg-slate-700/60 transition-colors rounded-lg flex items-center gap-1.5"
            >
              <BookOpen className="h-4 w-4" /> Documentação API
            </button>
            <button
              onClick={handleOpenCreator}
              className="px-4 py-2 text-xs font-bold bg-cyan-500 text-black hover:bg-cyan-400 transition-colors rounded-lg flex items-center gap-1.5 shadow-[0_0_15px_rgba(34,115,197,0.2)]"
            >
              <Plus className="h-4 w-4" /> Nova Estratégia Forex
            </button>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-border/45 gap-1 bg-black/10 p-1 rounded-lg w-fit">
          <button
            onClick={() => setActiveTab("strategies")}
            className={`px-4 py-2 text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-2 ${
              activeTab === "strategies"
                ? "bg-slate-800 text-cyan-400 border border-slate-700/50 shadow-sm"
                : "text-muted-foreground hover:text-white"
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Minhas Estratégias Forex ({(allStrategies || []).length})
          </button>
          <button
            onClick={() => setActiveTab("robots")}
            className={`px-4 py-2 text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-2 ${
              activeTab === "robots"
                ? "bg-slate-800 text-cyan-400 border border-slate-700/50 shadow-sm"
                : "text-muted-foreground hover:text-white"
            }`}
          >
            <Cpu className="h-3.5 w-3.5" />
            Robôs Autônomos ({displayedRobots.length})
          </button>
        </div>

        {/* ─── TAB 1: STRATEGIES ─── */}
        {activeTab === "strategies" && (
          <div className="flex flex-col gap-5">
            {/* Search and Filters */}
            <div className="flex items-center bg-slate-900/60 p-3 rounded-lg border border-border/30 gap-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Pesquisar estratégias forex..."
                className="bg-transparent border-0 text-white text-xs placeholder:text-muted-foreground focus:ring-0 focus:outline-none flex-1"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Empty State */}
            {displayedStrategies.length === 0 && !strategiesLoading && (
              <div className="flex flex-col items-center justify-center py-16 border border-dashed border-border/30 rounded-xl bg-slate-900/10">
                <FileCode className="h-12 w-12 text-slate-700 animate-pulse" />
                <h3 className="text-sm font-semibold text-slate-300 mt-4">Nenhuma estratégia Forex modular</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-md text-center">
                  Crie scripts dedicados para Forex. Os scripts usam a fiação do motor global e são executados diretamente no Docker de forma persistente.
                </p>
                <button
                  onClick={handleOpenCreator}
                  className="mt-4 px-3 py-1.5 text-xs bg-slate-800 text-cyan-400 border border-slate-700 hover:text-white rounded transition-all"
                >
                  Criar Primeiro Script Forex
                </button>
              </div>
            )}

            {/* List of Strategies */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedStrategies.map((strategy) => (
                <div
                  key={strategy.id}
                  className="panel rounded-lg overflow-hidden transition-all duration-300 border-border/50 hover:border-cyan-500/30"
                >
                  {/* Strategy Header */}
                  <div className="px-4 py-3 bg-secondary/20 flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-cyan-500/20 text-cyan-400">
                        <BrainCircuit className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white">
                          {strategy.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[9px] uppercase tracking-wider text-cyan-400/80 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded font-mono">
                            FOREX
                          </span>
                          <code className="text-[9px] text-primary bg-primary/10 px-1 rounded">{strategy.id}</code>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleOpenEdit(strategy.fileName, strategy.id)}
                        className="p-1.5 rounded transition-colors bg-slate-800 text-muted-foreground hover:text-white border border-slate-700"
                        title="Editar algoritmo"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteStrategy(strategy.fileName, strategy.id)}
                        className="p-1.5 rounded transition-colors bg-red-950/20 text-red-400 hover:text-red-200 hover:bg-red-900/30 border border-red-900/30"
                        title="Eliminar estratégia"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="px-4 py-3 border-b border-border/30">
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed min-h-[2.5em]">
                      {strategy.description || "Estratégia para mercado Forex. Sem descrição detalhada disponível."}
                    </p>
                  </div>

                  {/* Forex Config Summary */}
                  <div className="px-4 py-2 border-b border-border/30">
                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      <div className="text-center">
                        <div className="text-muted-foreground/60 uppercase text-[8px]">Lote</div>
                        <div className="text-white font-bold font-mono mt-0.5">{strategy.defaultLot || "0.1"}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-muted-foreground/60 uppercase text-[8px]">Alavancagem</div>
                        <div className="text-cyan-400 font-bold font-mono mt-0.5">1:{strategy.defaultLeverage || 100}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-muted-foreground/60 uppercase text-[8px]">SL</div>
                        <div className="text-rose-400 font-bold font-mono mt-0.5">{strategy.defaultStopLoss || "10"}%</div>
                      </div>
                    </div>
                  </div>

                  <div className="px-4 py-3 flex items-center justify-between gap-2">
                    <button
                      onClick={() => {
                        const sStore = useStore.getState();
                        sStore.setMarketType("forex");
                        sStore.setActiveStrategyId(strategy.id);
                        sStore.setTradingMode("backtest");
                        sStore.setAutomationMode("auto");
                        toast.success(`Carregando simulador Forex para "${strategy.name}"...`);
                        setTimeout(() => navigate("/trading"), 500);
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md bg-amber-500/10 hover:bg-amber-500 text-amber-400 hover:text-black font-bold tracking-wide border border-amber-500/30 transition-all text-[10px]"
                    >
                      <History className="h-3.5 w-3.5" /> Backtest
                    </button>
                    <button
                      onClick={() => triggerCreateRobot(strategy)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md bg-cyan-500/10 hover:bg-cyan-500 text-cyan-400 hover:text-black font-bold tracking-wide border border-cyan-500/30 transition-all text-[10px]"
                    >
                      <Cpu className="h-3.5 w-3.5" /> Instanciar Robô
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── TAB 2: AUTONOMOUS ROBOTS ─── */}
        {activeTab === "robots" && (
          <div className="flex flex-col gap-5">
            {displayedRobots.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border/30 rounded-xl bg-slate-900/5">
                <Cpu className="h-12 w-12 text-slate-700 animate-bounce" />
                <h3 className="text-sm font-semibold text-slate-300 mt-4">Nenhum Robô Forex Ativo</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm text-center">
                  Vá ao menu "Minhas Estratégias", configure os ativos, margem de risco, filtros de rsi/vdv e clique em instanciar robô para iniciar o trading.
                </p>
              </div>
            )}

            {/* MT5 Account Panel */}
            <div className="panel rounded-lg border border-cyan-500/30 overflow-hidden">
              <div className="px-4 py-2.5 bg-cyan-500/5 border-b border-cyan-500/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-md bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                    <Server className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Conta MT5</span>
                  <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold">DEMO</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono ${
                    mt5LoginId ? "bg-bull/10 text-bull border border-bull/30" : "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                  }`}>
                    {mt5LoginId ? "Conectado" : "Desconectado"}
                  </span>
                </div>
              </div>
              <div className="p-4">
                <Mt5AccountPanel />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedRobots.map((robot) => {
                const isOnline = robot.active;
                const robotAssets = robot.assets?.length ? robot.assets : ["EURUSD"];
                const trackerTrades = robot.trades || [];
                const winTrades = trackerTrades.filter((t) => t.result === "WIN").length;
                const lossTrades = trackerTrades.filter((t) => t.result === "LOSS").length;
                const openTrades = trackerTrades.filter((t) => t.result === "OPEN").length;
                const totalTrades = winTrades + lossTrades;
                const winRate = totalTrades > 0 ? ((winTrades / totalTrades) * 100).toFixed(1) : "0.0";
                
                const todayStr = new Date().toISOString().split("T")[0];
                const calculatedTotalPnl = trackerTrades.filter(t => t.result === "WIN" || t.result === "LOSS").reduce((sum, t) => sum + (t.pnl || 0), 0);
                const calculatedDailyPnl = trackerTrades.filter(t => (t.result === "WIN" || t.result === "LOSS") && (t.ts ? new Date(t.ts).toISOString().split("T")[0] === todayStr : true)).reduce((sum, t) => sum + (t.pnl || 0), 0);
                const displayTotalPnl = totalTrades > 0 ? calculatedTotalPnl : (robot.managementState?.totalPnl || 0);
                const displayDailyPnl = totalTrades > 0 ? calculatedDailyPnl : (robot.managementState?.currentDailyPnl || 0);
                
                const fx = robot.forexConfig || {
                  availableValue: 1000,
                  totalValue: 5000,
                  stake: 0.1,
                  stopLoss: 100,
                  goal: 300,
                  leverage: 100,
                  spread: 1.2
                };

                // Realized PNL across trade states
                const currentPnl = trackerTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);

                // Best hours analysis
                const hourStats: Record<number, { wins: number; total: number }> = {};
                trackerTrades.filter(t => t.result === "WIN" || t.result === "LOSS").forEach(t => {
                  const h = new Date(t.ts || Date.now()).getHours();
                  if (!hourStats[h]) hourStats[h] = { wins: 0, total: 0 };
                  hourStats[h].total++;
                  if (t.result === "WIN") hourStats[h].wins++;
                });
                const bestHours = Object.entries(hourStats)
                  .map(([h, s]) => ({ hour: Number(h), wr: s.total > 0 ? (s.wins / s.total) * 100 : 0, total: s.total }))
                  .filter(h => h.total >= 1)
                  .sort((a, b) => b.wr - a.wr)
                  .slice(0, 5);

                // Group trades by local date (YYYY-MM-DD) to calculate Daily Success Rate & Operation Count
                const dailyGroups: Record<string, {
                  dayLabel: string;
                  wins: number;
                  losses: number;
                  total: number;
                  pnl: number;
                  ts: number;
                }> = {};

                trackerTrades.forEach(t => {
                  if (t.result === "OPEN") return;
                  const date = new Date(t.ts);
                  const dayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                  
                  if (!dailyGroups[dayKey]) {
                    const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
                    const w = weekdays[date.getDay()];
                    const day = String(date.getDate()).padStart(2, "0");
                    const month = String(date.getMonth() + 1).padStart(2, "0");
                    
                    dailyGroups[dayKey] = {
                      dayLabel: `${w}, ${day}/${month}`,
                      wins: 0,
                      losses: 0,
                      total: 0,
                      pnl: 0,
                      ts: t.ts
                    };
                  }
                  
                  dailyGroups[dayKey].total++;
                  if (t.result === "WIN") {
                    dailyGroups[dayKey].wins++;
                  } else if (t.result === "LOSS") {
                    dailyGroups[dayKey].losses++;
                  }
                  dailyGroups[dayKey].pnl += (t.pnl || 0);
                });

                const dailyStatsList = Object.entries(dailyGroups)
                  .map(([key, val]) => ({ key, ...val }))
                  .sort((a, b) => b.key.localeCompare(a.key));

                const dailyProgress =
                  robot.management?.dailyGoal > 0
                    ? Math.min(100, ((robot.managementState?.currentDailyPnl || 0) / robot.management.dailyGoal) * 100)
                    : 0;
                const dailyLossProgress =
                  robot.management?.dailyStopLoss > 0
                    ? Math.min(100, (Math.abs(Math.min(0, robot.managementState?.currentDailyPnl || 0)) / robot.management.dailyStopLoss) * 100)
                    : 0;

                const handleClearTrades = (rId: string) => {
                  if (!confirm("Tem a certeza que deseja limpar completamente o histórico de operações deste robô?")) return;
                  clearRobotTrades(rId);
                  clearManagementHistory(rId);
                  resetRobotOnServer(rId);
                  toast.success("Histórico de transações limpo!");
                };

                return (
                  <div
                    key={robot.id}
                    className={`panel rounded-lg overflow-hidden transition-all duration-300 ${
                      isOnline
                        ? "border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.1)]"
                        : "border-border/50 opacity-80"
                    }`}
                  >
                    {/* Header */}
                    <div className={`px-4 py-3 flex items-center justify-between ${isOnline ? "bg-cyan-500/5" : "bg-secondary/20"}`}>
                      <div className="flex items-center gap-3">
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${isOnline ? "bg-cyan-500/20 text-cyan-400" : "bg-muted-foreground/10 text-muted-foreground"}`}>
                          <Cpu className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="font-bold text-sm text-white flex items-center gap-2">
                            {robot.name}
                            {isOnline && <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />}
                            {openTrades > 0 && (
                              <span className="text-[9px] bg-warning/20 text-warning border border-warning/30 px-1.5 rounded-full">
                                {openTrades} aberta{openTrades > 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
                            <code className="text-primary bg-primary/10 px-1 rounded">{robot.strategyId}</code>
                            <span className="flex items-center gap-1 text-muted-foreground/70">
                              <BarChart2 className="h-2.5 w-2.5" />{robotAssets.length} ativo(s)
                            </span>
                            <span className="flex items-center gap-1 text-muted-foreground/70">
                              <Layers className="h-2.5 w-2.5" />{robot.timeframe}
                            </span>
                            <span className="flex items-center gap-1 text-muted-foreground/70">
                              <Clock className="h-2.5 w-2.5" />{robot.durationCandles || 1} velas
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1.5">
                        <div className="flex items-center gap-2">
                          {/* Demo / Real toggle */}
                          <button
                            onClick={() => updateRobot(robot.id, { mode: robot.mode === "demo" ? "real" : "demo" })}
                            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase border transition-all ${robot.mode === "real"
                              ? "bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20"
                              : "bg-cyan-500/10 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/20"
                            }`}
                          >
                            {robot.mode === "real" ? <Wifi className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
                            {robot.mode === "real" ? "REAL" : "DEMO"}
                          </button>
                          {/* Active toggle */}
                          <Switch
                            checked={isOnline}
                            onCheckedChange={(val) => {
                              updateRobot(robot.id, { active: val });
                              toast.info(val ? `Robô "${robot.name}" activado.` : `Robô "${robot.name}" parado.`);
                            }}
                          />
                          {/* Restart robot */}
                          <button
                            type="button"
                            onClick={() => {
                              toast.info(`A reiniciar e a limpar limites diários para o robô "${robot.name}"...`);
                              // Reset daily PNL on server and locally
                              resetRobotDailyOnServer(robot.id);
                              useStore.getState().resetRobotDaily(robot.id);
                              // Toggle active state to force full server-side reboot
                              updateRobot(robot.id, { active: false });
                              setTimeout(() => {
                                updateRobot(robot.id, { active: true });
                                toast.success(`Robô "${robot.name}" reiniciado e pronto para operar.`);
                              }, 1200);
                            }}
                            className="flex items-center justify-center h-7 w-7 rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500 hover:text-white transition-colors"
                            title="Reiniciar Robô (Limpar Limites e Voltar a Operar)"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                          {/* Delete robot */}
                          <button
                            onClick={() => handleDeleteRobot(robot.id)}
                            className="flex items-center justify-center h-7 w-7 rounded border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive hover:text-white transition-colors"
                            title="Apagar Robô"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {isOnline && <RuntimeBadge robotId={robot.id} />}
                      </div>
                    </div>

                    {/* PnL Summary */}
                    <div className="px-4 py-3 grid grid-cols-4 gap-3 border-b border-border/30">
                      <div className="text-center">
                        <div className="text-[9px] text-muted-foreground uppercase">PnL Hoje</div>
                        <div className={`text-sm font-bold ticker ${displayDailyPnl >= 0 ? "text-bull" : "text-bear"}`}>
                          {displayDailyPnl >= 0 ? "+" : ""}${displayDailyPnl.toFixed(2)}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-[9px] text-muted-foreground uppercase">PnL Total</div>
                        <div className={`text-sm font-bold ticker ${displayTotalPnl >= 0 ? "text-bull" : "text-bear"}`}>
                          {displayTotalPnl >= 0 ? "+" : ""}${displayTotalPnl.toFixed(2)}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-[9px] text-muted-foreground uppercase">Win Rate</div>
                        <div className="text-sm font-bold text-white mt-0.5">{winRate}%</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[9px] text-muted-foreground uppercase">Trades</div>
                        <div className="text-sm font-bold text-white mt-0.5">{totalTrades}</div>
                      </div>
                    </div>

                    {/* Daily Progress Bars */}
                    <div className="px-4 py-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <Target className="h-3 w-3 text-bull shrink-0" />
                        <div className="flex-1">
                          <div className="flex justify-between text-[9px] mb-0.5">
                            <span className="text-muted-foreground">Meta Diária</span>
                            <span className="text-bull font-bold">${(robot.managementState?.currentDailyPnl || 0).toFixed(2)} / ${(robot.dailyGoal || robot.management?.dailyGoal || fx.goal)}</span>
                          </div>
                          <div className="h-1.5 bg-border/30 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
                              style={{ width: `${Math.max(0, robot.dailyGoal ? ((robot.managementState?.currentDailyPnl || 0) / robot.dailyGoal) * 100 : dailyProgress)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-3 w-3 text-bear shrink-0" />
                        <div className="flex-1">
                          <div className="flex justify-between text-[9px] mb-0.5">
                            <span className="text-muted-foreground">Stop Loss Diário</span>
                            <span className="text-bear font-bold">${Math.abs(Math.min(0, robot.managementState?.currentDailyPnl || 0)).toFixed(2)} / ${(robot.dailyStopLoss || robot.management?.dailyStopLoss || fx.stopLoss)}</span>
                          </div>
                          <div className="h-1.5 bg-border/30 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-red-500 to-red-400 rounded-full transition-all duration-500"
                              style={{ width: `${robot.dailyStopLoss ? (Math.abs(Math.min(0, robot.managementState?.currentDailyPnl || 0)) / robot.dailyStopLoss) * 100 : dailyLossProgress}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Expandable Config */}
                    <div className="border-t border-border/30">
                      <button
                        type="button"
                        onClick={() => toggleConfig(robot.id)}
                        className="w-full h-9 flex items-center justify-between px-4 text-[10px] text-muted-foreground hover:text-white transition-colors border-b border-border/10"
                      >
                        <span className="flex items-center gap-1.5 font-bold uppercase leading-none">
                          <Settings2 className="h-3.5 w-3.5 text-cyan-400" /> Configurações de Risco & Alavancagem
                        </span>
                        {expandedConfig[robot.id] ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>

                      {expandedConfig[robot.id] && (
                        <div className="px-4 py-4 space-y-4 bg-slate-950/20">
                          {/* Operação */}
                          <div className="space-y-2">
                            <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider border-b border-border/30 pb-1">
                              Operações Forex
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                              {/* Asset list */}
                              <div className="space-y-1 col-span-2 md:col-span-1">
                                <label className="text-[9px] text-muted-foreground font-bold uppercase flex items-center gap-1">
                                  <BarChart2 className="h-2.5 w-2.5 text-cyan-400" /> Ativos
                                </label>
                                <div className="flex flex-wrap gap-1 p-1 bg-secondary/20 rounded border border-border/25 h-8 items-center overflow-x-auto">
                                  {robotAssets.map(a => (
                                    <span key={a} className="text-[9px] bg-cyan-500/10 text-cyan-400 px-1.5 py-0.5 rounded font-mono">{a}</span>
                                  ))}
                                </div>
                              </div>
                              {/* Timeframe selector */}
                              <div className="space-y-1">
                                <label className="text-[9px] text-muted-foreground font-bold uppercase flex items-center gap-1">
                                  <Layers className="h-2.5 w-2.5 text-cyan-400" /> Timeframe
                                </label>
                                <select
                                  value={robot.timeframe}
                                  onChange={(e) => updateRobot(robot.id, { timeframe: e.target.value })}
                                  className="w-full h-8 text-xs bg-slate-900 border border-slate-800 rounded-md px-2 outline-none text-white cursor-pointer"
                                >
                                  {TIMEFRAMES.map((tf) => (
                                    <option key={tf} value={tf}>{tf}</option>
                                  ))}
                                </select>
                              </div>
                              {/* Option direction */}
                              <div className="space-y-1">
                                <label className="text-[9px] text-muted-foreground font-bold uppercase flex items-center gap-1">
                                  <Compass className="h-2.5 w-2.5 text-cyan-400" /> Direção dos Sinais
                                </label>
                                <select
                                  value={robot.strategyDirection || "all"}
                                  onChange={(e) => updateRobot(robot.id, { strategyDirection: e.target.value })}
                                  className="w-full h-8 text-xs bg-slate-900 border border-slate-800 rounded-md px-2 outline-none text-white cursor-pointer"
                                >
                                  <option value="all">BUY & SELL (Ambas)</option>
                                  <option value="buy">Somente BUY (Compra)</option>
                                  <option value="sell">Somente SELL (Venda)</option>
                                </select>
                              </div>
                            </div>
                          </div>

                          {/* Gestão financeira */}
                          <div className="space-y-2 pt-2 border-t border-border/10">
                            <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider border-b border-border/20 pb-1">
                              Gestão Financeira Forex
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              <div className="space-y-1">
                                <label className="text-[9px] text-muted-foreground font-bold uppercase">Meta de Ganho ($)</label>
                                <Input
                                  type="number"
                                  value={robot.management?.dailyGoal || fx.goal}
                                  onChange={(e) => updateRobot(robot.id, { dailyGoal: +e.target.value, management: { ...(robot.management || {} as any), dailyGoal: +e.target.value } })}
                                  className="h-8 text-xs font-mono"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] text-muted-foreground font-bold uppercase">Stop Loss Diário ($)</label>
                                <Input
                                  type="number"
                                  value={robot.management?.dailyStopLoss || fx.stopLoss}
                                  onChange={(e) => updateRobot(robot.id, { dailyStopLoss: +e.target.value, management: { ...(robot.management || {} as any), dailyStopLoss: +e.target.value } })}
                                  className="h-8 text-xs font-mono text-rose-400 border-rose-950"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] text-muted-foreground font-bold uppercase">Lote Base (Lots)</label>
                                <Input
                                  type="number"
                                  value={robot.management?.stake || fx.stake}
                                  onChange={(e) => updateRobot(robot.id, { management: { ...(robot.management || {} as any), stake: +e.target.value } })}
                                  className="h-8 text-xs font-mono"
                                  step={0.01}
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] text-muted-foreground font-bold uppercase">Alavancagem (Leverage)</label>
                                <select
                                  value={robot.forexConfig?.leverage || 100}
                                  onChange={(e) => updateRobot(robot.id, { forexConfig: { ...(robot.forexConfig || {} as any), leverage: +e.target.value } })}
                                  className="w-full h-8 text-xs bg-slate-900 border border-slate-800 rounded-md px-2 outline-none text-white cursor-pointer"
                                >
                                  <option value={50}>1:50</option>
                                  <option value={100}>1:100</option>
                                  <option value={200}>1:200</option>
                                  <option value={500}>1:500</option>
                                  <option value={1000}>1:1000</option>
                                </select>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 pt-2 flex-wrap">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-[10px] h-7 gap-1"
                              onClick={() => { 
                                resetRobotDaily(robot.id); 
                                resetRobotDailyOnServer(robot.id);
                                toast.success("PnL diário reiniciado."); 
                              }}
                            >
                              <RotateCcw className="h-3 w-3" /> Reset Diário
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-[10px] h-7 gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                              onClick={() => handleClearTrades(robot.id)}
                            >
                              <Trash2 className="h-3 w-3" /> Limpar Histórico de Ordens
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Desempenho Diário */}
                    <div className="border-t border-border/30">
                      <button
                        type="button"
                        onClick={() => toggleDaily(robot.id)}
                        className="w-full h-9 flex items-center justify-between px-4 text-[10px] text-muted-foreground hover:text-white transition-colors border-b border-border/10"
                      >
                        <span className="flex items-center gap-1.5 font-bold uppercase leading-none">
                          <BarChart2 className="h-3.5 w-3.5 text-cyan-400" /> Desempenho Diário
                          {dailyStatsList.length > 0 && (
                            <span className="bg-cyan-500/20 text-cyan-400 px-1.5 rounded-full text-[9px] font-mono leading-none">
                              {dailyStatsList.length} d
                            </span>
                          )}
                        </span>
                        {expandedDaily[robot.id] ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>

                      {expandedDaily[robot.id] && (
                        <div className="px-4 py-3 space-y-2 bg-slate-950/20">
                          {dailyStatsList.length === 0 ? (
                            <div className="text-center text-[10px] text-muted-foreground py-4">
                              Nenhum histórico diário disponível ainda.
                            </div>
                          ) : (
                            <div className="space-y-1.5 max-h-60 overflow-y-auto pt-1">
                              <div className="flex justify-between items-center text-[8px] text-muted-foreground uppercase font-bold px-2 pb-1 border-b border-border/10">
                                <span className="w-20">Dia</span>
                                <span className="w-12 text-center">Ops</span>
                                <span className="flex-1 text-center font-semibold">Taxa de Acerto</span>
                                <span className="w-16 text-right">PnL Dia</span>
                              </div>
                              {dailyStatsList.map((s, idx) => {
                                const winPrc = s.total > 0 ? (s.wins / s.total) * 100 : 0;
                                const prevDay = dailyStatsList[idx + 1];
                                const prevWinRate = prevDay && prevDay.total > 0 ? (prevDay.wins / prevDay.total) * 100 : 0;
                                const diff = prevDay ? winPrc - prevWinRate : 0;
                                const changeSymbol = prevDay && Math.abs(diff) >= 1 ? (
                                  diff > 0 ? (
                                    <span className="text-[8px] text-emerald-400 font-bold flex items-center shrink-0" title={`Subiu ${diff.toFixed(1)}%`}>
                                      ▲+{diff.toFixed(0)}%
                                    </span>
                                  ) : (
                                    <span className="text-[8px] text-rose-400 font-bold flex items-center shrink-0" title={`Caiu ${Math.abs(diff).toFixed(1)}%`}>
                                      ▼{diff.toFixed(0)}%
                                    </span>
                                  )
                                ) : null;

                                return (
                                  <div
                                    key={s.key}
                                    className="flex items-center justify-between text-[10px] py-1.5 px-2 rounded hover:bg-white/5 transition-colors border border-border/5"
                                  >
                                    <span className="font-mono text-white w-20 flex flex-col shrink-0">
                                      <span>{s.dayLabel}</span>
                                    </span>
                                    <span className="text-muted-foreground w-12 text-center font-mono shrink-0">
                                      {s.total} ops
                                    </span>
                                    <div className="flex-1 px-3 flex items-center gap-2 min-w-0">
                                      <span className="font-semibold text-white w-10 text-right font-mono shrink-0">
                                        {winPrc.toFixed(1)}%
                                      </span>
                                      <div className="h-1.5 flex-1 bg-red-500/25 rounded-full overflow-hidden flex min-w-[30px]">
                                        <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${winPrc}%` }} />
                                      </div>
                                      <div className="w-10 flex justify-start shrink-0">
                                        {changeSymbol}
                                      </div>
                                    </div>
                                    <span className={`font-bold text-right w-16 font-mono shrink-0 ${s.pnl >= 0 ? "text-bull" : "text-bear"}`}>
                                      {s.pnl >= 0 ? "+" : ""}${s.pnl.toFixed(2)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Best Hours */}
                    {bestHours.length > 0 && (
                      <div className="border-t border-border/30 px-4 py-2 bg-slate-950/20">
                        <div className="text-[9px] text-muted-foreground uppercase font-bold mb-1.5 flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5 text-cyan-400" /> Melhores Horários de Operação
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {bestHours.map(h => (
                            <span key={h.hour} className={`text-[9px] px-2 py-0.5 rounded border ${h.wr >= 60 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : h.wr >= 50 ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" : "bg-secondary/30 text-muted-foreground border-border/30"}`}>
                              {String(h.hour).padStart(2, "0")}:00 — {h.wr.toFixed(0)}% ({h.total} ops)
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Expandable Trade History */}
                    <div className="border-t border-border/30">
                      <button
                        type="button"
                        onClick={() => toggleTrades(robot.id)}
                        className="w-full h-9 flex items-center justify-between px-4 text-[10px] text-muted-foreground hover:text-white transition-colors"
                      >
                        <span className="flex items-center gap-1.5 font-bold uppercase leading-none">
                          <History className="h-3.5 w-3.5 text-cyan-400" /> Histórico Completo de Ordens Forex {trackerTrades.length > 0 && `(${trackerTrades.length})`}
                        </span>
                        {expandedTrades[robot.id] ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>

                      {expandedTrades[robot.id] && (
                        <div className="px-4 pb-3 space-y-2 bg-slate-950/20">
                          <div className="flex gap-1.5 mb-2 flex-wrap pt-1">
                            {trackerTrades.filter(t => t.result !== "OPEN").length > 0 && (
                              <button
                                onClick={() => {
                                  const closed = trackerTrades.filter(t => t.result !== "OPEN").length;
                                  replaceRobotTradesToStats(robot.id);
                                  toast.success(`${closed} operações forex migradas para Estatísticas Globais.`);
                                  setTimeout(() => navigate("/stats"), 1000);
                                }}
                                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded border border-dashed border-cyan-400/40 text-[10px] text-cyan-400 font-bold hover:bg-cyan-400/10 transition-colors"
                              >
                                <BarChart2 className="h-3 w-3" /> Reportar para Estatísticas
                              </button>
                            )}
                            {trackerTrades.filter(t => t.result === "OPEN").length > 0 && (
                              <button
                                onClick={async () => {
                                  toast.info(`Buscando resultado na Deriv para "${robot.name}"...`);
                                  try {
                                    const res = await fetch("/api/trades/recover", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ robotId: robot.id }),
                                    });
                                    const data = await res.json();
                                    await useStore.getState().refreshRobots();
                                    if (data.validated > 0) {
                                      toast.success(`${data.validated} ordem(ns) fechadas com resultado oficial da Deriv!`);
                                    } else {
                                      toast.info("Sincronização concluída com a Deriv.");
                                    }
                                  } catch (e) {
                                    toast.error("Erro ao sincronizar com a Deriv.");
                                  }
                                }}
                                className="flex items-center justify-center gap-1 py-1.5 px-2 rounded border border-dashed border-warning/40 text-[10px] text-warning font-bold hover:bg-warning/10 transition-colors"
                              >
                                <AlertCircle className="h-3 w-3" /> Fechar Ordens Abertas ({trackerTrades.filter(t => t.result === "OPEN").length})
                              </button>
                            )}
                          </div>

                          {trackerTrades.length === 0 ? (
                            <p className="text-[11px] text-slate-500 italic p-3 bg-black/10 border border-border/10 rounded">Nenhuma ordem listada ainda no sandbox do robot. Aguardando sinais do websocket...</p>
                          ) : (
                            <div className="max-h-[160px] overflow-y-auto border border-border/10 rounded-lg bg-black/30 text-[11px] font-mono scrollbar-thin">
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="bg-slate-900/60 sticky top-0 border-b border-border/10 text-slate-400">
                                    <th className="p-2">Data/Hora</th>
                                    <th className="p-2">Ativo</th>
                                    <th className="p-2">Opção</th>
                                    <th className="p-2">Lote (Lots)</th>
                                    <th className="p-2">Entrada</th>
                                    <th className="p-2">Saída</th>
                                    <th className="p-2 text-right">Resultado</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {trackerTrades.map((t) => (
                                    <tr key={t.id} className="border-b border-border/5 hover:bg-white/5">
                                      <td className="p-2 text-slate-500">{new Date(t.ts).toLocaleTimeString()}</td>
                                      <td className="p-2 font-bold text-white">{t.asset}</td>
                                      <td className="p-2">
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${t.type === "CALL" || t.type === "BUY" ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
                                          {t.type}
                                        </span>
                                      </td>
                                      <td className="p-2 font-mono text-slate-300">{t.amount}</td>
                                      <td className="p-2 text-slate-400">${t.entry}</td>
                                      <td className="p-2 text-slate-400">${t.exit || "—"}</td>
                                      <td className={`p-2 text-right font-bold ${t.pnl >= 0 ? "text-bull" : "text-bear"}`}>
                                        {t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(2)} ({t.result})
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── MODAL 1: SCRIPT EDITOR DIALOG ─── */}
        <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
          <DialogContent className="max-w-4xl bg-slate-950 border border-slate-800 text-white shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <Code2 className="h-5 w-5 text-cyan-400" />
                {isEditingMode ? "Editar Código Algorítmico Forex" : "Criar Nova Estratégia Forex"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Escreva o código do seu robô em tempo de execução. O script deve exportar um módulo default com a função <code className="text-cyan-400 font-mono">onTick(ctx)</code>.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-300">ID da Estratégia (deve ser único e herdar metadados)</label>
                <Input
                  disabled={isEditingMode}
                  value={editorId}
                  onChange={(e) => setEditorId(e.target.value)}
                  placeholder="ex: forex_trend_macd"
                  className="bg-slate-900 border-slate-800 text-xs font-mono text-white placeholder:text-slate-600 focus-visible:ring-cyan-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-300">Código Javascript/Typescript do Algoritmo</label>
                <div className="border border-slate-800 rounded-md overflow-hidden bg-slate-950">
                  <textarea
                    value={editorCode}
                    onChange={(e) => setEditorCode(e.target.value)}
                    rows={16}
                    className="w-full bg-slate-900 border-0 p-4 font-mono text-xs text-emerald-400 focus:outline-none focus:ring-1 focus:ring-cyan-500 leading-relaxed scrollbar-thin"
                    spellCheck="false"
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="border-t border-slate-900 pt-3 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsEditorOpen(false)}
                className="bg-slate-900 hover:bg-slate-800 border-slate-800 text-zinc-300 hover:text-white"
              >
                Voltar
              </Button>
              <Button
                onClick={handleSaveStrategy}
                className="bg-cyan-500 text-black hover:bg-cyan-400 font-bold"
              >
                Guardar Código
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>


        {/* ─── MODAL 2: ROBOT CREATION SETUP (HIGHLY SPECIFIC FOREX DIALOG) ─── */}
        <Dialog open={isRobotModalOpen} onOpenChange={setIsRobotModalOpen}>
          <DialogContent className="max-w-2xl bg-slate-950 border border-slate-800 text-white shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <Cpu className="h-5 w-5 text-cyan-400" />
                Configurar e Instanciar Robô Forex
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Instancie a estratégia <span className="text-white font-bold font-mono">"{selectedStrategy?.name}"</span> nas contas cloud do servidor. Defina o ativo, spread, limites e filtros operacionais.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 py-3">
              
              {/* Left Column: Essential Assets & Spread */}
              <div className="flex flex-col gap-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400/90 border-b border-slate-800 pb-1 flex items-center gap-1">
                  Ativos & Execução
                </h4>
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-slate-300 font-medium">Selecionar Par Cambial / Commodity</label>
                  <select
                    className="w-full bg-slate-900 border border-slate-800 rounded-md p-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    value={robotAssetName}
                    onChange={(e) => setRobotAssetName(e.target.value)}
                  >
                    {forexAssets.map((asset) => (
                      <option key={asset.symbol} value={asset.symbol}>
                        {asset.symbol} - {asset.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-slate-900/40 p-3 rounded border border-slate-800/80 flex flex-col gap-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Spread Live Ajustado (Deriv Feed):</span>
                    <span className="text-emerald-400 font-bold font-mono">{currentSpread} Pips</span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    O spread é reativo a WebSockets e serve de base para o motor derivar o desvio na submissão de ordens.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-slate-300 font-medium">Alavancagem Forex Ajustada</label>
                  <select
                    className="w-full bg-slate-900 border border-slate-800 rounded-md p-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    value={robotLeverage}
                    onChange={(e) => setRobotLeverage(Number(e.target.value))}
                  >
                    <option value={50}>1:50</option>
                    <option value={100}>1:100 (Recomendado)</option>
                    <option value={200}>1:200</option>
                    <option value={500}>1:500</option>
                  </select>
                </div>
              </div>

              {/* Right Column: Risk and Available Values */}
              <div className="flex flex-col gap-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400/90 border-b border-slate-800 pb-1 flex items-center gap-1">
                  Capital & Gestão de Risco
                </h4>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-slate-400 font-medium">Saldo Alocado ($)</label>
                    <Input
                      type="number"
                      value={robotAvailableValue}
                      onChange={(e) => setRobotAvailableValue(Number(e.target.value))}
                      className="bg-slate-900 border-slate-800 text-xs text-white p-2"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-slate-400 font-medium">Margem Total ($)</label>
                    <Input
                      type="number"
                      value={robotTotalValue}
                      onChange={(e) => setRobotTotalValue(Number(e.target.value))}
                      className="bg-slate-900 border-slate-800 text-xs text-white p-2"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-slate-300 font-medium">Lote Padrão de Entrada (Lots)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={robotLotSize}
                    onChange={(e) => setRobotLotSize(Number(e.target.value))}
                    className="bg-slate-900 border-slate-800 text-xs text-white"
                  />
                  <span className="text-[10px] text-slate-500">Ex: 0.1 lots correspondem a ≈ 10,000 unidades do ativo basilar.</span>
                </div>

                <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800/80 flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-zinc-400 font-semibold block">Stop Loss (%)</label>
                      <input
                        type="number"
                        className="bg-slate-950 border border-slate-800 text-xs p-1.5 font-bold text-center text-red-400 rounded"
                        value={robotStopLossPercent}
                        onChange={(e) => setRobotStopLossPercent(Number(e.target.value))}
                        min="1"
                        max="100"
                      />
                      <span className="text-[9px] text-zinc-500 text-center font-semibold mt-1">
                        Stop: <strong className="text-red-400">${calculatedStopLossVal.toFixed(1)}</strong>
                      </span>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-zinc-400 font-semibold block">Meta de Lucro (%)</label>
                      <input
                        type="number"
                        className="bg-slate-950 border border-slate-800 text-xs p-1.5 font-bold text-center text-emerald-400 rounded"
                        value={robotGoalPercent}
                        onChange={(e) => SetStateGoalPercentage(e)}
                        min="1"
                        max="500"
                      />
                      <span className="text-[9px] text-zinc-500 text-center font-semibold mt-1">
                        Meta: <strong className="text-emerald-400">${calculatedGoalVal.toFixed(1)}</strong>
                      </span>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* Middle Filter Segment (Filtros operacionais do robô) */}
            <div className="border-t border-slate-800 pt-3 flex flex-col gap-2">
              <h4 className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                <SlidersHorizontal className="h-4 w-4 text-cyan-400" />
                Filtros Inteligentes Opcionais (Prevenção de Falsos Rompimentos)
              </h4>
              <div className="grid grid-cols-3 gap-3 mt-1">
                <div className="flex items-center justify-between p-2.5 bg-slate-900/40 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-300">Filtro RSI Máximo/Mínimo</span>
                  <Switch checked={rsiFilterActive} onCheckedChange={setRsiFilterActive} />
                </div>
                <div className="flex items-center justify-between p-2.5 bg-slate-900/40 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-300">Filtro Cruzamento MACD</span>
                  <Switch checked={macdFilterActive} onCheckedChange={setMacdFilterActive} />
                </div>
                <div className="flex items-center justify-between p-2.5 bg-slate-900/40 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-300">Filtro De Consistência VDV</span>
                  <Switch checked={vdvFilterActive} onCheckedChange={setVdvFilterActive} />
                </div>
              </div>
            </div>

            <DialogFooter className="border-t border-slate-900 pt-3 flex items-center justify-end gap-2 mt-2">
              <Button
                variant="outline"
                onClick={() => setIsRobotModalOpen(false)}
                className="bg-slate-900 hover:bg-slate-800 border-slate-800 text-zinc-300 hover:text-white text-xs"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleConfirmCreateRobot}
                className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs"
              >
                Instanciar Robô Forex
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── MODAL 3: API DOCUMENTATION DIALOG ─── */}
        <Dialog open={isDocOpen} onOpenChange={setIsDocOpen}>
          <DialogContent className="max-w-3xl bg-slate-950 border border-slate-800 text-white shadow-2xl overflow-hidden p-6 flex flex-col max-h-[90vh]">
            <DialogHeader className="pb-4 border-b border-slate-900 shrink-0">
              <DialogTitle className="text-lg font-bold flex items-center gap-2 text-cyan-400">
                <BookOpen className="h-5 w-5" />
                Documentação de Integração da Engine Forex
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Documentação técnica detalhada sobre como o motor Forex lê as velas e executa os sinais. Copie e envie para IAs externas criarem os seus códigos operacionais.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto pt-4 pr-1 space-y-4 font-sans text-xs text-slate-300 leading-relaxed scrollbar-thin">
              <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-3">
                <p>
                  A plataforma **Quantern** utiliza uma arquitetura híbrida ultra otimizada com conexões de baixa latência ao WebSocket da Deriv. Os scripts que cria correm de forma assíncrona nas threads do servidor e geram estatísticas em tempo real.
                </p>
                <p>
                  Para construir estratégias perfeitamente integradas, use o manual abaixo estruturado especificamente para ser fornecido para IAs como **Gemini**, **GPT-4** ou **Claude**. Ele detalha os parâmetros e o resampling de candles da nossa engine.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase text-cyan-400 font-sans">Manual Técnico para Copiar</h4>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(DOC_MARKDOWN);
                      toast.success("Copiado com sucesso para a área de transferência!");
                    }}
                    className="px-3 py-1 bg-cyan-500 text-black font-bold hover:bg-cyan-400 text-[11px] rounded transition-all flex items-center gap-1.5"
                  >
                    <BookOpen className="h-3 w-3" /> Copiar Código
                  </button>
                </div>
                <pre className="bg-black/40 border border-slate-800/80 p-4 rounded-lg font-mono text-[10px] text-emerald-400 leading-relaxed overflow-x-auto max-h-[300px] scrollbar-thin whitespace-pre-wrap">
                  {DOC_MARKDOWN}
                </pre>
              </div>

              <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-3.5 space-y-2">
                <h5 className="font-bold text-cyan-400 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4" /> Entradas Operacionais & Risco
                </h5>
                <p className="text-[11px] text-slate-400 leading-normal">
                  As ordens Forex instanciadas usam a alavancagem configurada para calcular as margens dinamicamente. O Stop Loss percentual e a Meta de Lucro diários protegem sua banca desativando automaticamente o robô envolvido caso qualquer limite de segurança seja atingido na rede.
                </p>
              </div>
            </div>

            <DialogFooter className="border-t border-slate-900 pt-3 flex items-center justify-end shrink-0">
              <Button
                onClick={() => setIsDocOpen(false)}
                className="bg-slate-900 hover:bg-slate-800 border-slate-800 text-white min-w-[80px]"
              >
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </AppShell>
  );

  // Quick Inline State Goal percentage setter helper
  function SetStateGoalPercentage(e: any) {
    setRobotGoalPercent(Number(e.target.value));
  }
}
