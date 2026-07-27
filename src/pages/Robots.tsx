import { AppShell } from "@/components/AppShell";
import { useStore, type RobotConfig } from "@/lib/store";
import { getRobotRuntime, resetRobotOnServer, resetRobotDailyOnServer, resetManagementOnServer } from "@/lib/robotClient";
import { BUILTIN_FILTER_LABELS, BUILTIN_FILTER_TYPES } from "@/strategies";
import { useRobotSocket } from "@/lib/useRobotSocket";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Cpu,
  Power,
  PowerOff,
  Trash2,
  Target,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  History,
  Settings2,
  ArrowUp,
  ArrowDown,
  Monitor,
  Wifi,
  Clock,
  BarChart2,
  Layers,
  Signal,
  AlertCircle,
  Compass,
  SlidersHorizontal,
  Search,
  Copy,
  RefreshCw,
  Loader2,
} from "lucide-react";

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

export default function Robots() {
  const [searchTerm, setSearchTerm] = useState("");
  // FIX: usar o hook reativo do Zustand para garantir re-render após mutações
  const robotsRaw = useStore((s) => s.robots) || [];
  const robots = robotsRaw.filter((r) => r.marketType !== "forex");
  const updateRobot = useStore((s) => s.updateRobot);
  const removeRobot = useStore((s) => s.removeRobot);
  const resetRobotDaily = useStore((s) => s.resetRobotDaily);
  const replaceRobotTradesToStats = useStore((s) => s.replaceRobotTradesToStats);
  const clearRobotTrades = useStore((s) => s.clearRobotTrades);
  const clearManagementHistory = useStore((s) => s.clearManagementHistory);
  const managementHistory = useStore((s) => s.managementHistory) || [];

  const navigate = useNavigate();

  const [isGlobalSyncing, setIsGlobalSyncing] = useState(false);
  const [recoveringRobotIds, setRecoveringRobotIds] = useState<Record<string, boolean>>({});

  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcilingRobotIds, setReconcilingRobotIds] = useState<Record<string, boolean>>({});

  // Periodic cleanup: trigger server Deriv recovery for open trades past duration
  useEffect(() => {
    const iv = setInterval(() => {
      const store = useStore.getState();
      const currentRobots = store.robots || [];
      const hasPastDueOpenTrades = currentRobots.some(robot =>
        (robot.trades || []).some(t => t.result === "OPEN" && (Date.now() - t.ts) > ((t.durationS || 300) * 1000 + 10000))
      );

      if (hasPastDueOpenTrades) {
        console.log("[Robots] Found past-due OPEN trades — triggering server Deriv recovery");
        fetch("/api/trades/recover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
          .then(res => res.json())
          .then(() => store.refreshRobots())
          .catch(() => {});
      }
    }, 10000);
    return () => clearInterval(iv);
  }, []);

  const handleGlobalRecoverTrades = async () => {
    if (isGlobalSyncing) return;
    setIsGlobalSyncing(true);
    toast.info("A consultar a Deriv para validar e fechar operações pendentes...");
    try {
      const res = await fetch("/api/trades/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      await useStore.getState().refreshRobots();
      if (data.validated > 0) {
        toast.success(`${data.validated} operação(ões) pendente(s) foram fechadas com resultado oficial da Deriv!`);
      } else if (data.totalOpen > 0) {
        toast.info(`${data.totalOpen} operação(ões) analisada(s) na Deriv.`);
      } else {
        toast.info("Nenhuma operação pendente para fechar.");
      }
    } catch (err) {
      toast.error("Erro ao sincronizar operações com a Deriv.");
    } finally {
      setIsGlobalSyncing(false);
    }
  };

  const handleRecoverRobotTrades = async (robotId: string, robotName: string) => {
    if (recoveringRobotIds[robotId]) return;
    setRecoveringRobotIds(prev => ({ ...prev, [robotId]: true }));
    toast.info(`Buscando resultado oficial na Deriv para "${robotName}"...`);
    try {
      const res = await fetch("/api/trades/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ robotId }),
      });
      const data = await res.json();
      await useStore.getState().refreshRobots();
      if (data.validated > 0) {
        toast.success(`${data.validated} operação(ões) de "${robotName}" fechada(s) com resultado da Deriv!`);
      } else {
        toast.info(`Operações do robô "${robotName}" sincronizadas com a Deriv.`);
      }
    } catch (err) {
      toast.error(`Falha ao buscar resultado da Deriv para "${robotName}".`);
    } finally {
      setRecoveringRobotIds(prev => ({ ...prev, [robotId]: false }));
    }
  };

  const handleGlobalReconcileTrades = async () => {
    if (isReconciling) return;
    setIsReconciling(true);
    toast.info("Auditando e reavaliando todas as operações no histórico da Deriv...");
    try {
      const res = await fetch("/api/trades/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      await useStore.getState().refreshRobots();
      if (data.totalCorrected > 0) {
        toast.success(`Auditoria concluída! ${data.totalCorrected} operação(ões) corrigida(s) no banco de dados e métricas!`);
      } else {
        toast.success(`Auditoria concluída: ${data.totalInspected} operações inspecionadas na Deriv sem divergências.`);
      }
    } catch (err) {
      toast.error("Erro ao auditar o histórico de operações na Deriv.");
    } finally {
      setIsReconciling(false);
    }
  };

  const handleReconcileRobotTrades = async (robotId: string, robotName: string) => {
    if (reconcilingRobotIds[robotId]) return;
    setReconcilingRobotIds(prev => ({ ...prev, [robotId]: true }));
    toast.info(`Auditando contratos na Deriv para "${robotName}"...`);
    try {
      const res = await fetch("/api/trades/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ robotId }),
      });
      const data = await res.json();
      await useStore.getState().refreshRobots();
      if (data.totalCorrected > 0) {
        toast.success(`${data.totalCorrected} operação(ões) de "${robotName}" corrigida(s) com dados oficiais da Deriv!`);
      } else {
        toast.info(`Histórico de "${robotName}" auditado com sucesso (${data.totalInspected} contratos validados).`);
      }
    } catch (err) {
      toast.error(`Falha ao auditar contratos na Deriv para "${robotName}".`);
    } finally {
      setReconcilingRobotIds(prev => ({ ...prev, [robotId]: false }));
    }
  };

  // Socket connection for real-time updates
  useRobotSocket();
  const [expandedConfig, setExpandedConfig] = useState<Record<string, boolean>>({});
  const [expandedTrades, setExpandedTrades] = useState<Record<string, boolean>>({});
  const [expandedDaily, setExpandedDaily] = useState<Record<string, boolean>>({});

  const toggleConfig = (id: string) =>
    setExpandedConfig((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleTrades = (id: string) =>
    setExpandedTrades((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleDaily = (id: string) =>
    setExpandedDaily((prev) => ({ ...prev, [id]: !prev[id] }));

  /**
   * FIX: handleDelete — corrigido para:
   * 1. Parar o robô primeiro (desactivar) para que o robotClient envie stop-robot ao servidor
   * 2. Usar removeRobot() do store (que usa o middleware persist correctamente)
   * 3. Não usar useStore.setState() directamente (bypassa o persist)
   */
  const handleDelete = (robot: RobotConfig, e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    if (!confirm(`Apagar robô "${robot.name}"? Esta ação é irreversível.`)) return;

    console.log(`[Robots] Deleting robot "${robot.name}" (${robot.id})`);

    // 1. Desactivar primeiro — o robotClient vai enviar stop-robot ao servidor
    //    via o subscriber do store (syncRobotEngine)
    if (robot.active) {
      updateRobot(robot.id, { active: false });
    }

    // 2. Pequeno delay para garantir que o stop-robot é enviado antes de remover
    //    o robô do store (o subscriber do robotClient precisa de ver a mudança)
    setTimeout(() => {
      removeRobot(robot.id);
      console.log(`[Robots] Robot "${robot.name}" removed from store`);
      toast.success(`Robô "${robot.name}" removido.`);
    }, 150);
  };

  /**
   * FIX: handleClearTrades — usa clearRobotTrades do store (hook reactivo)
   * em vez de aceder ao store directamente via getState()
   */
  const handleClearTrades = (robot: RobotConfig) => {
    if (!confirm(`Limpar todo o histórico de "${robot.name}"? Esta ação é irreversível.`)) return;
    console.log(`[Robots] Clearing trades for robot "${robot.name}" (${robot.id})`);
    clearRobotTrades(robot.id);
    clearManagementHistory(robot.id);
    resetRobotOnServer(robot.id);
    toast.success(`Histórico de "${robot.name}" limpo.`);
  };

  const handleCloneRobot = (robot: RobotConfig) => {
    navigate("/strategies", {
      state: {
        cloneRobot: {
          strategyId: robot.strategyId,
          filters: robot.filters,
          globalInvert: robot.globalInvert,
          strategyDirection: robot.strategyDirection,
          sequenceConfig: robot.sequenceConfig,
        },
      },
    });
  };

  const renderRobotCard = (robot: RobotConfig) => {
    const robotAssets = robot.assets?.length ? robot.assets : ((robot as any).asset ? [(robot as any).asset] : ["R_100"]);
    const winTrades = (robot.trades || []).filter((t) => t.result === "WIN").length;
    const lossTrades = (robot.trades || []).filter((t) => t.result === "LOSS").length;
    const openTrades = (robot.trades || []).filter((t) => t.result === "OPEN").length;
    const totalTrades = winTrades + lossTrades;
    const winRate = totalTrades > 0 ? ((winTrades / totalTrades) * 100).toFixed(1) : "0.0";

    const todayStr = new Date().toISOString().split("T")[0];
    const calculatedTotalPnl = (robot.trades || [])
      .filter(t => t.result === "WIN" || t.result === "LOSS")
      .reduce((acc, t) => acc + (t.pnl || 0), 0);
    const calculatedDailyPnl = (robot.trades || [])
      .filter(t => (t.result === "WIN" || t.result === "LOSS") && (t.ts ? new Date(t.ts).toISOString().split("T")[0] === todayStr : true))
      .reduce((acc, t) => acc + (t.pnl || 0), 0);

    const displayTotalPnl = totalTrades > 0 ? calculatedTotalPnl : (robot.managementState?.totalPnl || 0);
    const displayDailyPnl = totalTrades > 0 ? calculatedDailyPnl : (robot.managementState?.currentDailyPnl || 0);

    // Best hours analysis
    const hourStats: Record<number, { wins: number; total: number }> = {};
    (robot.trades || []).filter(t => t.result === "WIN" || t.result === "LOSS").forEach(t => {
      const h = new Date(t.ts || Date.now()).getHours();
      if (!hourStats[h]) hourStats[h] = { wins: 0, total: 0 };
      hourStats[h].total++;
      if (t.result === "WIN") hourStats[h].wins++;
    });
    const bestHours = Object.entries(hourStats)
      .map(([h, s]) => ({ hour: Number(h), wr: s.total > 0 ? (s.wins / s.total) * 100 : 0, total: s.total }))
      .filter(h => h.total >= 2)
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

    (robot.trades || []).forEach(t => {
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

    return (
      <div
        key={robot.id}
        className={`panel rounded-lg overflow-hidden transition-all duration-300 ${robot.active
          ? "border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.1)]"
          : "border-border/50 opacity-80"
          }`}
      >
        {/* ── Header ── */}
        <div className={`px-4 py-3 flex items-center justify-between ${robot.active ? "bg-cyan-500/5" : "bg-secondary/20"}`}>
          <div className="flex items-center gap-3">
            <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${robot.active ? "bg-cyan-500/20 text-cyan-400" : "bg-muted-foreground/10 text-muted-foreground"
              }`}>
              <Cpu className="h-4 w-4" />
            </div>
            <div>
              <div className="font-bold text-sm text-white flex items-center gap-1.5 min-w-0">
                <span className="truncate max-w-[140px]">{robot.name}</span>
                {robot.active && <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />}
                {openTrades > 0 && (
                  <span className="text-[9px] bg-warning/20 text-warning border border-warning/30 px-1.5 rounded-full shrink-0 whitespace-nowrap">
                    {openTrades} aberta{openTrades > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground flex items-center gap-2 flex-wrap min-w-0">
                <code className="text-primary bg-primary/10 px-1 rounded truncate max-w-[120px]">{robot.strategyId}</code>
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
          <div className="flex flex-col items-end gap-1.5 min-w-0 max-w-[45%]">
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              {/* Demo / Real toggle */}
              <button
                onClick={() => updateRobot(robot.id, { mode: robot.mode === "demo" ? "real" : "demo" })}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase border transition-all ${robot.mode === "real"
                  ? "bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20"
                  : "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20"
                  }`}
              >
                {robot.mode === "real" ? <Wifi className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
                {robot.mode === "real" ? "REAL" : "DEMO"}
              </button>
              {/* Active toggle */}
              <Switch
                checked={robot.active}
                onCheckedChange={(v) => {
                  updateRobot(robot.id, { active: v });
                  toast.info(v ? `Robô "${robot.name}" activado.` : `Robô "${robot.name}" parado.`);
                }}
              />
              {/* Clone robot */}
              <button
                type="button"
                onClick={() => handleCloneRobot(robot)}
                className="flex items-center justify-center h-7 w-7 rounded border border-primary/30 bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors"
                title="Clonar Robô"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
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
            </div>
            {robot.active && <RuntimeBadge robotId={robot.id} />}
          </div>
        </div>

        {/* ── PnL Summary ── */}
        <div className="px-4 py-3 grid grid-cols-4 gap-3 border-b border-border/30">
          <div className="text-center">
            <div className="text-[9px] text-muted-foreground uppercase">PnL Hoje</div>
            <div className={`text-sm font-bold ticker ${displayDailyPnl >= 0 ? "text-bull" : "text-bear"}`}>
              {displayDailyPnl >= 0 ? "+" : ""}{displayDailyPnl.toFixed(2)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[9px] text-muted-foreground uppercase">PnL Total</div>
            <div className={`text-sm font-bold ticker ${displayTotalPnl >= 0 ? "text-bull" : "text-bear"}`}>
              {displayTotalPnl >= 0 ? "+" : ""}{displayTotalPnl.toFixed(2)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[9px] text-muted-foreground uppercase">Win Rate</div>
            <div className="text-sm font-bold text-white">{winRate}%</div>
          </div>
          <div className="text-center">
            <div className="text-[9px] text-muted-foreground uppercase">Trades</div>
            <div className="text-sm font-bold text-white">{totalTrades}</div>
          </div>
        </div>

        {/* ── Daily Progress Bars ── */}
        <div className="px-4 py-2 space-y-2">
          <div className="flex items-center gap-2">
            <Target className="h-3 w-3 text-bull shrink-0" />
            <div className="flex-1">
              <div className="flex justify-between text-[9px] mb-0.5">
                <span className="text-muted-foreground">Meta Diária</span>
                <span className="text-bull font-bold">${(robot.managementState?.currentDailyPnl || 0).toFixed(2)} / ${(robot.dailyGoal || robot.management?.dailyGoal || 0)}</span>
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
                <span className="text-bear font-bold">{Math.abs(Math.min(0, robot.managementState?.currentDailyPnl || 0)).toFixed(2)} / ${(robot.dailyStopLoss || robot.management?.dailyStopLoss || 0)}</span>
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

        {/* ── Expandable Config ── */}
        <div className="border-t border-border/30">
          <button
            onClick={() => toggleConfig(robot.id)}
            className="w-full flex items-center justify-between px-4 py-2 text-[10px] text-muted-foreground hover:text-white transition-colors"
          >
            <span className="flex items-center gap-1.5 font-bold uppercase">
              <Settings2 className="h-3 w-3" /> Configurações
            </span>
            {expandedConfig[robot.id] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          {expandedConfig[robot.id] && (
            <div className="px-4 pb-4 space-y-4">

              {/* ── Operação ── */}
              <div className="space-y-2">
                <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider border-b border-border/30 pb-1">
                  Operação
                </div>
                {/* Assets list (read-only, from strategy) */}
                <div className="space-y-1">
                  <label className="text-[9px] text-muted-foreground font-bold uppercase flex items-center gap-1">
                    <BarChart2 className="h-2.5 w-2.5" /> Ativos {robotAssets.length > 0 && <span className="text-[9px] font-mono text-muted-foreground/60">({robotAssets.length})</span>}
                  </label>
                  <div className="flex flex-wrap gap-1 p-2 bg-secondary/20 rounded border border-border/30">
                    {(() => {
                      const assetFilter = robot.filters?.["_asset"];
                      const isFiltered = assetFilter?.enabled;
                      const globalAction = assetFilter?.action || "allow";
                      const assetCfgs = assetFilter?.assetConfigs || [];
                      const optCfgs = assetFilter?.optionConfigs || [];
                      const allowCount = optCfgs.length > 0
                        ? optCfgs.filter((oc: any) => oc.action === "allow" || oc.action === undefined).length
                        : assetCfgs.filter((ac: any) => ac.action === "allow" || ac.action === undefined).length;
                      const ignoreCount = optCfgs.length > 0
                        ? optCfgs.filter((oc: any) => oc.action === "ignore").length
                        : assetCfgs.filter((ac: any) => ac.action === "ignore").length;

                      return (
                        <>
                          {robotAssets.map(a => (
                            <span key={a} className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono">{a}</span>
                          ))}
                          {isFiltered && (
                            <span className="text-[8px] text-muted-foreground/60 italic w-full mt-0.5">
                              {globalAction === "allow"
                                ? `Filtro de ativos: permite todos menos ${ignoreCount} ignorado(s)`
                                : `Filtro de ativos: apenas ${allowCount} ativo(s) permitido(s)`}
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {/* Timeframe */}
                  <div className="space-y-1">
                    <label className="text-[9px] text-muted-foreground font-bold uppercase flex items-center gap-1">
                      <Layers className="h-2.5 w-2.5" /> Time Frame
                    </label>
                    <select
                      value={robot.timeframe}
                      onChange={(e) => updateRobot(robot.id, { timeframe: e.target.value })}
                      className="w-full h-8 text-xs bg-secondary/50 border border-border rounded-md px-2 outline-none text-foreground cursor-pointer"
                    >
                      {TIMEFRAMES.map((tf) => (
                        <option key={tf} value={tf}>{tf}</option>
                      ))}
                    </select>
                  </div>
                  {/* Duration */}
                  <div className="space-y-1">
                    <label className="text-[9px] text-muted-foreground font-bold uppercase flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" /> Duração (velas)
                    </label>
                    <Input
                      type="text"
                      value={robot.durationCandles || 1}
                      onChange={(e) => updateRobot(robot.id, { durationCandles: e.target.value })}
                      className="h-8 text-xs ticker"
                      placeholder="Ex: 1, 2, 1/2, 0.5"
                    />
                  </div>
                  {/* Strategy Direction */}
                  <div className="space-y-1 col-span-2">
                    <label className="text-[9px] text-muted-foreground font-bold uppercase flex items-center gap-1">
                      <Compass className="h-2.5 w-2.5" /> Direção das Ordens (Sinais)
                    </label>
                    <div className="flex bg-secondary/30 border border-border/50 rounded-md overflow-hidden h-8 items-center text-xs w-full">
                      <button
                        type="button"
                        onClick={() => updateRobot(robot.id, { strategyDirection: "all" })}
                        className={`flex-1 h-full font-bold transition-all duration-150 ${(!robot.strategyDirection || robot.strategyDirection === "all") ? "bg-primary text-black" : "text-muted-foreground hover:text-white"}`}
                      >
                        Ambas
                      </button>
                      <button
                        type="button"
                        onClick={() => updateRobot(robot.id, { strategyDirection: "buy" })}
                        className={`flex-1 h-full font-bold transition-all border-x border-border/20 duration-150 ${(robot.strategyDirection === "buy") ? "bg-emerald-500/20 text-emerald-400" : "text-muted-foreground hover:text-white"}`}
                      >
                        Compra (Call/Buy)
                      </button>
                      <button
                        type="button"
                        onClick={() => updateRobot(robot.id, { strategyDirection: "sell" })}
                        className={`flex-1 h-full font-bold transition-all duration-150 ${(robot.strategyDirection === "sell") ? "bg-rose-500/20 text-rose-400" : "text-muted-foreground hover:text-white"}`}
                      >
                        Venda (Put/Sell)
                      </button>
                    </div>
                  </div>
                </div>
                <p className="text-[9px] text-muted-foreground/70 leading-relaxed">
                  Os ativos são definidos pelos filtros da estratégia. O robô opera em todos os ativos listados.
                </p>

                {/* ── Botão de Inversão do Robô ── */}
                <div className="flex items-center justify-between bg-secondary/20 border border-border/30 rounded-sm p-2">
                  <div>
                    <div className="text-[9px] font-bold uppercase flex items-center gap-1 text-amber-400">
                      <span className="text-xs">↔</span> Inversão do Robô
                    </div>
                    <div className="text-[8px] text-muted-foreground mt-0.5">
                      Inverte a ação APÓS o sinal, sem afetar trigger/lógica da estratégia
                    </div>
                  </div>
                  <Switch
                    checked={robot.robotInvert || false}
                    onCheckedChange={(v) => {
                      updateRobot(robot.id, { robotInvert: v });
                      // Atualiza runtime em tempo real via socket
                      const socket = (window as any).__socket;
                      if (socket?.emit) {
                        socket.emit("update-robot-config", { id: robot.id, updates: { robotInvert: v } });
                      }
                    }}
                  />
                </div>
              </div>

              {/* ── Filtros da Estratégia ── */}
              <div className="space-y-2">
                <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider border-b border-border/30 pb-1 flex items-center gap-1">
                  <SlidersHorizontal className="h-2.5 w-2.5" /> Filtros da Estratégia
                  <div className="ml-auto flex items-center gap-1">
                    {robot.globalInvert && (
                      <span className="text-[8px] font-bold bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">
                        Invertido
                      </span>
                    )}
                    {robot.sequenceConfig?.enabled && (
                      <span
                        className="text-[8px] font-bold bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded-full cursor-help"
                        title={
                          `Sequência: max ${robot.sequenceConfig.maxEntradas} entradas` +
                          (robot.sequenceConfig.startLevel && robot.sequenceConfig.startLevel > 1
                            ? ` | opera apenas a partir de #${robot.sequenceConfig.startLevel}`
                            : ` | opera de #1`) +
                          (robot.sequenceConfig.onlyReal ? ` (só ${robot.sequenceConfig.startLevel})` : ` (todas)`) +
                          (robot.sequenceConfig.sequenceInvert ? ` | INVERTER` : ``)
                        }
                      >
                        Seq #{robot.sequenceConfig.startLevel ?? 1}{robot.sequenceConfig.onlyReal ? " only" : ""}{robot.sequenceConfig.sequenceInvert ? " ↺" : ""}
                      </span>
                    )}
                  </div>
                </div>
                {(() => {
                  const filters = robot.filters || {};
                  const enabledFilters = Object.entries(filters).filter(([, f]: [string, any]) => f.enabled);
                  if (enabledFilters.length === 0) {
                    return (
                      <p className="text-[10px] text-muted-foreground/60 italic">
                        Nenhum filtro aplicado — usa todas as condições da estratégia
                      </p>
                    );
                  }
                  return (
                    <div className="space-y-1.5">
                      {enabledFilters.map(([key, filter]: [string, any]) => {
                        const label = BUILTIN_FILTER_LABELS[key] || key;
                        const fType = BUILTIN_FILTER_TYPES[key] || "range";
                        return (
                          <div key={key} className="bg-secondary/10 rounded border border-border/20 p-1.5">
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="text-[9px] font-bold text-white">{label}</span>
                              {filter.direction && filter.direction !== "all" && (
                                <span className={`text-[8px] font-bold px-1 rounded ${filter.direction === "buy" ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}`}>
                                  {filter.direction === "buy" ? "Apenas Compra" : "Apenas Venda"}
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5">
                              {fType === "range" && filter.ranges?.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {filter.ranges.map((r: any, i: number) => (
                                    <span key={i} className={`text-[8px] font-mono px-1 py-0.5 rounded ${r.action === "ignore" ? "bg-rose-500/15 text-rose-300 line-through" : r.action === "invert" ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"}`}>
                                      {r.min} - {r.max}
                                      {r.direction && r.direction !== "all" && (r.direction === "buy" ? " ↑" : " ↓")}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {fType === "select" && filter.value !== undefined && (
                                <span className="text-[9px] font-mono text-primary/80">{String(filter.value)}</span>
                              )}
                              {fType === "multiselect" && filter.values?.length > 0 && (
                                <div className="flex flex-wrap gap-0.5">
                                  {filter.values.map((v: string, i: number) => (
                                    <span key={i} className="text-[8px] bg-primary/10 text-primary/80 px-1 py-0.5 rounded font-mono">{v}</span>
                                  ))}
                                </div>
                              )}
                              {filter.optionConfigs?.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {filter.optionConfigs.map((oc: any, i: number) => (
                                    <span key={i} className={`text-[8px] px-1 py-0.5 rounded font-mono ${oc.action === "ignore" ? "bg-rose-500/15 text-rose-300 line-through" : oc.action === "invert" ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"}`}>
                                      {oc.option}
                                      {oc.action !== "allow" && (oc.action === "ignore" ? " ✕" : oc.action === "invert" ? " ↩" : "")}
                                      {oc.direction && oc.direction !== "all" && (oc.direction === "buy" ? " ↑" : " ↓")}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* ── Gestão Financeira ── */}
              <div className="space-y-2">
                <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider border-b border-border/30 pb-1">
                  Gestão Financeira
                </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[9px] text-muted-foreground font-bold uppercase">Meta Diária ($)</label>
                      <Input
                        type="number"
                        value={robot.dailyGoal || 0}
                        onChange={(e) => updateRobot(robot.id, { dailyGoal: +e.target.value, management: { ...(robot.management || {} as any), dailyGoal: +e.target.value } })}
                        className="h-8 text-xs ticker"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] text-muted-foreground font-bold uppercase">Stop Loss ($)</label>
                      <Input
                        type="number"
                        value={robot.dailyStopLoss || 0}
                        onChange={(e) => updateRobot(robot.id, { dailyStopLoss: +e.target.value, management: { ...(robot.management || {} as any), dailyStopLoss: +e.target.value } })}
                        className="h-8 text-xs ticker text-bear border-bear/30"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] text-muted-foreground font-bold uppercase">Stake Base ($)</label>
                      <Input
                        type="number"
                        value={robot.management?.stake || 0}
                        onChange={(e) => updateRobot(robot.id, { management: { ...(robot.management || {} as any), stake: +e.target.value } })}
                        className="h-8 text-xs ticker"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] text-muted-foreground font-bold uppercase">Payout (%)</label>
                      <Input
                        type="number"
                        value={robot.management?.payout || 0}
                        onChange={(e) => updateRobot(robot.id, { management: { ...(robot.management || {} as any), payout: +e.target.value } })}
                        className="h-8 text-xs ticker"
                      />
                    </div>
                  </div>

                  {/* Staking Mode */}
                  <div className="space-y-1.5 p-2.5 bg-secondary/20 border border-border/30 rounded-sm">
                    <label className="text-[9px] text-muted-foreground font-bold uppercase flex items-center gap-1">
                      <Target className="h-2.5 w-2.5" /> Modo de Aposta Progressiva
                    </label>
                    <div className="flex gap-1.5">
                      {(["fixed", "soros", "reinvest"] as const).map(mode => (
                        <button
                          key={mode}
                          onClick={() => updateRobot(robot.id, { management: { ...(robot.management || {} as any), mode } })}
                          className={`flex-1 py-1 text-[9px] font-bold uppercase rounded border transition-all ${robot.management?.mode === mode
                            ? "bg-primary/20 text-primary border-primary/40"
                            : "bg-secondary/30 text-muted-foreground border-border/30 hover:text-white"
                            }`}
                        >
                          {mode === "fixed" ? "Fixo" : mode === "soros" ? "Soros" : "Reinvestir"}
                        </button>
                      ))}
                    </div>
                    {robot.management?.mode !== "fixed" && (
                      <div className="space-y-1">
                        <label className="text-[9px] text-muted-foreground font-bold uppercase">Stake Máximo ($)</label>
                        <Input
                          type="number"
                          value={robot.management?.sorosMaxStake || 0}
                          onChange={(e) => updateRobot(robot.id, { management: { ...(robot.management || {} as any), sorosMaxStake: +e.target.value } })}
                          className="h-8 text-xs ticker"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Sistema de Gestão Inteligente ── */}
                <div className="space-y-4 pt-4 border-t border-border/30">
                  <div className="flex items-center justify-between bg-primary/10 p-3 rounded-md border border-primary/20">
                    <div>
                      <div className="text-[10px] text-primary uppercase font-bold tracking-wider flex items-center gap-2">
                        <History className="h-3.5 w-3.5" />
                        Ativar Sistema de Gestão
                      </div>
                      <div className="text-[9px] text-muted-foreground mt-0.5">
                        Filtra entradas operando o robô em DEMO e transferindo apenas as validadas.
                      </div>
                    </div>
                    <Switch
                      checked={robot.management?.active || false}
                      onCheckedChange={(v) => updateRobot(robot.id, { management: { ...(robot.management || {} as any), active: v } })}
                    />
                  </div>

                  {robot.management?.active && (
                    <div className="space-y-3 pl-3 border-l-2 border-primary/20">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[10px] font-medium">Conta da Gestão</div>
                          <div className="text-[9px] text-muted-foreground">Conta real ou demo para as entradas filtradas.</div>
                        </div>
                        <div className="flex rounded-md border border-input overflow-hidden">
                          <button
                            onClick={() => updateRobot(robot.id, { management: { ...(robot.management || {} as any), account: "demo" } })}
                            className={`px-3 py-1 text-[10px] font-bold uppercase transition-colors ${
                              (robot.management?.account || "demo") === "demo"
                                ? "bg-accent text-accent-foreground"
                                : "text-muted-foreground hover:bg-secondary"
                            }`}
                          >
                            Demo
                          </button>
                          <button
                            onClick={() => updateRobot(robot.id, { management: { ...(robot.management || {} as any), account: "real" } })}
                            className={`px-3 py-1 text-[10px] font-bold uppercase transition-colors ${
                              robot.management?.account === "real"
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:bg-secondary"
                            }`}
                          >
                            Real
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[10px] font-medium">Entrar após Vitória</div>
                          <div className="text-[9px] text-muted-foreground">Inicia as operações apenas após validar um WIN no rastreio.</div>
                        </div>
                        <Switch
                          checked={robot.management?.entryAfterWin || false}
                          onCheckedChange={(v) => updateRobot(robot.id, { management: { ...(robot.management || {} as any), entryAfterWin: v } })}
                        />
                      </div>

                      <div className="flex items-center gap-2 mt-2">
                        <div className="space-y-1 flex-1">
                          <label className="text-[9px] text-muted-foreground font-bold uppercase">Meta de Ganho ($)</label>
                          <Input
                            type="number"
                            value={robot.management?.dailyGoal || 0}
                            onChange={(e) => updateRobot(robot.id, { dailyGoal: +e.target.value, management: { ...(robot.management || {} as any), dailyGoal: +e.target.value } })}
                            className="h-8 text-xs ticker bg-secondary/50"
                          />
                        </div>
                        <div className="space-y-1 flex-1">
                          <label className="text-[9px] text-muted-foreground font-bold uppercase">Meta de Perdas ($)</label>
                          <Input
                            type="number"
                            value={robot.management?.dailyStopLoss || 0}
                            onChange={(e) => updateRobot(robot.id, { dailyStopLoss: +e.target.value, management: { ...(robot.management || {} as any), dailyStopLoss: +e.target.value } })}
                            className="h-8 text-xs ticker text-bear border-bear/30 bg-secondary/50"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-1 text-[10px] font-medium">Filtro VD</div>
                          <div className="text-[9px] text-muted-foreground">Pausa as operações ao detectar o padrão V-D-V-D.</div>
                        </div>
                        <Switch
                          checked={robot.management?.vdFilter || false}
                          onCheckedChange={(v) => updateRobot(robot.id, { management: { ...(robot.management || {} as any), vdFilter: v } })}
                        />
                      </div>

                      {(robot.managementState?.isPausedByVD || robot.management?.vdFilter) && (
                        <div className="bg-secondary/10 border border-border/50 p-2 rounded-sm space-y-1">
                          {robot.managementState?.isPausedByVD && (
                            <div className="text-[9px] text-warning flex items-center gap-1 font-bold animate-pulse">
                              <RotateCcw className="h-3 w-3" /> PAUSADO POR VD — Aguardando {2 - (robot.managementState?.waitingForWins || 0)} vitórias demo.
                            </div>
                          )}
                          <div className="text-[9px] text-muted-foreground">
                            Ciclo Atual: <span className="font-mono text-white">{robot.managementState?.vdCycle || "---"}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

              <div className="flex items-center gap-2 pt-1 flex-wrap">
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
                  className="text-[10px] h-7 gap-1 text-amber-400 border-amber-400/30 hover:bg-amber-400/10"
                  onClick={() => {
                    resetManagementOnServer(robot.id);
                    clearManagementHistory(robot.id);
                    toast.success("Gestão reiniciada.");
                  }}
                >
                  <RotateCcw className="h-3 w-3" /> Reiniciar Gestão
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[10px] h-7 gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => handleClearTrades(robot)}
                >
                  <Trash2 className="h-3 w-3" /> Eliminar Histórico de Operações
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── Desempenho Diário ── */}
        <div className="border-t border-border/30">
          <button
            onClick={() => toggleDaily(robot.id)}
            className="w-full flex items-center justify-between px-4 py-2 text-[10px] text-muted-foreground hover:text-white transition-colors"
          >
            <span className="flex items-center gap-1.5 font-bold uppercase">
              <BarChart2 className="h-3 w-3 text-cyan-400" /> Desempenho Diário
              {dailyStatsList.length > 0 && (
                <span className="bg-cyan-500/20 text-cyan-400 px-1.5 rounded-full text-[9px] font-mono">
                  {dailyStatsList.length} d
                </span>
              )}
            </span>
            {expandedDaily[robot.id] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          {expandedDaily[robot.id] && (
            <div className="px-4 pb-3 space-y-2">
              {dailyStatsList.length === 0 ? (
                <div className="text-center text-[10px] text-muted-foreground py-4">
                  Nenhum histórico diário disponível ainda.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-60 overflow-y-auto pt-1">
                  <div className="flex justify-between items-center text-[8px] text-muted-foreground uppercase font-bold px-2 pb-1 border-b border-border/10">
                    <span className="w-20">Dia</span>
                    <span className="w-12 text-center">Ops</span>
                    <span className="flex-1 text-center">Taxa de Acerto</span>
                    <span className="w-16 text-right">PnL Dia</span>
                  </div>
                  {dailyStatsList.map((s, idx) => {
                    const winPrc = s.total > 0 ? (s.wins / s.total) * 100 : 0;
                    
                    // Previous day is idx + 1 (since list is from newest to oldest)
                    const prevDay = dailyStatsList[idx + 1];
                    const prevWinRate = prevDay && prevDay.total > 0 ? (prevDay.wins / prevDay.total) * 100 : 0;
                    
                    const diff = prevDay ? winPrc - prevWinRate : 0;
                    const changeSymbol = prevDay && Math.abs(diff) >= 1 ? (
                      diff > 0 ? (
                        <span className="text-[8px] text-bull font-bold flex items-center shrink-0" title={`Subiu ${diff.toFixed(1)}% em relação ao dia anterior`}>
                          ▲+{diff.toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-[8px] text-bear font-bold flex items-center shrink-0" title={`Caiu ${Math.abs(diff).toFixed(1)}% em relação ao dia anterior`}>
                          ▼{diff.toFixed(0)}%
                        </span>
                      )
                    ) : null;

                    return (
                      <div
                        key={s.key}
                        className="flex items-center justify-between text-[10px] py-1.5 px-2 rounded hover:bg-secondary/10 transition-colors border border-border/5"
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
                          <div className="h-1.5 flex-1 bg-bear/25 rounded-full overflow-hidden flex min-w-[30px]">
                            <div className="h-full bg-bull transition-all duration-300" style={{ width: `${winPrc}%` }} />
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

        {/* ── Best Hours ── */}
        {bestHours.length > 0 && (
          <div className="border-t border-border/30 px-4 py-2">
            <div className="text-[9px] text-muted-foreground uppercase font-bold mb-1.5 flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" /> Melhores Horários
            </div>
            <div className="flex flex-wrap gap-1.5">
              {bestHours.map(h => (
                <span key={h.hour} className={`text-[9px] px-2 py-0.5 rounded border ${h.wr >= 60 ? "bg-bull/10 text-bull border-bull/20" : h.wr >= 50 ? "bg-primary/10 text-primary border-primary/20" : "bg-secondary/30 text-muted-foreground border-border/30"
                  }`}>
                  {String(h.hour).padStart(2, "0")}:00 — {h.wr.toFixed(0)}% ({h.total} ops)
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Management PnL ── */}
        {robot.management?.active && (() => {
          const mgmtTrades = managementHistory.filter(t => t.robotId === robot.id);
          const realTrades = mgmtTrades.filter(t => !t.isShadow);
          const mgmtWins = realTrades.filter(t => t.result === "WIN").length;
          const mgmtLosses = realTrades.filter(t => t.result === "LOSS").length;
          const mgmtTotal = mgmtWins + mgmtLosses;
          const mgmtPnl = realTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
          const mgmtWr = mgmtTotal > 0 ? (mgmtWins / mgmtTotal) * 100 : 0;

          return (
            <div className="border-t border-border/30 px-4 py-2">
              <div className="text-[9px] text-muted-foreground uppercase font-bold mb-1.5 flex items-center gap-1">
                <Target className="h-2.5 w-2.5 text-emerald-400" /> Gestão — PnL
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <div className="text-[8px] text-muted-foreground">PnL</div>
                  <div className={`text-[10px] font-bold ${mgmtPnl >= 0 ? "text-bull" : "text-bear"}`}>
                    {mgmtPnl >= 0 ? "+" : ""}${mgmtPnl.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-[8px] text-muted-foreground">Wins</div>
                  <div className="text-[10px] font-bold text-bull">{mgmtWins}</div>
                </div>
                <div>
                  <div className="text-[8px] text-muted-foreground">Losses</div>
                  <div className="text-[10px] font-bold text-bear">{mgmtLosses}</div>
                </div>
                <div>
                  <div className="text-[8px] text-muted-foreground">Win Rate</div>
                  <div className="text-[10px] font-bold text-white">{mgmtWr.toFixed(1)}%</div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Expandable Trade History ── */}
        <div className="border-t border-border/30">
          <button
            onClick={() => toggleTrades(robot.id)}
            className="w-full flex items-center justify-between px-4 py-2 text-[10px] text-muted-foreground hover:text-white transition-colors"
          >
            <span className="flex items-center gap-1.5 font-bold uppercase">
              <History className="h-3 w-3" /> Operações do Robô
              {(robot.trades || []).length > 0 && (
                <span className="bg-primary/20 text-primary px-1.5 rounded-full text-[9px]">
                  {(robot.trades || []).length}
                </span>
              )}
            </span>
            {expandedTrades[robot.id] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          {expandedTrades[robot.id] && (
            <div className="px-4 pb-3 space-y-1">
              {/* Action buttons row */}
              <div className="flex gap-1.5 mb-2 flex-wrap">
                {(robot.trades || []).filter(t => t.result !== "OPEN").length > 0 && (
                  <button
                    onClick={() => {
                      const closed = (robot.trades || []).filter(t => t.result !== "OPEN").length;
                      if (closed === 0) {
                        toast.error("Este robô ainda não possui operações finalizadas para importar.");
                        return;
                      }
                      replaceRobotTradesToStats(robot.id);
                      toast.success(`${closed} operações importadas! Redirecionando para estatísticas...`);
                      setTimeout(() => navigate("/stats"), 1000);
                    }}
                    className="flex-1 min-w-[120px] flex items-center justify-center gap-1.5 py-1.5 rounded border border-dashed border-primary/40 text-[10px] text-primary font-bold hover:bg-primary/10 transition-colors"
                  >
                    <BarChart2 className="h-3 w-3 shrink-0" /> <span>Importar p/ Stats</span>
                  </button>
                )}
                {(robot.trades || []).filter(t => t.result !== "OPEN" && t.metaActive).length > 0 && (
                  <button
                    onClick={() => {
                      const meta = (robot.trades || []).filter(t => t.result !== "OPEN" && t.metaActive).length;
                      if (meta === 0) {
                        toast.error("Este robô não possui operações validadas pelo Meta-Robô.");
                        return;
                      }
                      useStore.getState().importMetaTradesToStats(robot.id);
                      toast.success(`${meta} operações meta importadas!`);
                      setTimeout(() => navigate("/stats"), 1000);
                    }}
                    className="flex-1 min-w-[120px] flex items-center justify-center gap-1.5 py-1.5 rounded border border-dashed border-bull/40 text-[10px] text-bull font-bold hover:bg-bull/10 transition-colors"
                  >
                    <BarChart2 className="h-3 w-3 shrink-0" /> <span>Meta-Estatísticas</span>
                  </button>
                )}
                {(robot.trades || []).filter(t => t.result === "OPEN").length > 0 && (
                  <button
                    disabled={recoveringRobotIds[robot.id]}
                    onClick={() => handleRecoverRobotTrades(robot.id, robot.name)}
                    className="flex items-center justify-center gap-1 py-1.5 px-2 rounded border border-dashed border-warning/40 text-[10px] text-warning font-bold hover:bg-warning/10 transition-colors shrink-0 disabled:opacity-50"
                    title="Forçar busca de resultado na Deriv antes de fechar"
                  >
                    {recoveringRobotIds[robot.id] ? (
                      <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                    ) : (
                      <AlertCircle className="h-3 w-3 shrink-0" />
                    )}
                    Fechar Abertas ({(robot.trades || []).filter(t => t.result === "OPEN").length})
                  </button>
                )}
                {(robot.trades || []).length > 0 && (
                  <button
                    disabled={reconcilingRobotIds[robot.id]}
                    onClick={() => handleReconcileRobotTrades(robot.id, robot.name)}
                    className="flex items-center justify-center gap-1 py-1.5 px-2 rounded border border-dashed border-cyan-500/40 text-[10px] text-cyan-400 font-bold hover:bg-cyan-500/10 transition-colors shrink-0 disabled:opacity-50"
                    title="Auditar e reavaliar todos os contratos deste robô na Deriv para corrigir PnL, Win Rate e Banco de Dados"
                  >
                    {reconcilingRobotIds[robot.id] ? (
                      <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                    ) : (
                      <ShieldCheck className="h-3 w-3 shrink-0" />
                    )}
                    Auditar Deriv
                  </button>
                )}
                <button
                  onClick={() => {
                    resetRobotDaily(robot.id);
                    resetRobotDailyOnServer(robot.id);
                    toast.success("PnL diário reiniciado.");
                  }}
                  className="flex items-center justify-center gap-1 py-1.5 px-2 rounded border border-dashed border-emerald-500/40 text-[10px] text-emerald-400 font-bold hover:bg-emerald-500/10 transition-colors shrink-0"
                  title="Reset Diário"
                >
                  <RotateCcw className="h-3 w-3 shrink-0" /> Reset
                </button>
                {/* FIX: botão "Eliminar Histórico" usa handleClearTrades */}
                {(robot.trades || []).length > 0 && (
                  <button
                    onClick={() => handleClearTrades(robot)}
                    className="flex items-center justify-center gap-1 py-1.5 px-2 rounded border border-dashed border-destructive/40 text-[10px] text-destructive font-bold hover:bg-destructive/10 transition-colors shrink-0"
                    title="Eliminar Histórico de Operações"
                  >
                    <Trash2 className="h-3 w-3 shrink-0" /> Limpar
                  </button>
                )}
              </div>
              <div className="max-h-52 overflow-y-auto no-scrollbar space-y-1">
                {(robot.trades || []).length === 0 && (
                  <div className="text-center text-[10px] text-muted-foreground py-6">
                    Nenhuma operação registada neste robô.
                  </div>
                )}
                {(robot.trades || []).slice(0, 50).map((t) => (
                  <div key={t.id} className={`flex items-center justify-between text-[10px] py-1.5 px-2 rounded ${t.result === "OPEN" ? "bg-warning/5 border border-warning/20" : "bg-secondary/20"
                    }`}>
                    <span className="flex items-center gap-1.5">
                      {t.type === "CALL" || t.type === "BUY" ? (
                        <ArrowUp className="h-3 w-3 text-bull" />
                      ) : (
                        <ArrowDown className="h-3 w-3 text-bear" />
                      )}
                      <span className="font-medium">{t.asset}</span>
                      {t.timeframe && (
                        <span className="text-[8px] text-muted-foreground/60">{t.timeframe}</span>
                      )}
                      <span className="text-[8px] text-muted-foreground/40">
                        {new Date(t.ts || Date.now()).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {t.result === "OPEN" && (
                        <span className="text-[8px] text-warning animate-pulse">ABERTA</span>
                      )}
                    </span>
                    <span className={`font-bold ${t.result === "OPEN"
                      ? "text-warning"
                      : t.warmup
                        ? "text-zinc-500"
                        : (t.pnl ?? 0) >= 0 ? "text-bull" : "text-bear"
                      }`}>
                      {t.result === "OPEN"
                        ? `$${t.amount.toFixed(2)}`
                        : `${(t.pnl ?? 0) >= 0 ? "+" : ""}$${(t.pnl ?? 0).toFixed(2)}${t.warmup ? " (Sombra)" : ""}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-4 py-2 border-t border-border/30 flex items-center justify-between">
          <div className="text-[9px] text-muted-foreground">
            Criado em {new Date(robot.createdAt || Date.now()).toLocaleDateString("pt-BR")}
          </div>
          {/* FIX: botão de apagar robô também no footer para fácil acesso */}
          <button
            type="button"
            onClick={(e) => handleDelete(robot, e)}
            className="flex items-center gap-1 text-[9px] text-destructive/60 hover:text-destructive transition-colors"
            title="Apagar Robô"
          >
            <Trash2 className="h-3 w-3" /> Apagar Robô
          </button>
        </div>
      </div>
    );
  };

  const searchedRobots = robots.filter(r => 
    (r.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.strategyFileName || r.strategyId || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.assets && r.assets.some(a => a.toLowerCase().includes(searchTerm.toLowerCase())))
  );

  const activeRobots = searchedRobots.filter((r) => r.active);
  const inactiveRobots = searchedRobots.filter((r) => !r.active);
  const totalOpenTrades = robots.reduce((acc, r) => acc + (r.trades || []).filter(t => t.result === "OPEN").length, 0);

  return (
    <AppShell>
      <div className="p-4 max-w-6xl mx-auto">
        <header className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div className="w-full md:w-auto">
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Cpu className="h-6 w-6 text-cyan-400" />
              Robôs de Produção
            </h1>
            <p className="text-muted-foreground text-sm mt-1 mb-4">
              Operam de forma autónoma — independente da página activa ou de backtests em curso.
            </p>
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por robô (nome, estratégia, ativo)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-10"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              disabled={isGlobalSyncing}
              onClick={handleGlobalRecoverTrades}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 font-bold text-xs transition-all disabled:opacity-50 shadow-sm"
              title="Forçar consulta à Deriv para fechar todas as operações pendentes/abertas com resultado oficial"
            >
              {isGlobalSyncing ? (
                <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
              ) : (
                <RefreshCw className="h-4 w-4 text-amber-400" />
              )}
              <span>
                Sincronizar / Fechar Abertas Deriv
                {totalOpenTrades > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-extrabold text-[10px]">
                    {totalOpenTrades}
                  </span>
                )}
              </span>
            </button>

            <button
              disabled={isReconciling}
              onClick={handleGlobalReconcileTrades}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 font-bold text-xs transition-all disabled:opacity-50 shadow-sm"
              title="Botão de Contingência: Audita todos os contratos de todos os robôs na Deriv e corrige PnL, taxa de acerto, histórico e banco de dados"
            >
              {isReconciling ? (
                <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
              ) : (
                <ShieldCheck className="h-4 w-4 text-cyan-400" />
              )}
              <span>Auditar / Corrigir Histórico Deriv</span>
            </button>

            <div className="flex items-center gap-3 bg-secondary/30 p-2 rounded-sm border border-border flex-shrink-0">
              <div className="text-right px-2">
                <div className="text-[10px] text-muted-foreground uppercase">Robôs Activos</div>
                <div className="text-lg font-bold text-cyan-400 ticker">{activeRobots.length}</div>
              </div>
              <div className="h-10 w-px bg-border" />
              <div className="text-right px-2">
                <div className="text-[10px] text-muted-foreground uppercase">Total</div>
                <div className="text-lg font-bold text-white ticker">{robots.length}</div>
              </div>
            </div>
          </div>
        </header>

        {robots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center border border-dashed border-border rounded-lg">
            <Cpu className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h2 className="text-lg font-bold text-muted-foreground mb-2">Sem Robôs</h2>
            <p className="text-sm text-muted-foreground/60 max-w-md">
              Vá à página de{" "}
              <span className="text-primary font-bold">Estratégias</span>, configure os filtros
              desejados e clique em{" "}
              <span className="text-cyan-400 font-bold">"Criar Robô"</span> para colocar uma
              estratégia em produção.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {activeRobots.length > 0 && (
              <div>
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Power className="h-3.5 w-3.5 text-cyan-400" /> Robôs Activos ({activeRobots.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeRobots.map(renderRobotCard)}
                </div>
              </div>
            )}

            {inactiveRobots.length > 0 && (
              <div>
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <PowerOff className="h-3.5 w-3.5 text-muted-foreground" /> Robôs Inactivos ({inactiveRobots.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {inactiveRobots.map(renderRobotCard)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
