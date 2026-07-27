import { AppShell } from "@/components/AppShell";
import { type Trade, useStore } from "@/lib/store";
import { History, ArrowUp, ArrowDown, X, RefreshCw, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

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
      <td className="py-2.5 font-medium cursor-help relative pl-3" title={new Date(t.ts || Date.now()).toLocaleTimeString()}>
        <div className="flex items-center gap-2">
          {t.type === "CALL" || t.type === "BUY" ? <ArrowUp className="h-4 w-4 text-bull" /> : <ArrowDown className="h-4 w-4 text-bear" />}
          {t.asset}
        </div>
        {t.result === "OPEN" && (
          <div className="absolute bottom-0 left-0 h-[2px] bg-primary/60 transition-all rounded-r" style={{ width: `${progress}%` }} />
        )}
      </td>
      <td className="py-2.5 text-center text-xs tracking-wider text-muted-foreground">{new Date(t.ts || Date.now()).toLocaleString()}</td>
      <td className="py-2.5 text-center text-xs">${t.amount}</td>
      <td className={`py-2.5 text-center ${(t.result === "OPEN") ? "text-warning" : (t.pnl ?? 0) >= 0 ? "text-bull" : "text-bear"}`}>
        {t.result === "OPEN" ? "--" : `${(t.pnl ?? 0) >= 0 ? "+" : ""}${t.pnl?.toFixed(2)}`}
      </td>
      <td className={`py-2.5 text-center font-bold pr-3 ${t.result === "WIN" ? "text-bull" : t.result === "LOSS" ? "text-bear" : "text-warning"}`}>
        {t.result === "OPEN" ? (
           <button 
             onClick={() => handleCloseTrade(t.id, String(t.id).length < 20)} 
             className="inline-flex items-center p-1 rounded bg-foreground/10 hover:bg-destructive hover:text-white transition-colors"
             title="Fechar agora"
           >
              <X className="h-4 w-4" />
           </button>
        ) : t.result}
      </td>
    </tr>
  );
}

export default function Operations() {
  const { trades, tradingMode, updateTrade, resetTrades } = useStore();
  const [isRecovering, setIsRecovering] = useState(false);
  const currentModeTrades = trades.filter((t) => t.mode === tradingMode).sort((a, b) => b.ts - a.ts);
  const modeLabel = { demo: "DEMO", real: "REAL", backtest: "BACKTEST" }[tradingMode];
  const openCount = currentModeTrades.filter((t) => t.result === "OPEN").length;

  const handleCloseTrade = async (id: string, isApiOrder: boolean) => {
    try {
      updateTrade(id, { result: "LOSS", pnl: 0 }); // optimistic/mock close
      // Also trigger server-side recovery to get the real result
      toast.info("A validar resultado na Deriv...");
      const res = await fetch("/api/trades/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        const recovered = data.validated || 0;
        if (recovered > 0) {
          toast.success(`${recovered} operaçõe(s) atualizada(s) com resultado real`);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRecoverAll = async () => {
    if (isRecovering) return;
    setIsRecovering(true);
    try {
      console.log("[Operations] Recovering all open trades...");
      const res = await fetch("/api/trades/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        const msg = data.validated > 0
          ? `${data.validated} operaçõe(s) validadas. ${data.failed > 0 ? `${data.failed} não encontradas (marcadas como perda).` : ""}`
          : "Nenhuma operação aberta encontrada para validação.";
        toast.success(msg);
      } else {
        toast.error("Erro ao recuperar operações");
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao conectar ao servidor");
    } finally {
      setIsRecovering(false);
    }
  };

  const handleClearHistory = () => {
    if (!confirm(`Eliminar todo o histórico de operações ${modeLabel}? Esta ação é irreversível.`)) return;
    resetTrades(tradingMode);
    toast.success(`Histórico de operações ${modeLabel} limpo.`);
  };

  return (
    <AppShell>
      <div className="p-4 max-w-5xl mx-auto flex flex-col h-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <History className="h-6 w-6 text-primary" />
            Operações ({modeLabel})
            {openCount > 0 && (
              <button
                onClick={handleRecoverAll}
                disabled={isRecovering}
                className="ml-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-50"
                title="Recuperar operações abertas — valida o resultado real na API Deriv"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRecovering ? "animate-spin" : ""}`} />
                {isRecovering ? "A recuperar..." : `Recuperar ${openCount} aberta(s)`}
              </button>
            )}
            <button
              onClick={handleClearHistory}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-destructive border border-destructive/40 hover:bg-destructive/10 transition-colors"
              title="Eliminar todo o histórico de operações"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar Histórico
            </button>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Histórico das suas operações na sessão atual. 
          </p>
        </div>

        <div className="panel flex-1 overflow-visible">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground bg-secondary/30 sticky top-0 z-10">
              <tr>
                <th className="text-left font-medium border-b border-border/50 py-3 pl-3">Ativo</th>
                <th className="font-medium border-b border-border/50 py-3 text-center">Data/Hora</th>
                <th className="font-medium border-b border-border/50 py-3 text-center">Stake</th>
                <th className="font-medium border-b border-border/50 py-3 text-center">P&L</th>
                <th className="font-medium border-b border-border/50 py-3 pr-3 text-center">Resultado</th>
              </tr>
            </thead>
            <tbody className="ticker">
              {currentModeTrades.map((t) => (
                <TradeRow key={t.id} t={t} handleCloseTrade={handleCloseTrade} backtestIdx={0} />
              ))}
              {currentModeTrades.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-muted-foreground py-12">
                    <History className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    Nenhuma operação registrada na sessão {modeLabel}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
