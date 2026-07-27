import React, { useMemo, useState, useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { useStore, type RobotConfig } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  TrendingDown,
  Target,
  Trash2,
  History,
  LayoutDashboard,
  LineChart,
  FlaskConical,
  BarChart3,
  Play,
  Bug,
  Sigma,
  Bot,
} from "lucide-react";
import {
  LineChart as RechartLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import {
  runManagementSimulation,
  type SimulationFilter,
  type SimulationOutput,
  type SimulationModeResult,
} from "@/lib/managementSimulation";
import {
  calculateOverallStats,
  calculateRobotDeviations,
  runDeviationSimulation,
  type OverallStats,
  type RobotDeviationData,
  type DeviationSimConfig,
  type DeviationSimResult,
} from "@/lib/deviationAnalysis";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPnl(v: number): string {
  return v >= 0 ? `+$${v.toFixed(2)}` : `-$${Math.abs(v).toFixed(2)}`;
}

function pnlColor(v: number): string {
  return v >= 0 ? "text-green-400" : "text-red-400";
}

// ─── Component ───────────────────────────────────────────────────────────────

const ManagementPage: React.FC = () => {
  const { robots = [], managementHistory = [], clearManagementHistory } = useStore();

  // Refresh management data from server on mount
  useEffect(() => {
    const { refreshManagement } = useStore.getState();
    refreshManagement();
    import("../lib/robotClient").then(mod => mod.syncRobotsFromServer());
  }, []);

  // ── Existing monitor state ─────────────────────────────────────────────────
  const [selectedMgmtRobotId, setSelectedMgmtRobotId] = useState<string | null>(null);
  const activeRobotIds = useMemo(() => {
    return new Set(
      robots.filter(r => r.management?.active && r.active).map(r => r.id)
    );
  }, [robots]);

  // ── ROBOT stats: PnL e taxa de acerto de TODAS as operações reais do robô ──
  const robotStats = useMemo(() => {
    let totalPnl = 0;
    let dailyPnl = 0;
    let wins = 0;
    let losses = 0;
    let totalTrades = 0;
    const today = new Date().toISOString().split("T")[0];

    robots.forEach(r => {
      if (!r.active) return;
      const closedTrades = (r.trades || []).filter(
        t => t.result === "WIN" || t.result === "LOSS"
      );
      closedTrades.forEach(t => {
        const tradePnl = t.pnl ?? (t.result === "WIN"
          ? (t.amount || 0) * ((r.management?.payout || 87) / 100)
          : -(t.amount || 0));
        totalPnl += tradePnl;
        totalTrades++;
        if (t.result === "WIN") wins++;
        else losses++;
        // Daily PnL: only trades from today
        const tradeDate = t.ts ? new Date(t.ts).toISOString().split("T")[0] : "";
        if (tradeDate === today) dailyPnl += tradePnl;
      });
    });

    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    return { totalPnl, dailyPnl, wins, losses, winRate, totalTrades };
  }, [robots]);

  // ── MANAGEMENT stats: apenas operações executadas pela gestão (shadow + real) ──
  const stats = useMemo(() => {
    let totalPnl = 0;
    let wins = 0;
    let losses = 0;

    // Win/Loss e PnL vêm das operações reais (não-shadow) registradas na managementHistory
    const realTrades = managementHistory.filter(h => !h.isShadow && activeRobotIds.has(h.robotId));
    realTrades.forEach(h => {
      totalPnl += (h.pnl || 0);
      if (h.result === "WIN") wins++;
      if (h.result === "LOSS") losses++;
    });

    // Se não há histórico salvo no array, fallback para o state do robô
    if (realTrades.length === 0) {
      robots.forEach(r => {
        if (r.management?.active && r.active) {
          totalPnl += r.managementState?.totalPnl || 0;
        }
      });
    }

    const total = wins + losses;
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    return { totalPnl, wins, losses, winRate, totalTrades: total };
  }, [robots, managementHistory, activeRobotIds]);

  const chartData = useMemo(() => {
    let cumulativePnl = 0;
    return managementHistory
      .filter(h => !h.isShadow && activeRobotIds.has(h.robotId))
      .map((h, idx) => {
        cumulativePnl += h.pnl;
        return {
          name: idx + 1,
          pnl: cumulativePnl,
          time: new Date(h.ts || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
      }).slice(-20);
  }, [managementHistory, activeRobotIds]);

  // ── Selected robot management stats ────────────────────────────────────────
  const selectedRobotMgmt = useMemo(() => {
    if (!selectedMgmtRobotId) return null;
    const robot = robots.find(r => r.id === selectedMgmtRobotId);
    const trades = managementHistory.filter(h =>
      h.robotId === selectedMgmtRobotId && !h.isShadow && activeRobotIds.has(h.robotId)
    );
    let wins = 0, losses = 0, pnl = 0;
    trades.forEach(h => {
      if (h.result === "WIN") wins++;
      if (h.result === "LOSS") losses++;
      pnl += h.pnl;
    });
    return { robotName: robot?.name || "---", wins, losses, total: wins + losses, pnl };
  }, [selectedMgmtRobotId, managementHistory, robots, activeRobotIds]);

  // ── Simulation state ───────────────────────────────────────────────────────
  const [selectedRobotId, setSelectedRobotId] = useState("");
  const [simFilter, setSimFilter] = useState<SimulationFilter>({
    entryAfterWin: false,
    entryAfterLoss: false,
    vdFilter: false,
    waitForWinsAfterLoss: 0,
    dailyStopLoss: 0,
    dailyStopGain: 0,
  });
  const [simStake, setSimStake] = useState(10);
  const [simPayout, setSimPayout] = useState(87);
  const [simSorosMax, setSimSorosMax] = useState(0);
  const [simResult, setSimResult] = useState<SimulationOutput | null>(null);

  const selectedRobot = useMemo(
    () => robots.find((r) => r.id === selectedRobotId),
    [robots, selectedRobotId]
  );

  // Pre-fill simulation params when robot is selected
  const handleRobotSelect = (id: string) => {
    setSelectedRobotId(id);
    const robot = robots.find((r) => r.id === id);
    if (robot?.management) {
      setSimStake(robot.management.stake || 10);
      setSimPayout(robot.management.payout || 87);
      setSimSorosMax(robot.management.sorosMaxStake || 0);
      setSimFilter((prev) => ({
        ...prev,
        dailyStopLoss: robot.management?.dailyStopLoss || 0,
        dailyStopGain: robot.management?.dailyGoal || 0,
      }));
    }
    setSimResult(null);
  };

  const handleRunSimulation = () => {
    if (!selectedRobot) return;
    console.log("[Management] selectedRobot trades:", selectedRobot.trades?.length, "closed:", selectedRobot.trades?.filter((t: any) => t.result === "WIN" || t.result === "LOSS").length);
    console.log("[Management] simFilter:", JSON.stringify(simFilter));
    const result = runManagementSimulation(selectedRobot, simFilter);
    console.log("[Management] simulation result:", {
      totalHistoricalTrades: result.totalHistoricalTrades,
      fixedTrades: result.fixed.totalTrades,
      sorosTrades: result.soros.totalTrades,
      reinvestTrades: result.reinvest.totalTrades,
      fixedFirstTrade: result.fixed.trades[0],
      sorosFirstTrade: result.soros.trades[0],
    });
    setSimResult(result);
  };

  // Toggle helper for filter switches
  const toggleFilter = (key: keyof SimulationFilter) => {
    setSimFilter((prev) => ({
      ...prev,
      [key]: typeof prev[key] === "boolean" ? !prev[key] : prev[key],
    }));
    setSimResult(null);
  };

  // ── Sim result detail state ────────────────────────────────────────────────
  const [expandedMode, setExpandedMode] = useState<"fixed" | "soros" | "reinvest" | null>(null);

  return (
    <AppShell>
      <div className="p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-500">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
              <LayoutDashboard className="h-8 w-8 text-blue-500" />
              Gestão Sniper
            </h1>
            <p className="text-muted-foreground">Monitoramento de Shadow Trading e Simulação de Estratégias</p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            className="gap-2"
            onClick={() => clearManagementHistory()}
          >
            <Trash2 className="h-4 w-4" /> Limpar Tudo
          </Button>
        </div>

        {/* ─── TABS ────────────────────────────────────────────────────────── */}
        <Tabs defaultValue="monitor" className="w-full">
          <TabsList className="bg-card w-full justify-start border-b border-border rounded-none h-auto p-0 mb-4 bg-transparent md:w-auto md:flex">
            <TabsTrigger
              value="monitor"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3"
            >
              <LayoutDashboard className="h-4 w-4 mr-2" /> Monitor
            </TabsTrigger>
            <TabsTrigger
              value="simulacao"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3"
            >
              <FlaskConical className="h-4 w-4 mr-2" /> Simulação
            </TabsTrigger>
            <TabsTrigger
              value="desvio"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3"
            >
              <Sigma className="h-4 w-4 mr-2" /> Desvio Padrão
            </TabsTrigger>
          </TabsList>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* TAB 1 — Monitor                                                    */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="monitor" className="m-0 space-y-6">
            {/* ROBOT STATS — PnL de todas as operações reais do robô */}
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Bot className="h-4 w-4 text-blue-400" />
                <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wide">Estatísticas dos Robôs</h3>
                <span className="text-[10px] text-muted-foreground ml-auto">Todas as operações reais executadas</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">PnL Hoje</p>
                  <p className={`text-xl font-bold ${robotStats.dailyPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {robotStats.dailyPnl >= 0 ? "+" : ""}${robotStats.dailyPnl.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">PnL Total</p>
                  <p className={`text-xl font-bold ${robotStats.totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {robotStats.totalPnl >= 0 ? "+" : ""}${robotStats.totalPnl.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Taxa de Acerto</p>
                  <p className="text-xl font-bold text-white">{robotStats.winRate.toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Win/Loss</p>
                  <p className="text-xl font-bold text-white">
                    <span className="text-green-500">{robotStats.wins}</span>
                    <span className="text-muted-foreground mx-1">/</span>
                    <span className="text-red-500">{robotStats.losses}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* MANAGEMENT STATS — apenas operações da gestão */}
            <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Target className="h-4 w-4 text-purple-400" />
                <h3 className="text-sm font-semibold text-purple-400 uppercase tracking-wide">Estatísticas da Gestão</h3>
                <span className="text-[10px] text-muted-foreground ml-auto">Apenas operações filtradas pela gestão</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">PnL Gestão</p>
                  <p className={`text-xl font-bold ${stats.totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {stats.totalPnl >= 0 ? "+" : ""}${stats.totalPnl.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Taxa de Acerto</p>
                  <p className="text-xl font-bold text-white">{stats.winRate.toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Win/Loss Gestão</p>
                  <p className="text-xl font-bold text-white">
                    <span className="text-green-500">{stats.wins}</span>
                    <span className="text-muted-foreground mx-1">/</span>
                    <span className="text-red-500">{stats.losses}</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Robôs com Gestão</p>
                  <p className="text-xl font-bold text-white">
                    {robots.filter(r => r.management?.active && r.active).length}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* CHART */}
              <Card className="lg:col-span-2 bg-zinc-900/50 border-zinc-800">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <History className="h-5 w-5 text-blue-400" />
                    Evolução do Capital
                  </CardTitle>
                  <CardDescription>Visualização dos últimos 20 trades executados pela gestão</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorPnl" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                      <XAxis dataKey="time" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#18181b', border: '#27272a' }}
                        itemStyle={{ color: '#3b82f6' }}
                      />
                      <Area type="monotone" dataKey="pnl" stroke="#3b82f6" fillOpacity={1} fill="url(#colorPnl)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* ROBOT STATUS */}
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardHeader>
                  <CardTitle className="text-lg">Status dos Robôs</CardTitle>
                  <CardDescription>Estado atual de shadow trading e filtros das gestões ativas</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-[300px] overflow-auto">
                    {robots.filter(robot => robot.management?.active && robot.active).map(robot => (
                      <div
                        key={robot.id}
                        className="flex items-center justify-between p-4 border-b border-zinc-800 hover:bg-zinc-800/30 transition-colors"
                      >
                        <div className="space-y-1">
                          <button
                            onClick={() => setSelectedMgmtRobotId(selectedMgmtRobotId === robot.id ? null : robot.id)}
                            className={`text-sm font-medium transition-colors text-left ${
                              selectedMgmtRobotId === robot.id
                                ? "text-primary"
                                : "text-white hover:text-primary"
                            }`}
                          >
                            {robot.name}
                          </button>
                          <div className="flex gap-2">
                            <Badge variant="outline" className="text-[10px] h-4">
                              {robot.management?.mode?.toUpperCase() || "FIXED"}
                            </Badge>
                            {robot.managementState?.isPausedByVD && (
                              <Badge variant="destructive" className="text-[10px] h-4">PAUSA VD</Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-bold ${(robot.managementState?.totalPnl || 0) >= 0 ? "text-green-500" : "text-red-500"}`}>
                            ${(robot.managementState?.totalPnl || 0).toFixed(2)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            VD: {robot.managementState?.vdCycle || "---"}
                          </p>
                        </div>
                      </div>
                    ))}
                    {robots.filter(robot => robot.management?.active && robot.active).length === 0 && (
                      <div className="p-8 text-center text-muted-foreground text-sm">
                        Nenhum robô com gestão sniper ativa.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* RECENT OPERATIONS TABLE */}
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg text-white">Operações Recentes</CardTitle>
                  <CardDescription>Logs de execução da gestão sniper</CardDescription>
                </div>
                {selectedMgmtRobotId && selectedRobotMgmt && (
                  <div className="flex items-center gap-3">
                    <div className="text-right text-xs">
                      <span className="text-muted-foreground">PnL Gestão • </span>
                      <span className={`font-bold ${selectedRobotMgmt.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {selectedRobotMgmt.pnl >= 0 ? "+" : ""}${selectedRobotMgmt.pnl.toFixed(2)}
                      </span>
                      <span className="text-muted-foreground mx-1">|</span>
                      <span className="text-green-500">{selectedRobotMgmt.wins}</span>
                      <span className="text-muted-foreground mx-0.5">/</span>
                      <span className="text-red-500">{selectedRobotMgmt.losses}</span>
                      <span className="text-muted-foreground ml-1">
                        ({selectedRobotMgmt.total > 0 ? ((selectedRobotMgmt.wins / selectedRobotMgmt.total) * 100).toFixed(1) : "0.0"}%)
                      </span>
                    </div>
                    <button
                      onClick={() => setSelectedMgmtRobotId(null)}
                      className="text-[10px] text-muted-foreground hover:text-white border border-border px-2 py-1 rounded transition-colors"
                    >
                      Limpar filtro
                    </button>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-muted-foreground uppercase border-b border-zinc-800">
                      <tr>
                        <th className="px-4 py-3">Robô</th>
                        <th className="px-4 py-3">Ativo</th>
                        <th className="px-4 py-3">Tipo</th>
                        <th className="px-4 py-3">Stake</th>
                        <th className="px-4 py-3">Resultado</th>
                        <th className="px-4 py-3">PnL</th>
                        <th className="px-4 py-3">Modo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {managementHistory
                        .filter(trade => activeRobotIds.has(trade.robotId))
                        .filter(trade => !selectedMgmtRobotId || trade.robotId === selectedMgmtRobotId)
                        .slice().reverse().map((trade) => (
                        <tr key={trade.id} className="hover:bg-zinc-800/50 transition-colors">
                          <td className="px-4 py-3 font-medium text-zinc-300">{trade.robotName}</td>
                          <td className="px-4 py-3 text-zinc-400">{trade.asset}</td>
                          <td className="px-4 py-3">
                            <Badge className={trade.type === "CALL" ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500"}>
                              {trade.type}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-zinc-300">${trade.amount.toFixed(2)}</td>
                          <td className="px-4 py-3">
                            <Badge className={trade.result === "WIN" ? "bg-green-600" : "bg-red-600"}>
                              {trade.result}
                            </Badge>
                          </td>
                          <td className={`px-4 py-3 font-bold ${trade.pnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                            {trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="text-zinc-500">
                              {trade.isShadow ? "SHADOW WIN" : "DIRECT"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                      {managementHistory.filter(trade => activeRobotIds.has(trade.robotId) && (!selectedMgmtRobotId || trade.robotId === selectedMgmtRobotId)).length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                            {selectedMgmtRobotId
                              ? "Nenhuma operação da gestão para este robô ainda."
                              : "Aguardando primeira execução sniper..."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* TAB 2 — Simulação                                                  */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="simulacao" className="m-0 space-y-6">
            {/* CONFIGURATION CARD */}
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FlaskConical className="h-5 w-5 text-purple-400" />
                  Simular Gestão sobre Histórico
                </CardTitle>
                <CardDescription>
                  Selecione um robô e configure os filtros para simular quanto cada modo de gestão teria rendido
                  sobre as operações reais do robô.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Robot selector + params */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Robô</Label>
                    <Select value={selectedRobotId} onValueChange={handleRobotSelect}>
                      <SelectTrigger className="bg-zinc-800/50 border-zinc-700">
                        <SelectValue placeholder="Selecione um robô..." />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700">
                        {robots.map((r) => {
                          const closedCount = (r.trades || []).filter(t => t.result === "WIN" || t.result === "LOSS").length;
                          return (
                            <SelectItem key={r.id} value={r.id}>
                              <span className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full inline-block ${r.active ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]" : "bg-zinc-600"}`} />
                                <span>{r.name}</span>
                                <span className="text-muted-foreground text-xs ml-auto tabular-nums">{closedCount} ops</span>
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Stake Base ($)</Label>
                    <Input
                      type="number"
                      className="bg-zinc-800/50 border-zinc-700 h-10"
                      value={simStake}
                      onChange={(e) => { setSimStake(Number(e.target.value)); setSimResult(null); }}
                      min={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Payout (%)</Label>
                    <Input
                      type="number"
                      className="bg-zinc-800/50 border-zinc-700 h-10"
                      value={simPayout}
                      onChange={(e) => { setSimPayout(Number(e.target.value)); setSimResult(null); }}
                      min={1}
                      max={100}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Soros Max Stake ($)</Label>
                    <Input
                      type="number"
                      className="bg-zinc-800/50 border-zinc-700 h-10"
                      value={simSorosMax}
                      onChange={(e) => { setSimSorosMax(Number(e.target.value)); setSimResult(null); }}
                      min={0}
                    />
                  </div>
                </div>

                {/* Filters */}
                <div>
                  <Label className="text-xs text-muted-foreground block mb-3">Filtros de Entrada</Label>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="accent-blue-500 w-4 h-4"
                        checked={simFilter.vdFilter}
                        onChange={() => toggleFilter("vdFilter")}
                      />
                      <span className="text-sm text-zinc-300">Filtro VD (pausa após VDVD)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="accent-blue-500 w-4 h-4"
                        checked={simFilter.entryAfterWin}
                        onChange={() => toggleFilter("entryAfterWin")}
                      />
                      <span className="text-sm text-zinc-300">Entrar após Vitória</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="accent-blue-500 w-4 h-4"
                        checked={simFilter.entryAfterLoss}
                        onChange={() => toggleFilter("entryAfterLoss")}
                      />
                      <span className="text-sm text-zinc-300">Entrar após Derrota</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <Label className="text-sm text-zinc-300 whitespace-nowrap">
                        Esperar N wins após derrota:
                      </Label>
                      <Input
                        type="number"
                        className="bg-zinc-800/50 border-zinc-700 h-8 w-16"
                        value={simFilter.waitForWinsAfterLoss}
                        onChange={(e) => {
                          setSimFilter((prev) => ({ ...prev, waitForWinsAfterLoss: Number(e.target.value) }));
                          setSimResult(null);
                        }}
                        min={0}
                        max={10}
                      />
                    </div>
                  </div>
                </div>

                {/* Daily stop loss/gain */}
                <div>
                  <Label className="text-xs text-muted-foreground block mb-3">Limites Diários</Label>
                  <div className="flex flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm text-zinc-300 whitespace-nowrap">
                        Stop Loss Diário ($):
                      </Label>
                      <Input
                        type="number"
                        className="bg-zinc-800/50 border-zinc-700 h-8 w-20"
                        value={simFilter.dailyStopLoss}
                        onChange={(e) => {
                          setSimFilter((prev) => ({ ...prev, dailyStopLoss: Number(e.target.value) }));
                          setSimResult(null);
                        }}
                        min={0}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-sm text-zinc-300 whitespace-nowrap">
                        Stop Gain Diário ($):
                      </Label>
                      <Input
                        type="number"
                        className="bg-zinc-800/50 border-zinc-700 h-8 w-20"
                        value={simFilter.dailyStopGain}
                        onChange={(e) => {
                          setSimFilter((prev) => ({ ...prev, dailyStopGain: Number(e.target.value) }));
                          setSimResult(null);
                        }}
                        min={0}
                      />
                    </div>
                  </div>
                </div>

                {/* Run button */}
                <Button
                  className="gap-2 w-full md:w-auto"
                  disabled={!selectedRobot}
                  onClick={handleRunSimulation}
                >
                  <Play className="h-4 w-4" /> Rodar Gestão
                </Button>
              </CardContent>
            </Card>

            {/* RESULTS */}
            {simResult && (
              <>
                {/* Summary line */}
                <p className="text-sm text-muted-foreground">
                  Baseado em <span className="text-white font-medium">{simResult.totalHistoricalTrades}</span> operações
                  do robô <span className="text-white font-medium">{simResult.robotName}</span>
                </p>

                {/* 3 Result Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <SimModeCard result={simResult.fixed} />
                  <SimModeCard result={simResult.soros} />
                  <SimModeCard result={simResult.reinvest} />
                </div>

                {/* PnL Evolution Chart */}
                <Card className="bg-zinc-900/50 border-zinc-800">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <LineChart className="h-5 w-5 text-blue-400" />
                      Evolução do PnL na Simulação
                    </CardTitle>
                    <CardDescription>Comparativo do lucro acumulado por modo de gestão</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[300px]">
                    <SimChart result={simResult} />
                  </CardContent>
                </Card>

                {/* Comparison table */}
                <Card className="bg-zinc-900/50 border-zinc-800">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-emerald-400" />
                      Comparativo Detalhado
                    </CardTitle>
                    <CardDescription>Resumo numérico dos 3 modos lado a lado</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-muted-foreground uppercase border-b border-zinc-800">
                          <tr>
                            <th className="px-4 py-3">Métrica</th>
                            <th className="px-4 py-3 text-center">Fixo</th>
                            <th className="px-4 py-3 text-center">Soros</th>
                            <th className="px-4 py-3 text-center">Reinvest</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                          <SimRow label="Trades Executados" value={(r) => String(r.totalTrades)} result={simResult} />
                          <SimRow label="Wins" value={(r) => String(r.wins)} result={simResult} />
                          <SimRow label="Losses" value={(r) => String(r.losses)} result={simResult} />
                          <SimRow label="Win Rate" value={(r) => `${r.winRate}%`} result={simResult} />
                          <SimRow label="PnL Final" value={(r) => formatPnl(r.finalPnl)} result={simResult} colorize />
                          <SimRow label="Max Drawdown" value={(r) => `$${r.maxDrawdown.toFixed(2)}`} result={simResult} />
                          <SimRow label="Drawdown %" value={(r) => `${r.drawdownPercent}%`} result={simResult} />
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* Expandable detail tables per mode */}
                <div className="grid grid-cols-1 gap-4">
                  {(["fixed", "soros", "reinvest"] as const).map((modeKey) => {
                    const modeResult = simResult[modeKey];
                    const isExpanded = expandedMode === modeKey;
                    const label = modeResult.label;
                    return (
                      <Card key={modeKey} className="bg-zinc-900/50 border-zinc-800">
                        <CardHeader
                          className="cursor-pointer select-none"
                          onClick={() => setExpandedMode(isExpanded ? null : modeKey)}
                        >
                          <CardTitle className="text-md flex items-center justify-between">
                            <span>Detalhes — {label}</span>
                            <Badge variant="outline" className="text-xs">
                              {isExpanded ? "Recolher" : "Expandir"} ({modeResult.trades.length} passos)
                            </Badge>
                          </CardTitle>
                        </CardHeader>
                        {isExpanded && (
                          <CardContent className="p-0 max-h-[400px] overflow-auto">
                            <table className="w-full text-sm text-left">
                              <thead className="text-xs text-muted-foreground uppercase border-b border-zinc-800 sticky top-0 bg-zinc-900">
                                <tr>
                                  <th className="px-3 py-2">#</th>
                                  <th className="px-3 py-2">Ativo</th>
                                  <th className="px-3 py-2">Tipo</th>
                                  <th className="px-3 py-2">Resultado</th>
                                  <th className="px-3 py-2">Stake</th>
                                  <th className="px-3 py-2">PnL</th>
                                  <th className="px-3 py-2">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-800">
                                {modeResult.trades.map((step) => (
                                  <tr key={step.index} className={`hover:bg-zinc-800/30 transition-colors ${step.skipped ? "opacity-50" : ""}`}>
                                    <td className="px-3 py-1.5 text-zinc-500">{step.index + 1}</td>
                                    <td className="px-3 py-1.5 text-zinc-300">{step.asset}</td>
                                    <td className="px-3 py-1.5">
                                      <Badge className={step.type === "CALL" ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500"}>
                                        {step.type}
                                      </Badge>
                                    </td>
                                    <td className="px-3 py-1.5">
                                      <Badge className={step.result === "WIN" ? "bg-green-600" : "bg-red-600"}>
                                        {step.result}
                                      </Badge>
                                    </td>
                                    <td className="px-3 py-1.5 text-zinc-300">${step.stake.toFixed(2)}</td>
                                    <td className={`px-3 py-1.5 font-medium ${step.pnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                                      {step.skipped ? "—" : formatPnl(step.pnl)}
                                    </td>
                                    <td className="px-3 py-1.5">
                                      {step.skipped ? (
                                        <Badge variant="outline" className="text-amber-500 border-amber-500/30 text-[10px]">
                                          {step.skipReason || "Skipped"}
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-green-500 border-green-500/30 text-[10px]">
                                          Executado
                                        </Badge>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </CardContent>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </>
            )}

            {/* No result yet */}
            {!simResult && selectedRobot && (
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Bug className="h-8 w-8 mx-auto mb-3 opacity-30" />
                  <p>Configure os filtros e clique em <span className="text-white">Rodar Gestão</span> para simular.</p>
                  <p className="text-xs mt-1">
                    {selectedRobot.trades?.length || 0} operações no histórico do robô
                    {selectedRobot.trades ? ` (${selectedRobot.trades.filter(t => t.result === "WIN" || t.result === "LOSS").length} fechadas)` : ""}
                  </p>
                </CardContent>
              </Card>
            )}

            {!selectedRobot && (
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <FlaskConical className="h-8 w-8 mx-auto mb-3 opacity-30" />
                  <p>Selecione um robô acima para começar a simulação.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* TAB 3 — Desvio Padrão                                              */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="desvio" className="m-0 space-y-6">
            <DeviationTab robots={robots} />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function SimModeCard({ result }: { result: SimulationModeResult }) {
  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{result.label}</CardTitle>
          <Badge variant="outline" className="text-[10px]">
            {result.totalTrades} trades
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-xs text-muted-foreground">PnL Final</p>
          <p className={`text-2xl font-bold ${pnlColor(result.finalPnl)}`}>
            {formatPnl(result.finalPnl)}
          </p>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Win Rate</span>
          <span className="text-white font-medium">{result.winRate}%</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Wins / Losses</span>
          <span className="text-white font-medium">
            <span className="text-green-500">{result.wins}</span>
            <span className="text-muted-foreground mx-1">/</span>
            <span className="text-red-500">{result.losses}</span>
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Max Drawdown</span>
          <span className="text-red-400 font-medium">${result.maxDrawdown.toFixed(2)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function SimChart({ result }: { result: SimulationOutput }) {
  // Build cumulative PnL data
  const maxLen = Math.max(
    result.fixed.trades.length,
    result.soros.trades.length,
    result.reinvest.trades.length
  );

  const chartData = [];
  let cumFixed = 0;
  let cumSoros = 0;
  let cumReinvest = 0;

  for (let i = 0; i < maxLen; i++) {
    const fStep = result.fixed.trades[i];
    const sStep = result.soros.trades[i];
    const rStep = result.reinvest.trades[i];

    if (fStep && !fStep.skipped) cumFixed += fStep.pnl;
    if (sStep && !sStep.skipped) cumSoros += sStep.pnl;
    if (rStep && !rStep.skipped) cumReinvest += rStep.pnl;

    chartData.push({
      name: i + 1,
      fixed: Number(cumFixed.toFixed(2)),
      soros: Number(cumSoros.toFixed(2)),
      reinvest: Number(cumReinvest.toFixed(2)),
    });
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartLineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis dataKey="name" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
        <Tooltip
          contentStyle={{ backgroundColor: '#18181b', border: '#27272a' }}
          itemStyle={{ color: '#3b82f6' }}
        />
        <Line type="monotone" dataKey="fixed" stroke="#3b82f6" strokeWidth={2} dot={false} name="Fixo" />
        <Line type="monotone" dataKey="soros" stroke="#10b981" strokeWidth={2} dot={false} name="Soros" />
        <Line type="monotone" dataKey="reinvest" stroke="#f59e0b" strokeWidth={2} dot={false} name="Reinvest" />
      </RechartLineChart>
    </ResponsiveContainer>
  );
}

function SimRow({
  label,
  value,
  result,
  colorize,
}: {
  label: string;
  value: (r: SimulationModeResult) => string;
  result: SimulationOutput;
  colorize?: boolean;
}) {
  return (
    <tr className="hover:bg-zinc-800/30 transition-colors">
      <td className="px-4 py-2 text-zinc-300 font-medium">{label}</td>
      {(["fixed", "soros", "reinvest"] as const).map((key) => {
        const v = value(result[key]);
        const isNeg = colorize && v.startsWith("-");
        const isPos = colorize && v.startsWith("+");
        return (
          <td
            key={key}
            className={`px-4 py-2 text-center font-medium ${
              colorize
                ? isNeg ? "text-red-400" : isPos ? "text-green-400" : "text-white"
                : "text-white"
            }`}
          >
            {v}
          </td>
        );
      })}
    </tr>
  );
}

// ─── Deviation Tab Component ──────────────────────────────────────────────────

function DeviationTab({ robots }: { robots: RobotConfig[] }) {
  // Memoized stats
  const overall = useMemo(() => calculateOverallStats(robots), [robots]);
  const robotDeviations = useMemo(
    () => calculateRobotDeviations(robots, overall),
    [robots, overall],
  );

  // State
  const [devSelectedId, setDevSelectedId] = useState("");
  const [devLearningSize, setDevLearningSize] = useState(600);
  const [devWindow, setDevWindow] = useState(30);
  const [devThreshold, setDevThreshold] = useState(1.5);
  const [devMode, setDevMode] = useState<"below" | "above" | "both">("below");
  const [devStake, setDevStake] = useState(10);
  const [devPayout, setDevPayout] = useState(87);
  const [devInvert, setDevInvert] = useState(false);
  const [devFilterEntryWin, setDevFilterEntryWin] = useState(false);
  const [devFilterEntryLoss, setDevFilterEntryLoss] = useState(false);
  const [devFilterVd, setDevFilterVd] = useState(false);
  const [devDailySL, setDevDailySL] = useState(0);
  const [devDailySG, setDevDailySG] = useState(0);
  const [devResult, setDevResult] = useState<DeviationSimResult | null>(null);
  const [devExpandedTrade, setDevExpandedTrade] = useState(false);
  const [devActiveTab, setDevActiveTab] = useState("stats");

  const devSelectedRobot = useMemo(
    () => robots.find((r) => r.id === devSelectedId),
    [devSelectedId, robots],
  );

  const handleDevRunSim = () => {
    if (!devSelectedRobot) return;
    const config: DeviationSimConfig = {
      learningSize: devLearningSize,
      windowSize: devWindow,
      threshold: devThreshold,
      thresholdMode: devMode,
      stake: devStake,
      payout: devPayout,
      invertOnPositive: devInvert,
      filters: {
        entryAfterWin: devFilterEntryWin,
        entryAfterLoss: devFilterEntryLoss,
        vdFilter: devFilterVd,
        dailyStopLoss: devDailySL,
        dailyStopGain: devDailySG,
      },
    };
    const result = runDeviationSimulation(devSelectedRobot, config);
    setDevResult(result);
  };

  // Color helpers
  const zScoreColor = (z: number) => {
    if (z >= 2) return "text-green-400";
    if (z >= 1) return "text-emerald-400";
    if (z <= -2) return "text-red-400";
    if (z <= -1) return "text-orange-400";
    return "text-zinc-300";
  };

  const sigmaBarPercent = (z: number) => {
    // Map -3..+3 to 0..100%
    return ((z + 3) / 6) * 100;
  };

  return (
    <div className="space-y-6">
      {/* ── Sub-tabs: Stats | Simulation ── */}
      <Tabs value={devActiveTab} onValueChange={setDevActiveTab} className="w-full">
        <TabsList className="bg-card border-b border-border rounded-none h-auto p-0 bg-transparent">
          <TabsTrigger
            value="stats"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3"
          >
            <BarChart3 className="h-4 w-4 mr-2" /> Estatísticas
          </TabsTrigger>
          <TabsTrigger
            value="simulacao"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3"
          >
            <Play className="h-4 w-4 mr-2" /> Simulação por Desvio
          </TabsTrigger>
        </TabsList>

        {/* ════════════════════════════════════════ */}
        {/* SUB-TAB 1: Statistics                    */}
        {/* ════════════════════════════════════════ */}
        <TabsContent value="stats" className="m-0 space-y-6 pt-4">
          {overall.qualifyingRobots === 0 ? (
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="py-12 text-center text-muted-foreground">
                <BarChart3 className="h-8 w-8 mx-auto mb-3 opacity-30" />
                <p>Nenhum robô com 600+ operações fechadas encontrado.</p>
                <p className="text-xs mt-1">
                  Os robôs precisam de no mínimo 600 trades fechados para análise estatística.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Global Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-zinc-900/50 border-zinc-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground">
                      Taxa Média
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-white">
                      {overall.meanWinRate}%
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Média de {overall.qualifyingRobots} robôs
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-zinc-900/50 border-zinc-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground">
                      Desvio Padrão (σ)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-400">
                      {overall.stdDev}%
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Dispersão das taxas
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-zinc-900/50 border-zinc-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground">
                      Desvio Médio
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-purple-400">
                      {overall.meanDeviation}%
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Desvio absoluto médio
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-zinc-900/50 border-zinc-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground">
                      Mediana
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-emerald-400">
                      {overall.medianWinRate}%
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Min {overall.minWinRate}% / Max {overall.maxWinRate}%
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Scale Visualization */}
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Sigma className="h-5 w-5 text-blue-400" />
                    Escala de Desvio Padrão (−3σ a +3σ)
                  </CardTitle>
                  <CardDescription>
                    Posição de cada robô em relação à média global ({overall.meanWinRate}%)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Scale bar */}
                  <div className="relative h-16 mb-6">
                    {/* Gradient bar */}
                    <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-red-500/30 via-zinc-700 to-green-500/30 border border-zinc-700" />
                    {/* Tick marks */}
                    {[-3, -2, -1, 0, 1, 2, 3].map((sigma) => {
                      const pct = sigmaBarPercent(sigma);
                      return (
                        <div
                          key={sigma}
                          className="absolute top-0 h-full flex flex-col items-center"
                          style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
                        >
                          <div className="h-3 w-0.5 bg-zinc-500 mt-1" />
                          <span className="text-[10px] text-zinc-400 mt-auto mb-1">
                            {sigma > 0 ? `+${sigma}` : sigma}σ
                          </span>
                        </div>
                      );
                    })}
                    {/* Robot dots */}
                    {robotDeviations.map((rd) => {
                      const clamped = Math.max(-3, Math.min(3, rd.zScore));
                      const pct = sigmaBarPercent(clamped);
                      return (
                        <div
                          key={rd.robotId}
                          className="absolute bottom-0 w-2 h-2 rounded-full cursor-pointer group"
                          style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
                          title={`${rd.robotName}: ${rd.winRate}% (z=${rd.zScore})`}
                        >
                          <div
                            className={`w-2.5 h-2.5 rounded-full ${
                              rd.zScore >= 0
                                ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]"
                                : "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]"
                            }`}
                          />
                          {/* Tooltip on hover */}
                          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 hidden group-hover:block bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs whitespace-nowrap z-10">
                            <p className="text-white font-medium">{rd.robotName}</p>
                            <p className="text-zinc-400">{rd.winRate}% (z={rd.zScore})</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Legend */}
                  <div className="flex items-center gap-4 text-xs text-zinc-400">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-red-500" /> Abaixo da média
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-green-500" /> Acima da média
                    </span>
                    <span className="text-zinc-600">
                          | {robotDeviations.length} robôs com 600+ trades
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Robot Detail Table */}
                  <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <BarChart3 className="h-5 w-5 text-blue-400" />
                        Robôs Qualificados (≥600 trades)
                      </CardTitle>
                      <CardDescription>
                        {robotDeviations.length} robôs analisados de {robots.length} total
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                          <thead className="text-xs text-muted-foreground uppercase border-b border-zinc-800">
                            <tr>
                              <th className="px-4 py-3">#</th>
                              <th className="px-4 py-3">Robô</th>
                              <th className="px-4 py-3 text-right">Trades</th>
                              <th className="px-4 py-3 text-right">Wins</th>
                              <th className="px-4 py-3 text-right">Losses</th>
                              <th className="px-4 py-3 text-right">Win Rate</th>
                              <th className="px-4 py-3 text-right">z-Score</th>
                              <th className="px-4 py-3 text-center">Desvio</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800">
                            {robotDeviations.map((rd, idx) => (
                              <tr key={rd.robotId} className="hover:bg-zinc-800/30 transition-colors">
                                <td className="px-4 py-2 text-zinc-500">{idx + 1}</td>
                                <td className="px-4 py-2 text-white font-medium">{rd.robotName}</td>
                                <td className="px-4 py-2 text-right text-zinc-300 tabular-nums">{rd.totalTrades}</td>
                                <td className="px-4 py-2 text-right text-green-500 tabular-nums">{rd.wins}</td>
                                <td className="px-4 py-2 text-right text-red-500 tabular-nums">{rd.losses}</td>
                                <td className="px-4 py-2 text-right text-white font-medium tabular-nums">{rd.winRate}%</td>
                                <td className={`px-4 py-2 text-right font-mono font-medium tabular-nums ${zScoreColor(rd.zScore)}`}>
                                  {rd.zScore >= 0 ? "+" : ""}{rd.zScore}
                                </td>
                                <td className="px-4 py-2 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <div className="w-20 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${
                                          rd.zScore >= 0
                                            ? "bg-green-500"
                                            : "bg-red-500"
                                        }`}
                                        style={{
                                          width: `${Math.min(100, Math.abs(rd.zScore) * 33)}%`,
                                        }}
                                      />
                                    </div>
                                    <span className="text-[10px] text-zinc-500 w-6">
                                      {rd.zScore >= 0 ? "+" : ""}{rd.zScore.toFixed(1)}
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>

            {/* ════════════════════════════════════════ */}
            {/* SUB-TAB 2: Simulation                    */}
            {/* ════════════════════════════════════════ */}
            <TabsContent value="simulacao" className="m-0 space-y-6 pt-4">
              {/* Config Card */}
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Sigma className="h-5 w-5 text-purple-400" />
                    Simular Trading por Desvio Padrão
                  </CardTitle>
                  <CardDescription>
                    As primeiras <strong className="text-white">N operações</strong> do robô são usadas como <strong className="text-white">base de aprendizado</strong> para calcular
                    a taxa de acerto média e o desvio padrão. A simulação é executada <strong className="text-white">apenas sobre as operações restantes</strong>,
                    entrando quando o rolling win rate se desvia da média da base por um número de sigma configurável.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Robot + params */}
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Robô</Label>
                      <Select value={devSelectedId} onValueChange={(id) => { setDevSelectedId(id); setDevResult(null); }}>
                        <SelectTrigger className="bg-zinc-800/50 border-zinc-700">
                          <SelectValue placeholder="Selecione um robô..." />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          {robots.map((r) => {
                            const closed = (r.trades || []).filter(
                              (t) => t.result === "WIN" || t.result === "LOSS",
                            ).length;
                            return (
                              <SelectItem key={r.id} value={r.id}>
                                <span className="flex items-center gap-2">
                                  <span
                                    className={`w-2 h-2 rounded-full inline-block ${
                                      r.active
                                        ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]"
                                        : "bg-zinc-600"
                                    }`}
                                  />
                                  <span>{r.name}</span>
                                  <span className="text-muted-foreground text-xs ml-auto tabular-nums">
                                    {closed} ops
                                  </span>
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Aprendizado (trades)</Label>
                      <Input
                        type="number"
                        className="bg-zinc-800/50 border-zinc-700 h-10"
                        value={devLearningSize}
                        onChange={(e) => { setDevLearningSize(Number(e.target.value)); setDevResult(null); }}
                        min={100}
                        max={5000}
                        step={100}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Janela (trades)</Label>
                      <Input
                        type="number"
                        className="bg-zinc-800/50 border-zinc-700 h-10"
                        value={devWindow}
                        onChange={(e) => { setDevWindow(Number(e.target.value)); setDevResult(null); }}
                        min={5}
                        max={200}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Limiar (σ)</Label>
                      <Input
                        type="number"
                        className="bg-zinc-800/50 border-zinc-700 h-10"
                        value={devThreshold}
                        onChange={(e) => { setDevThreshold(Number(e.target.value)); setDevResult(null); }}
                        step={0.1}
                        min={0.1}
                        max={3}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Direção</Label>
                      <Select
                        value={devMode}
                        onValueChange={(v: "below" | "above" | "both") => { setDevMode(v); setDevResult(null); }}
                      >
                        <SelectTrigger className="bg-zinc-800/50 border-zinc-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          <SelectItem value="below">Abaixo do limiar</SelectItem>
                          <SelectItem value="above">Acima do limiar</SelectItem>
                          <SelectItem value="both">Ambos</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Stake ($)</Label>
                      <Input
                        type="number"
                        className="bg-zinc-800/50 border-zinc-700 h-10"
                        value={devStake}
                        onChange={(e) => { setDevStake(Number(e.target.value)); setDevResult(null); }}
                        min={1}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Payout (%)</Label>
                      <Input
                        type="number"
                        className="bg-zinc-800/50 border-zinc-700 h-10"
                        value={devPayout}
                        onChange={(e) => { setDevPayout(Number(e.target.value)); setDevResult(null); }}
                        min={1}
                        max={100}
                      />
                    </div>
                    <div className="space-y-2 flex items-end">
                      <label className="flex items-center gap-2 cursor-pointer pb-2">
                        <input
                          type="checkbox"
                          className="accent-blue-500 w-4 h-4"
                          checked={devInvert}
                          onChange={() => { setDevInvert(!devInvert); setDevResult(null); }}
                        />
                        <span className="text-sm text-zinc-300">Inverter na alta</span>
                      </label>
                    </div>
                  </div>

                  {/* Management Filters */}
                  <div>
                    <Label className="text-xs text-muted-foreground block mb-3">
                      Filtros de Gestão (aplicados após o desvio)
                    </Label>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          className="accent-blue-500 w-4 h-4"
                          checked={devFilterEntryWin}
                          onChange={() => { setDevFilterEntryWin(!devFilterEntryWin); setDevResult(null); }}
                        />
                        <span className="text-sm text-zinc-300">Entrar após Vitória</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          className="accent-blue-500 w-4 h-4"
                          checked={devFilterEntryLoss}
                          onChange={() => { setDevFilterEntryLoss(!devFilterEntryLoss); setDevResult(null); }}
                        />
                        <span className="text-sm text-zinc-300">Entrar após Derrota</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          className="accent-blue-500 w-4 h-4"
                          checked={devFilterVd}
                          onChange={() => { setDevFilterVd(!devFilterVd); setDevResult(null); }}
                        />
                        <span className="text-sm text-zinc-300">Filtro VD</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <Label className="text-sm text-zinc-300 whitespace-nowrap">
                          Stop Loss Diário ($):
                        </Label>
                        <Input
                          type="number"
                          className="bg-zinc-800/50 border-zinc-700 h-8 w-20"
                          value={devDailySL}
                          onChange={(e) => { setDevDailySL(Number(e.target.value)); setDevResult(null); }}
                          min={0}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-sm text-zinc-300 whitespace-nowrap">
                          Stop Gain Diário ($):
                        </Label>
                        <Input
                          type="number"
                          className="bg-zinc-800/50 border-zinc-700 h-8 w-20"
                          value={devDailySG}
                          onChange={(e) => { setDevDailySG(Number(e.target.value)); setDevResult(null); }}
                          min={0}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Run button */}
                  <Button
                    className="gap-2 w-full md:w-auto"
                    disabled={!devSelectedRobot}
                    onClick={handleDevRunSim}
                  >
                    <Play className="h-4 w-4" /> Rodar Simulação por Desvio
                  </Button>
                </CardContent>
              </Card>

              {/* RESULTS */}
              {devResult && (
                <>
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span>
                      Robô: <span className="text-white font-medium">{devResult.robotName}</span>
                    </span>
                    <span>
                      Total: <span className="text-white font-medium">{devResult.totalHistoricalTrades}</span> ops
                    </span>
                    <span>
                      Aprendizado: <span className="text-white font-medium">{devResult.learningSize}</span> ops
                      {" → "}WR base: <span className="text-blue-400 font-medium">{devResult.baseWR}%</span>
                    </span>
                    <span>
                      WR total: <span className="text-white font-medium">{devResult.robotWR}%</span>
                    </span>
                    <span>
                      Simulação: <span className="text-white font-medium">{devResult.totalSimulatedTrades}</span> ops
                    </span>
                  </div>

                  {/* Result Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card className="bg-zinc-900/50 border-zinc-800">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground">
                          Trades Executados
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-white">
                          {devResult.totalSimulatedTrades}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          de {devResult.totalHistoricalTrades} disponíveis
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-zinc-900/50 border-zinc-800">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground">
                          PnL Final
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div
                          className={`text-2xl font-bold ${
                            devResult.finalPnl >= 0
                              ? "text-green-400"
                              : "text-red-400"
                          }`}
                        >
                          {formatPnl(devResult.finalPnl)}
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="bg-zinc-900/50 border-zinc-800">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground">
                          Win Rate
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-white">
                          {devResult.winRate}%
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {devResult.wins}W / {devResult.losses}L
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-zinc-900/50 border-zinc-800">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground">
                          Max Drawdown
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-red-400">
                          ${devResult.maxDrawdown.toFixed(2)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {devResult.drawdownPercent}% do pico
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* PnL Evolution Chart */}
                  <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <LineChart className="h-5 w-5 text-blue-400" />
                          Evolução do PnL
                        </CardTitle>
                        <CardDescription>
                          Lucro acumulado na simulação por desvio
                        </CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent className="h-[250px]">
                      <DeviationPnLChart result={devResult} />
                    </CardContent>
                  </Card>

                  {/* Expanded trade table */}
                  <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardHeader
                      className="cursor-pointer select-none"
                      onClick={() => setDevExpandedTrade(!devExpandedTrade)}
                    >
                      <CardTitle className="text-md flex items-center justify-between">
                        <span>Detalhes das Operações</span>
                        <Badge variant="outline" className="text-xs">
                          {devExpandedTrade ? "Recolher" : "Expandir"} ({devResult.trades.length} passos)
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    {devExpandedTrade && (
                      <CardContent className="p-0 max-h-[500px] overflow-auto">
                        <table className="w-full text-sm text-left">
                          <thead className="text-xs text-muted-foreground uppercase border-b border-zinc-800 sticky top-0 bg-zinc-900">
                            <tr>
                              <th className="px-3 py-2">#</th>
                              <th className="px-3 py-2">Ativo</th>
                              <th className="px-3 py-2">Tipo</th>
                              <th className="px-3 py-2">Resultado</th>
                              <th className="px-3 py-2">Stake</th>
                              <th className="px-3 py-2">PnL</th>
                              <th className="px-3 py-2">Rolling WR</th>
                              <th className="px-3 py-2">Desvio (σ)</th>
                              <th className="px-3 py-2">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800">
                            {devResult.trades
                              .filter((t) => t.triggered)
                              .map((step) => (
                                <tr
                                  key={step.index}
                                  className={`hover:bg-zinc-800/30 transition-colors ${
                                    step.skipped ? "opacity-50" : ""
                                  }`}
                                >
                                  <td className="px-3 py-1.5 text-zinc-500">{step.index + 1}</td>
                                  <td className="px-3 py-1.5 text-zinc-300">{step.asset}</td>
                                  <td className="px-3 py-1.5">
                                    <Badge
                                      className={
                                        step.type === "CALL"
                                          ? "bg-green-500/20 text-green-500"
                                          : "bg-red-500/20 text-red-500"
                                      }
                                    >
                                      {step.type}
                                    </Badge>
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <Badge
                                      className={
                                        step.result === "WIN"
                                          ? "bg-green-600"
                                          : "bg-red-600"
                                      }
                                    >
                                      {step.skipped ? "—" : step.result}
                                    </Badge>
                                  </td>
                                  <td className="px-3 py-1.5 text-zinc-300">
                                    {step.skipped ? "—" : `$${step.stake.toFixed(2)}`}
                                  </td>
                                  <td
                                    className={`px-3 py-1.5 font-medium ${
                                      step.pnl >= 0 ? "text-green-500" : "text-red-500"
                                    }`}
                                  >
                                    {step.skipped ? "—" : formatPnl(step.pnl)}
                                  </td>
                                  <td className="px-3 py-1.5 text-zinc-300 tabular-nums">
                                    {step.rollingWinRate}%
                                  </td>
                                  <td
                                    className={`px-3 py-1.5 font-mono tabular-nums ${
                                      step.deviation <= -1
                                        ? "text-red-400"
                                        : step.deviation >= 1
                                          ? "text-green-400"
                                          : "text-zinc-300"
                                    }`}
                                  >
                                    {step.deviation >= 0 ? "+" : ""}
                                    {step.deviation.toFixed(2)}
                                  </td>
                                  <td className="px-3 py-1.5">
                                    {step.skipped ? (
                                      <Badge
                                        variant="outline"
                                        className="text-amber-500 border-amber-500/30 text-[10px]"
                                      >
                                        {step.skipReason || "Pulado"}
                                      </Badge>
                                    ) : (
                                      <Badge
                                        variant="outline"
                                        className="text-green-500 border-green-500/30 text-[10px]"
                                      >
                                        Executado
                                      </Badge>
                                    )}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </CardContent>
                    )}
                  </Card>
                </>
              )}

              {!devSelectedRobot && (
                <Card className="bg-zinc-900/50 border-zinc-800">
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <Sigma className="h-8 w-8 mx-auto mb-3 opacity-30" />
                    <p>Selecione um robô para simular trading por desvio padrão.</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      );
    }

    // ─── Deviation PnL Chart ────────────────────────────────────────────────────

    function DeviationPnLChart({ result }: { result: DeviationSimResult }) {
      const chartData = [];
      let cum = 0;

      for (const trade of result.trades) {
        if (trade.triggered && !trade.skipped) {
          cum += trade.pnl;
        }
        chartData.push({
          name: trade.index + 1,
          pnl: Number(cum.toFixed(2)),
        });
      }

      return (
        <ResponsiveContainer width="100%" height="100%">
          <RechartLineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis
              dataKey="name"
              stroke="#71717a"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#71717a"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${v}`}
            />
            <Tooltip
              contentStyle={{ backgroundColor: "#18181b", border: "#27272a" }}
              itemStyle={{ color: "#3b82f6" }}
              formatter={(v: number) => [`$${v.toFixed(2)}`, "PnL"]}
            />
            <Line
              type="monotone"
              dataKey="pnl"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={false}
              name="PnL Desvio"
            />
          </RechartLineChart>
        </ResponsiveContainer>
      );
    }

    export default ManagementPage;
