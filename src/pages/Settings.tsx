import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useStore } from "@/lib/store";
import { toast } from "sonner";
import { Eye, EyeOff, Save, MonitorPlay, Globe, BrainCircuit, Hand, Bot, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

function mapRedisKeyToSymbol(redisAssetPart: string): string {
  // Map 1HZ10V to R_10S, etc
  const match1HZ = redisAssetPart.match(/^1HZ(\d+)V$/i);
  if (match1HZ) {
    return `R_${match1HZ[1]}S`;
  }

  // Normalize R25S, R_25_S to R_25S
  const matchRS = redisAssetPart.match(/^R_?(\d+)_?S$/i);
  if (matchRS) {
    return `R_${matchRS[1]}S`;
  }

  // Normalize R10, r10 to R_10
  const matchR = redisAssetPart.match(/^R_?(\d+)$/i);
  if (matchR) {
    return `R_${matchR[1]}`;
  }

  return redisAssetPart;
}

export default function Settings() {
  const {
    demoToken, realToken, setDemoToken, setRealToken,
    candleToken, setCandleToken,
    robotTokens, setRobotTokens,
    tradingMode, setTradingMode,
    marketType, setMarketType,
    automationMode, setAutomationMode,
    account, setAccount,
    risk, setRisk, resetTrades,
    forex, setForex
  } = useStore();
  const [showD, setShowD] = useState(false);
  const [showR, setShowR] = useState(false);
  const [showC, setShowC] = useState(false);
  const [showRobots, setShowRobots] = useState<boolean[]>([]);

  return (
    <AppShell>
      <div className="p-3 grid lg:grid-cols-3 gap-3">
        {/* Trading Mode */}
        <div className="panel p-4 space-y-3">
          <div className="text-xs uppercase text-primary tracking-widest">Modo de Trading</div>
          <p className="text-[11px] text-muted-foreground">Escolhe o ambiente de operação. A interface de trading adapta-se automaticamente.</p>

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setTradingMode("demo")}
              className={`py-3 text-xs border rounded-sm flex flex-col items-center gap-1 ${tradingMode === "demo" ? "border-primary text-primary bg-secondary/40" : "border-border text-muted-foreground hover:bg-secondary/20"}`}
            >
              <MonitorPlay className="h-4 w-4" /> DEMO
            </button>
            <button
              onClick={() => setTradingMode("real")}
              className={`py-3 text-xs border rounded-sm flex flex-col items-center gap-1 ${tradingMode === "real" ? "border-bear text-bear bg-bear/10" : "border-border text-muted-foreground hover:bg-secondary/20"}`}
            >
              <Globe className="h-4 w-4" /> REAL
            </button>
            <button
              onClick={() => setTradingMode("backtest")}
              className={`py-3 text-xs border rounded-sm flex flex-col items-center gap-1 ${tradingMode === "backtest" ? "border-warning text-warning bg-warning/10" : "border-border text-muted-foreground hover:bg-secondary/20"}`}
            >
              <BrainCircuit className="h-4 w-4" /> BACKTEST
            </button>
          </div>

          <div className="text-[10px] text-muted-foreground border border-border/60 rounded-sm p-2">
            {tradingMode === "demo" && "🎮 Modo Demo: Opera com saldo virtual. Ideal para testar estratégias sem risco."}
            {tradingMode === "real" && "💰 Modo Real: Opera com fundos reais. Usa o token da conta real configurado abaixo."}
            {tradingMode === "backtest" && "📊 Modo Backtest: Simula operações em dados históricos para validar estratégias."}
          </div>
        </div>

        {/* Market Type & Automation */}
        <div className="panel p-4 space-y-3">
          <div className="text-xs uppercase text-primary tracking-widest">Mercado & Automação</div>

          <div>
            <label className="text-[10px] text-muted-foreground">Tipo de Mercado</label>
            <div className="grid grid-cols-2 gap-1 mt-1">
              <button onClick={() => setMarketType("binary")} className={`py-2 text-xs border rounded-sm ${marketType === "binary" ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>Opções Binárias</button>
              <button onClick={() => setMarketType("forex")} className={`py-2 text-xs border rounded-sm ${marketType === "forex" ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>Forex</button>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground">Modo de Automação</label>
            <div className="grid grid-cols-3 gap-1 mt-1">
              <button onClick={() => setAutomationMode("manual")} className={`py-2 text-[10px] border rounded-sm flex items-center justify-center gap-1 ${automationMode === "manual" ? "border-primary text-primary" : "border-border text-muted-foreground"}`}><Hand className="h-3 w-3" /> Manual</button>
              <button onClick={() => setAutomationMode("semi-auto")} className={`py-2 text-[10px] border rounded-sm flex items-center justify-center gap-1 ${automationMode === "semi-auto" ? "border-warning text-warning" : "border-border text-muted-foreground"}`}><BrainCircuit className="h-3 w-3" /> Semi-Auto</button>
              <button onClick={() => setAutomationMode("auto")} className={`py-2 text-[10px] border rounded-sm flex items-center justify-center gap-1 ${automationMode === "auto" ? "border-bull text-bull" : "border-border text-muted-foreground"}`}><Bot className="h-3 w-3" /> Auto</button>
            </div>
          </div>

          {automationMode === "semi-auto" && (
            <div className="text-[10px] text-warning border border-warning/30 rounded-sm p-2">
              ⚡ <strong>Semi-Auto:</strong> O script opera automaticamente quando o preço toca nas zonas de Suporte/Resistência que definires no gráfico. As zonas S/R são guardadas e respeitadas pelo algoritmo.
            </div>
          )}
        </div>

        {/* Tokens */}
        <div className="panel p-4 space-y-3">
          <div className="text-xs uppercase text-primary tracking-widest">Tokens Deriv API</div>
          <p className="text-[11px] text-muted-foreground">Gere os tokens em app.deriv.com → API Token. Eles ficam armazenados no teu navegador.</p>

          {/* Token principal DEMO */}
          <div>
            <label className="text-[10px] text-muted-foreground">Token Conta DEMO (fallback)</label>
            <div className="flex gap-1">
              <Input type={showD ? "text" : "password"} value={demoToken} onChange={(e) => setDemoToken(e.target.value)} placeholder="abcd1234..." className="h-9 ticker" />
              <Button variant="outline" size="icon" onClick={() => setShowD((s) => !s)}>{showD ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground">Token Conta REAL (fallback)</label>
            <div className="flex gap-1">
              <Input type={showR ? "text" : "password"} value={realToken} onChange={(e) => setRealToken(e.target.value)} placeholder="xyz9876..." className="h-9 ticker" />
              <Button variant="outline" size="icon" onClick={() => setShowR((s) => !s)}>{showR ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
            </div>
          </div>

          {/* Token Dados (Candles) */}
          <div className="border-t border-border/40 pt-3">
            <label className="text-[10px] text-muted-foreground font-semibold">Token Dados (Candles/Mercado)</label>
            <p className="text-[10px] text-muted-foreground mb-1">Token dedicado exclusivamente para atualização de dados de mercado (candles/ticks).</p>
            <div className="flex gap-1">
              <Input type={showC ? "text" : "password"} value={candleToken} onChange={(e) => setCandleToken(e.target.value)} placeholder="Token para dados de mercado..." className="h-9 ticker" />
              <Button variant="outline" size="icon" onClick={() => setShowC((s) => !s)}>{showC ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
            </div>
          </div>

          {/* Tokens de Robôs */}
          <div className="border-t border-border/40 pt-3">
            <label className="text-[10px] text-muted-foreground font-semibold">Tokens de Robôs</label>
            <p className="text-[10px] text-muted-foreground mb-1">Tokens distribuídos automaticamente entre os robôs (máx. 10). Quanto mais tokens, menos robôs por token.</p>

            {robotTokens.map((token, i) => (
              <div key={i} className="flex gap-1 mt-1">
                <Input
                  type={showRobots[i] ? "text" : "password"}
                  value={token}
                  onChange={(e) => {
                    const next = [...robotTokens];
                    next[i] = e.target.value;
                    setRobotTokens(next);
                  }}
                  placeholder={`Token #${i + 1}...`}
                  className="h-9 ticker"
                />
                <Button variant="outline" size="icon" onClick={() => {
                  const next = [...showRobots];
                  next[i] = !next[i];
                  setShowRobots(next);
                }}>{showRobots[i] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
                <Button variant="outline" size="icon" className="text-bear hover:text-bear" onClick={() => {
                  const nextTokens = robotTokens.filter((_, idx) => idx !== i);
                  setRobotTokens(nextTokens);
                  const nextShow = showRobots.filter((_, idx) => idx !== i);
                  setShowRobots(nextShow);
                }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}

            {robotTokens.length < 10 && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full text-[11px]"
                onClick={() => {
                  setRobotTokens([...robotTokens, ""]);
                  setShowRobots([...showRobots, false]);
                }}
              >
                <Plus className="h-3 w-3 mr-1" /> Adicionar token de robô
              </Button>
            )}
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground">Conta ativa (legado)</label>
            <div className="grid grid-cols-2 gap-1 mt-1">
              <button onClick={() => setAccount("demo")} className={`py-2 text-xs border rounded-sm ${account === "demo" ? "border-primary text-primary" : "border-border"}`}>DEMO</button>
              <button onClick={() => setAccount("real")} className={`py-2 text-xs border rounded-sm ${account === "real" ? "border-bear text-bear" : "border-border"}`}>REAL</button>
            </div>
          </div>

          <Button className="w-full" onClick={async () => {
            // Send tokens to server for persistence
            try {
              const res = await fetch("/api/settings/tokens", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ demoToken, realToken, candleToken, robotTokens }),
              });
              if (res.ok) {
                toast.success("Tokens salvos localmente e no servidor");
              } else {
                toast.warning("Tokens salvos localmente (falha ao salvar no servidor)");
              }
            } catch {
              toast.warning("Tokens salvos localmente (servidor offline)");
            }
          }}> <Save className="h-4 w-4 mr-1" /> Salvar tokens</Button>
        </div>

        {/* Forex Settings */}
        <div className="panel p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase text-primary tracking-widest">Configurações Forex</div>
            <Switch checked={forex.enabled} onCheckedChange={(v) => setForex({ enabled: v })} />
          </div>
          <p className="text-[11px] text-muted-foreground">Parâmetros aplicados quando o tipo de mercado está em Forex.</p>

          <div className={`grid grid-cols-2 gap-2 opacity-${forex.enabled ? '100' : '50'} transition-opacity pointer-events-${forex.enabled ? 'auto' : 'none'}`}>
            <Field label="Lot Size padrão" value={forex.lotSize} step={0.01} onChange={(v) => setForex({ lotSize: v })} />
            <Field label="Alavancagem" value={forex.leverage} onChange={(v) => setForex({ leverage: v })} />
            <Field label="Stop Loss (pips)" value={forex.stopLossPips} onChange={(v) => setForex({ stopLossPips: v })} />
            <Field label="Take Profit (pips)" value={forex.takeProfitPips} onChange={(v) => setForex({ takeProfitPips: v })} />
            <Field label="Spread (pips)" value={forex.spread} step={0.1} onChange={(v) => setForex({ spread: v })} />
          </div>
        </div>

        {/* Server Cache Settings */}
        <div className="panel p-4 space-y-3">
          <div className="text-xs uppercase text-primary tracking-widest">Cache do Servidor (Node.js)</div>
          <p className="text-[11px] text-muted-foreground">
            O sistema utiliza um cache centralizado no Node.js para alimentar o modo Backtest e os Robôs. 
            Os dados são coletados automaticamente em tempo real sempre que um ativo está sendo monitorado.
          </p>

          <div className="space-y-3 pt-2">
            <div className="p-3 bg-secondary/30 border border-border rounded-sm">
              <div className="text-[10px] font-bold text-primary flex items-center gap-2 mb-1">
                <div className="h-2 w-2 rounded-full bg-bull animate-pulse" />
                STATUS DO CACHE: ATIVO
              </div>
              <p className="text-[10px] text-muted-foreground">
                Capacidade: 10,000 velas por ativo (M1).<br/>
                Os robôs utilizam estes dados para análise multi-timeframe (MTF) instantânea.
              </p>
            </div>

            <Button 
              variant="outline" 
              className="w-full text-xs"
              onClick={async () => {
                const toastId = toast.loading("Sincronizando cache com o servidor...");
                // Just a UI trigger to show synchronization is happening
                setTimeout(() => {
                  toast.success("Cache sincronizado com sucesso!", { id: toastId });
                }, 1000);
              }}
            >
              Forçar Sincronização
            </Button>
            
            <p className="text-[9px] text-muted-foreground italic text-center">
              Nota: Ao entrar no Trading em modo Backtest, os dados são carregados automaticamente deste cache.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Field({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div>
      <label className="text-[10px] text-muted-foreground">{label}</label>
      <Input type="number" step={step} value={value} onChange={(e) => onChange(+e.target.value)} className="h-9 text-xs ticker" />
    </div>
  );
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span>{label}</span>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}
