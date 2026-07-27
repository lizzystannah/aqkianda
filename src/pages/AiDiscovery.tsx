import React, { useState, useEffect, useRef } from "react";
import { Bot, Sparkles, Server, Settings, Save, BrainCircuit, Loader2, ArrowRight, MessageSquare, Send, Eye, EyeOff, Play, Square, TrendingUp, Clock, AlertTriangle, Search, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { derivAPI } from "@/lib/deriv";

import { AppShell } from "@/components/AppShell";

// ─── Knowledge Base para Geração de Estratégias ─────────────────────────────
// Este conhecimento é injetado no system prompt da IA para que ela seja expert
// na arquitetura de estratégias da plataforma QuantTerm.
const STRATEGY_KNOWLEDGE_BASE = `Você é um expert em criar estratégias de trading para a plataforma QuantTerm.

A plataforma usa TypeScript com a seguinte interface Strategy. Gere SEMPRE código TypeScript válido seguindo este molde:

## Estrutura Obrigatória da Estratégia
import { Strategy, StrategyContext, StrategyResult } from "./index";

const MinhaEstrategia: Strategy = {
  id: "nome_unic ID em snake_case, sem espaços",
  name: "Nome Display para o Utilizador",
  description: "Descrição curta do operacional.",
  category: "auto", // "auto" = execução automática | "semi-auto" = pede confirmação
  // Opcional — filtros configuráveis no UI:
  customFilterKeys?: [
    { key: "nome_filtro", label: "Label", type: "range" | "select" | "multiselect",
      options?: string[], defaultMin?: number, defaultMax?: number, step?: number },
  ],
  // Opcional — estatísticas personalizadas no backtest:
  customStatKeys?: [
    { key: "nomeCampo", label: "Label Display", type?: "number" | "string" },
  ],
  onTick: (ctx: StrategyContext): StrategyResult | null => {
    // LÓGICA AQUI
    return null; // null = sem sinal
    // ou: return { action: "CALL" };
  },
};
export default MinhaEstrategia;

## StrategyContext (o que está disponível em ctx)
- history: Candle[] — velas fechadas (1m default)
- candles: Candle[] — alias de history
- lastPrice: number — preço da última vela FECHADA
- currentPrice: number — preço ATUAL (tick real-time)
- balance: number — saldo atual
- hasOpenTrade: boolean — true se há trade aberto
- lastTrade?: Trade — último trade completo
- getMTF(minutes: number): Candle[] — agrega candles para timeframe superior
- srLines, srZones, trendLines — linhas de suporte/resistência desenhadas
- updateSR, updateTrendLine — atualizar linhas
- toast: { success, info, error } — notificações
- activeFilters — filtros ativos configurados pelo utilizador

## Candle type: { t: number; o: number; h: number; l: number; c: number; }

## API de Indicadores (SINGLE SOURCE OF TRUTH — usar SEMPRE via ctx.indicators.*)
ctx.indicators.rsi(period: number, dataSource?: number[]) => (number | null)[]
ctx.indicators.sma(period: number, dataSource?: number[]) => number[]
ctx.indicators.ema(period: number, dataSource?: number[]) => number[]
ctx.indicators.bollinger(period: number, multiplier: number, dataSource?: number[]) => { upper: number[]; lower: number[]; ma: number[] }
ctx.indicators.adx(period: number, dataSource?: Candle[]) => { adx: number[]; plusDi: number[]; minusDi: number[] }
ctx.indicators.macd(fast: number, slow: number, signal: number, dataSource?: number[]) => { macd: number[]; signal: number[]; histogram: number[] }
ctx.indicators.parabolicSar(afStep?: number, afMax?: number, dataSource?: Candle[]) => { sar: number[]; trend: number[]; af: number[] }

Todos os indicadores retornam arrays alinhados com ctx.history. Último elemento = valor + recente.

DataSource alternativo: ctx.indicators.rsi(14, closesArray) para calcular em dados diferentes.

## StrategyResult (o que retornar do onTick)
{ action: "CALL" | "PUT" | "BUY" | "SELL" | null;  // obrigatório
  stake?: number;              // override do stake
  duration?: number;           // duração em segundos
  expiryCandles?: number;      // expira após N velas (NUNCA usar com duration)
  pendingPrice?: number;       // preço alvo para ordem pendente
  pendingExpiryCandles?: number; // velas de validade da ordem pendente
  sequenceTrigger?: { maxEntradas?: number; minConsecutiveCandles?: number };
  customStats?: Record<string, any>; }

## REGRAS OBRIGATÓRIAS:
1. id ÚNICO — NUNCA repetir um ID existente (lista abaixo)
2. category = "auto" (automática) ou "semi-auto" (pede confirmação)
3. Verificar dados mínimos: if (ctx.history.length < 20) return null;
4. Verificar trade aberto: if (ctx.hasOpenTrade) return null;
5. NUNCA importar indicadores diretamente — usar ctx.indicators.*
6. Validar valores de indicadores com isFinite()
7. Usar Math.round(valor * 100) / 100 para arredondar em customStats
8. Nenhum require(), window, document, process, fetch, localStorage
9. expiryCandles e duration NUNCA juntos

## IDs de Estratégias Existente (NUNCA duplicar):
rsi_step, sma_crossover, bollinger_squeeze_macd, parabolic_sar_simple,
rsi_divergence_ema, sr-semi-auto, sr-v2-semi-auto, dupla_posicao3,
bollinger_bounce, breakreteste, dupla_posicao_m10_m1, duplo_pavio_reteste,
emacruz, grid_range, impulse_auto, impulse_manual, minha_estrategia,
nova, orderblock, sar_zone_reversal, sequncia

## Ativos Disponíveis:
Synthetics: R_10, R_25, R_50, R_75, R_100, R_10S, R_25S, R_50S, R_75S, R_100S
Forex: EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, USDCHF, EURGBP, EURJPY, GBPJPY, NZDUSD
Commodities: XAUUSD (Ouro), XAGUSD (Prata)

## WORKFLOW DE CRIAÇÃO E ITERAÇÃO:
1. Pergunte ao utilizador o que está em falta: condição de entrada, direção (CALL/PUT/ambos), expiração (quantas velas?), timeframe, filtros configuráveis, MTF
2. Quando tiver toda a informação, gere o código TypeScript completo e válido
3. Use CREATE_STRATEGY via ACTION_EXECUTE para fazer deploy automático
4. **IMPORTANTE: Após o CREATE_STRATEGY, o sistema AUTOMATICAMENTE testa a estratégia em backtest e retorna o resultado (win rate, trades, lucro)**
5. Analise os resultados do teste:
   - Win Rate ≥ 60%: ✅ Estratégia aprovada. Pode passar para CREATE_ROBOT
   - Win Rate 40-60%: ⚠️ Mediano. Tente ajustar parâmetros (períodos RSI, thresholds, filtros)
   - Win Rate < 40%: ❌ Ruim. Repense a lógica - mude indicadores, ajuste condições de entrada
   - 0 trades: A estratégia é muito restritiva — relaxe as condições
6. Se o resultado não for satisfatório, refine o código e faça novo CREATE_STRATEGY
7. **Limite máximo: 10 iterações por estratégia.** Quando atingir o limite, passe à melhor versão
8. Quando a win rate for boa (≥60%), use CREATE_ROBOT para criar o robô configurado
9. O utilizador só precisa ir à página de Estratégias/Robôs para ativar

## EXEMPLO DE REFINAMENTO:
- "O RSI(14) estava muito exigente. Vou mudar para RSI(7) para gerar mais sinais."
- "A estratégia só fez CALLs em tendência de baixa. Vou adicionar verificação de tendência."
- "O lucro total está negativo apesar da win rate >50%. Vou ajustar o stake ou adicionar filtro de duração."`;


export default function AiDiscovery() {
  const { 
    aiConfig, setAiConfig, addRobot,
    chats, activeChatId, createChat, deleteChat, setActiveChatId, addMessageToChat,
    refreshRobots, chatLoading, setChatLoading
  } = useStore();
  const [showApiKey, setShowApiKey] = useState(false);
  const [openRouterModels, setOpenRouterModels] = useState<{ id: string; name: string }[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [showManualModelInput, setShowManualModelInput] = useState(false);

  // Ativo e Timeframe para Discovery
  const [asset, setAsset] = useState("R_100");
  const [timeframe, setTimeframe] = useState("60");
  const [candlesCount, setCandlesCount] = useState("1000");
  const [loading, setLoading] = useState(false);
  const [useBrokerFallback, setUseBrokerFallback] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string>("");
  const [generatedCode, setGeneratedCode] = useState<string>("");
  const [strategyName, setStrategyName] = useState("AI_Strategy_1");
  
  const [chatInput, setChatInput] = useState("");
  const [marketSnapshot, setMarketSnapshot] = useState<any>(null);

  // Autonomous AI Trader state
  const [autoPrompt, setAutoPrompt] = useState("");
  const [autoAsset, setAutoAsset] = useState("R_100");
  const [autoTimeframe, setAutoTimeframe] = useState("60");
  const [autoStake, setAutoStake] = useState(2);
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoLog, setAutoLog] = useState<{ ts: number; msg: string; type: "info" | "trade" | "error" | "thinking" }[]>([]);
  const [autoTrades, setAutoTrades] = useState<{ ts: number; asset: string; type: "CALL" | "PUT" | "HOLD"; reason: string; result?: string; pnl?: number }[]>([]);
  const autoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoLogRef = useRef<HTMLDivElement>(null);

  // ─── AI Strategy Researcher (auto-test & iterate) ─────────────────────
  const [isTesting, setIsTesting] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { winRate: number; totalTrades: number; wins: number; losses: number; totalProfit: number }>>({});
  // Track iteration count per strategy ID (max 10)
  const iterationCounts = useRef<Record<string, number>>({});
  // Live test log for showing step-by-step progress in chat
  const [testLog, setTestLog] = useState<{step: string; status: 'pending' | 'running' | 'done' | 'error'; detail?: string}[]>([]);
  const testLogEndRef = useRef<HTMLDivElement>(null);

  const addTestLog = (step: string, status: 'pending' | 'running' | 'done' | 'error', detail?: string) => {
    setTestLog(prev => [...prev, { step, status, detail }]);
  };
  const clearTestLog = () => setTestLog([]);
  const updateAllRunningToDone = () => {
    setTestLog(prev => prev.map(e => e.status === 'running' ? { ...e, status: 'done' as const } : e));
  };

  const testStrategyOnServer = async (strategyId: string): Promise<{ winRate: number; totalTrades: number; wins: number; losses: number; totalProfit: number; stepsText: string } | null> => {
    clearTestLog();
    addTestLog("📡 Conectando ao servidor...", "running");
    try {
      addTestLog("📡 A testar com dados reais da Deriv API...", "running");
      const res = await fetch("/api/ai/test-strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategyId, symbol: asset, timeframe: timeframe, balance: 1000 })
      });
      updateAllRunningToDone();
      if (!res.ok) {
        addTestLog("❌ Falha no teste", "error", `Servidor respondeu ${res.status}`);
        const err = await res.json();
        console.error("[AI Test] Failed:", err);
        return null;
      }
      addTestLog("✅ Resposta do servidor recebida", "done", "A processar resultados...");
      const data = await res.json();
      if (data.success) {
        setTestResults(prev => ({ ...prev, [strategyId]: data.result }));
        let stepsText = "";
        if (data.steps && Array.isArray(data.steps)) {
          for (const s of data.steps) {
            await new Promise(r => setTimeout(r, 400));
            addTestLog(s.step, "done", s.detail);
            stepsText += `\n${s.step} → ${s.detail}`;
          }
        }
        return { ...data.result, stepsText };
      }
      addTestLog("❌ Teste falhou", "error", data.error || "Erro desconhecido");
      return null;
    } catch (err) {
      addTestLog("❌ Erro de conexão", "error", String(err));
      console.error("[AI Test] Error:", err);
      return null;
    }
  };

  // Auto-scroll test log
  useEffect(() => {
    if (testLogEndRef.current) {
      testLogEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [testLog]);

  useEffect(() => {
    let failCount = 0;
    const fetchSnapshot = async () => {
      try {
        const res = await fetch("/api/market/snapshot");
        if (res.ok) {
          const data = await res.json();
          if (data.snapshot) {
            setMarketSnapshot(data.snapshot);
            failCount = 0;
          }
        } else {
          failCount++;
        }
      } catch (err) {
        failCount++;
        // Quiet background error logging unless it's persistent
        if (failCount > 5) {
          console.warn("[AiDiscovery] Snapshot connection issue.");
        }
      }
    };
    fetchSnapshot();
    const interval = setInterval(fetchSnapshot, 10000);
    return () => clearInterval(interval);
  }, []);

  const activeChat = chats.find(c => c.id === activeChatId);

  useEffect(() => {
    // Se não houver chat ativo, cria um ou seleciona o primeiro
    if (!activeChatId && chats.length > 0) {
      setActiveChatId(chats[0].id);
    } else if (chats.length === 0) {
      createChat("Chat de Boas-vindas");
    }
  }, [activeChatId, chats.length]);

  const updateAiConfig = (updates: any) => {
    setAiConfig({ ...aiConfig, ...updates });
  };

  useEffect(() => {
    if (aiConfig.provider === "openrouter") {
      fetchOpenRouterModels();
    }
  }, [aiConfig.provider]);

  const fetchOpenRouterModels = async () => {
    if (openRouterModels.length > 0) return;
    setFetchingModels(true);
    try {
      const res = await fetch("https://openrouter.ai/api/v1/models");
      if (res.ok) {
        const data = await res.json();
        if (data.data) {
          const models = data.data.map((m: any) => ({
            id: m.id,
            name: m.name || m.id
          })).sort((a: any, b: any) => a.name.localeCompare(b.name));
          setOpenRouterModels(models);
        }
      }
    } catch (err) {
      console.error("Erro ao buscar modelos do OpenRouter:", err);
    } finally {
      setFetchingModels(false);
    }
  };

  const callLLM = async (messages: any[], systemPrompt: string = ""): Promise<string> => {
    let finalMessages = [...messages];
    
    // Injeta o contexto da plataforma para dar "acesso completo" à IA via MCP-like context
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const [stateRes, strategiesRes, marketRes] = await Promise.allSettled([
        fetch("/api/system/state", { signal: controller.signal }),
        fetch("/api/strategies", { signal: controller.signal }),
        fetch("/api/market/snapshot", { signal: controller.signal })
      ]);
      
      clearTimeout(timeoutId);
      
      let platformContext = `\n\n[CONTEXTO DO SISTEMA — OPERAÇÃO INTEGRAL VIA MCP]\n`;
      platformContext += `AVISO CRÍTICO: Você é um Agente Inteligente com ACESSO TOTAL e DIRETO aos robôs de trading, dados históricos e estatísticas através do protocolo MCP.\n`;
      platformContext += `NUNCA diga que não tem acesso aos robôs ou à conta de trading. Você tem acesso sim e todos os dados estão listados abaixo no seu contexto de execução!\n`;
      platformContext += `Se o usuário perguntar sobre indicadores, desempenho, estatísticas ou robôs, use os dados do contexto abaixo para responder de forma precisa.\n`;
      
      if (stateRes.status === "fulfilled" && stateRes.value.ok) {
        const state = await stateRes.value.json();
        platformContext += `\nESTADO DOS ROBÔS E DESEMPENHO NO SISTEMA:\n${JSON.stringify(state.robots, null, 2)}\n\n`;
        platformContext += `- Uptime Geral do Servidor: ${Math.round(state.uptime)}s\n`;
      }

      if (strategiesRes.status === "fulfilled" && strategiesRes.value.ok) {
        const strategies = await strategiesRes.value.json();
        platformContext += `- Estratégias Disponíveis para os Robôs: ${JSON.stringify(strategies)}\n`;
      }
      
      if (marketRes.status === "fulfilled" && marketRes.value.ok) {
        const market = await marketRes.value.json();
        platformContext += `- Snapshot Atual do Mercado (Ticks e Preços): ${JSON.stringify(market.snapshot)}\n`;
      }

      // ── Knowledge Base de Criação de Estratégias ──
      platformContext += `\n\n${STRATEGY_KNOWLEDGE_BASE}\n`;

      platformContext += `\nVocê é o OPERADOR AUTÔNOMO do QuantTerm Pro com inteligência analítica completa.
PERMISSÕES: Analisar dados de robôs, identificar as melhores performances com base em win rates, lucros (PnL) e indicadores técnicos utilizados (RSI, EMA, etc.), emitir sugestões e executar comandos autônomos.

Adicionalmente, você pode IMPORTAR as operações (trades) de qualquer robô para a aba de Estatísticas globais do usuário para que ele visualize os gráficos daquele robô em tempo real.

FORMATO DE COMANDO (Se quiser realizar uma ação, coloque na última linha da sua resposta):
ACTION_EXECUTE: {"action": "CREATE_STRATEGY|CREATE_ROBOT|START_ROBOT|STOP_ROBOT|ANALYZE_ROBOT|IMPORT_ROBOT_TRADES", "params": {...}}

PARÂMETROS DOS COMANDOS AUTÔNOMOS:
- CREATE_STRATEGY: { id: "nome_ID", code: "script TS completo" } → **AUTO-TESTE: Após criar, o sistema testa em backtest automaticamente e retorna win rate + lucro + total de trades. Use os resultados para decidir se refina ou passa à criação do robô.**
- CREATE_ROBOT: { name: "Nome", strategyId: "id", mode: "demo"|"real", assets: ["R_100"], timeframe: "60" }
- START_ROBOT: { robotId: "id" }
- STOP_ROBOT: { robotId: "id" }
- ANALYZE_ROBOT: { robotId: "id" } (Use para ler relatórios profundamente detalhados do histórico de operações e indicadores de um robô)
- IMPORT_ROBOT_TRADES: { robotId: "id" } (Use para importar fisicamente as operações do robô selecionado para o dashboard de Estatísticas do usuário)

AJA com precisão, compare as performances de lucro de cada robô e de indicadores para guiar o usuário.`;
      
      systemPrompt = (systemPrompt || "") + platformContext;
    } catch (err) {
      console.warn("Falha ao injetar contexto do sistema.");
    }

    if (systemPrompt) {
      finalMessages = [{ role: "system", content: systemPrompt }, ...messages];
    }

    if (!aiConfig.provider) {
      throw new Error("Selecione um provedor de IA nas Configurações.");
    }

    const isLocalUrl = aiConfig.baseUrl?.includes("127.0.0.1") || aiConfig.baseUrl?.includes("localhost");

    if (!aiConfig.apiKey && aiConfig.provider !== "ollama" && !isLocalUrl) {
      throw new Error(`A chave de API é obrigatória para o provedor '${aiConfig.provider}'.`);
    }

    try {
      const res = await fetch("/api/ai/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: aiConfig.provider,
          baseUrl: aiConfig.baseUrl,
          apiKey: aiConfig.apiKey,
          model: aiConfig.model,
          messages: finalMessages
        })
      });

      if (!res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
           const err = await res.json();
           let msg = err.error || res.statusText;
           if (err.hint) msg += `\n\n💡 DICA: ${err.hint}`;
           if (err.details) msg += `\n\nDetalhes: ${err.details}`;
           throw new Error(msg);
        } else {
          const text = await res.text();
          throw new Error(`Erro no servidor proxy (${res.status}): ${text.slice(0, 50)}...`);
        }
      }

      const responseData = await res.text();
      let data: any;
      try {
        data = JSON.parse(responseData);
      } catch (err) {
        console.error("[AiDiscovery] Error parsing JSON from server:", responseData);
        if (responseData.toLowerCase().includes("<!doctype html>") || responseData.toLowerCase().includes("<html>")) {
          throw new Error("O servidor retornou uma página HTML em vez de dados JSON. Isso geralmente acontece quando o URL Base da API está errado ou incompleto.");
        }
        throw new Error(`Resposta do servidor em formato inválido. Recebido: ${responseData.slice(0, 80)}...`);
      }

      const rawContent = data.choices?.[0]?.message?.content || data.response || "No response";

      // Lógica de Execução de Ações
      if (rawContent.includes("ACTION_EXECUTE:")) {
        try {
          const parts = rawContent.split("ACTION_EXECUTE:");
          const textContent = parts[0].trim();
          const jsonBlock = parts[1].trim();
          const actionData = JSON.parse(jsonBlock);

          console.log("[AI Executive] Automated execution:", actionData);
          
          const actionRes = await fetch("/api/system/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(actionData)
          });
          
          const actionResult = await actionRes.json();
          if (actionRes.ok) {
            // Sincroniza robôs após sucesso
            refreshRobots();
            
            let extra = "";
            const robotId = actionData.params?.robotId || actionData.params?.id;
            
            // Se for importação de trades ou análise de robô, importa fisicamente para as estatísticas globais
            if (robotId && (actionData.action === "IMPORT_ROBOT_TRADES" || actionData.action === "ANALYZE_ROBOT")) {
              useStore.getState().replaceRobotTradesToStats(robotId);
              toast.success(`Operações do robô ${robotId} importadas com sucesso para as Estatísticas.`);
            }

            if (actionData.action === "ANALYZE_ROBOT" && actionResult.data) {
               extra = `\n\n📊 [DADOS IMPORTADOS: ${JSON.stringify(actionResult.data)}]`;
            }

            // ── Auto-test after CREATE_STRATEGY ──
            if (actionData.action === "CREATE_STRATEGY") {
              const stratId = actionData.params?.id;
              if (stratId) {
                const iter = (iterationCounts.current[stratId] || 0) + 1;
                iterationCounts.current[stratId] = iter;
                setIsTesting(true);
                const result = await testStrategyOnServer(stratId);
                setIsTesting(false);
                if (result) {
                  const stepsBlock = result.stepsText ? `\n📋 **Log do Teste:**${result.stepsText}\n` : "";
                  const summary = `📊 [TESTE DA ESTRATÉGIA "${stratId}"]
- Win Rate: ${result.winRate}% (${result.wins}W / ${result.losses}L)
- Total Trades: ${result.totalTrades}
- Lucro Total: $${result.totalProfit}
- Iteração: ${iter}/10

${result.winRate >= 60 ? '✅ Estratégia aprovada! Win rate acima de 60%.' : result.winRate >= 40 ? '⚠️ Win rate mediano. Pode precisar de ajustes.' : result.totalTrades > 0 ? '❌ Win rate baixo. Considere modificar a lógica.' : 'ℹ️ Nenhum trade gerado. A estratégia pode ser muito restritiva.'}

${iter < 10 ? 'Se o resultado não for satisfatório, refine a estratégia com base nos dados acima e gere uma nova versão com ACTION_EXECUTE: CREATE_STRATEGY novamente.' : '🏁 Limite de 10 iterações atingido. Esta é a versão final.'}`;
                  extra += `${stepsBlock}\n\n${summary}`;
                  toast.info(`Teste #${iter}: ${result.winRate}% WR, ${result.totalProfit >= 0 ? '+' : ''}$${result.totalProfit}`);
                }
              }
            }

            return textContent + `\n\n✅ [SISTEMA: ${actionResult.message || "Ação executada"}]` + extra;
          } else {
            return textContent + `\n\n❌ [ERRO SISTEMA: ${actionResult.error || "Falha na ação"}]`;
          }
        } catch (err) {
          console.error("Erro ao processar ação automática:", err);
        }
      }

      return rawContent;
    } catch (e: any) {
      throw new Error(e.message || "Erro ao conectar com o serviço de IA.");
    }
  };

  const runDiscovery = async () => {
    setLoading(true);
    try {
      // 1. Tentar buscar histórico do cache do servidor primeiro (como solicitado: velas em cash)
      let candles: any[] = [];
      try {
        const cacheRes = await fetch(`/api/market/history/${asset}?interval=${timeframe}`);
        if (cacheRes.ok) {
          const cacheData = await cacheRes.json();
          if (cacheData.success && cacheData.data?.length > 0) {
            candles = cacheData.data;
            console.log(`[AiDiscovery] Usando ${candles.length} velas do cache do servidor (Source: ${cacheData.source})`);
          }
        }
      } catch (err) {
        console.warn("[AiDiscovery] Erro ao buscar cache do servidor, recorrendo ao broker:", err);
      }

      // 2. Se não houver cache, buscar do broker apenas se permitido
      if (!candles || candles.length === 0) {
        if (useBrokerFallback) {
          toast.info("Cache local vazio. Buscando dados do broker...");
          candles = await derivAPI.getCandles(asset, parseInt(candlesCount), parseInt(timeframe), "latest");
        } else {
          throw new Error("Cache do servidor está vazio para este ativo. Inicie um robô no Trading para este ativo primeiro, ou ative 'Usar Broker como Fallback'.");
        }
      }

      if (!candles || !candles.length) {
        throw new Error("Não foi possível carregar as velas para análise. Certifique-se de que o robô para este ativo foi iniciado pelo menos uma vez ou tente novamente.");
      }

      // Convert candles to simpler format to save tokens
      const compactCandles = candles.slice(-120).map((c: any) => ({
        o: c.open,
        h: c.high,
        l: c.low,
        c: c.close
      }));

      const promptText = `Analyze the following last 120 candles of ${asset} at ${timeframe}s timeframe.
Based on the patterns observed in this data, write a COMPLETE TypeScript strategy for the QuantTerm platform.

The strategy MUST use the correct Strategy interface:
1. Use "import { Strategy, StrategyContext, StrategyResult } from './index';"
2. Export default the Strategy object
3. Use ctx.indicators.* for ALL indicators (rsi, sma, ema, bollinger, adx, macd, parabolicSar)
4. Check ctx.history.length for minimum data and ctx.hasOpenTrade
5. Use isFinite() to validate indicator values
6. Return StrategyResult | null (null = no signal)
7. Choose a UNIQUE id (snake_case)

Requirement:
Respond ONLY with valid TypeScript code for the strategy. No markdown codeblocks. Just the code.

Market Data:
${JSON.stringify(compactCandles)}`;

      const aiResponseText = await callLLM(
        [{ role: "user", content: promptText }],
        "You are an expert QuantTerm strategy developer. Generate TypeScript strategies using the proper Strategy interface — never generic JavaScript."
      );

      const cleanedCode = aiResponseText.replace(/^```javascript/g, '').replace(/^```/g, '').replace(/```$/g, '').trim();

      setGeneratedCode(cleanedCode);
      setAnalysisResult(`Análise concluída com sucesso. IA sugeriu um script baseado nos padrões de ${candles.length} velas analizadas.`);
      toast.success("Estratégia descoberta com sucesso!");

    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erro durante a descoberta da IA");
    } finally {
      setLoading(false);
    }
  };

  const saveAiStrategy = async (codeToSave: string, nameToSave: string) => {
    if (!codeToSave) return toast.error("Gere um código primeiro!");
    const newId = nameToSave.toLowerCase().replace(/\\s+/g, '_') + "_" + Date.now();
    
    // 1. Salvar a estratégia no servidor
    try {
      const res = await fetch("/api/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: newId, code: codeToSave })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao salvar a estratégia no servidor");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro de rede ao salvar estratégia");
      return;
    }

    // 2. Configura o robô
    const robot = {
      id: "robot_" + newId,
      name: nameToSave,
      strategyId: newId,
      active: false,
      assets: [asset],
      mode: "demo" as const,
      timeframe: timeframe,
      currentDailyPnl: 0,
      totalPnl: 0,
      lastResetDate: new Date().toISOString().split("T")[0],
      managementState: {
        currentDailyPnl: 0,
        totalPnl: 0,
        isPausedByVD: false,
        vdCycle: "",
        waitingForWins: 0,
        lastDemoResult: null,
        lastResetDate: new Date().toISOString().split("T")[0]
      },
      trades: [],
      management: {
        active: false,
        account: "demo" as const,
        mode: "fixed" as const,
        stake: 1,
        sorosMaxStake: 0,
        dailyGoal: 10,
        dailyStopLoss: -10,
        entryAfterWin: false,
        vdFilter: false
      },
      currentStake: 1,
      createdAt: Date.now()
    };

    addRobot(robot as any);
    toast.success(`Estratégia salva e robô ${nameToSave} criado! Vá à aba Robôs para configurar e ativar.`);
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !activeChatId) return;
    
    addMessageToChat(activeChatId, { role: "user", content: chatInput });
    setChatInput("");
    setChatLoading(true);

    try {
      const currentMessages = activeChat?.messages || [];
      const chatHistoryForAi = [...currentMessages, { role: "user", content: chatInput }];
      
      const resp = await callLLM(chatHistoryForAi, `You are a senior QuantTerm platform expert specializing in strategy creation. Your goal is to help the user create complete, production-ready trading strategies.

STRATEGY CREATION WORKFLOW:
1. When the user describes a trading operational (natural language), identify what is missing and ask clarifying questions
2. Essential info needed: direction (CALL/PUT/ambos), expiry (quantas velas?), entry condition, asset, timeframe
3. Once you have all info, generate a COMPLETE TypeScript strategy using the Strategy interface (documented in your system prompt)
4. After generating the code, offer to deploy it automatically via ACTION_EXECUTE with CREATE_STRATEGY
5. **The system automatically backtests any created strategy and returns win rate, trades, and profit — use these results!**
6. If the win rate is below 60%, analyze the results and refine the strategy
7. You can iterate up to 10 times. When the win rate is good (≥60%), create a robot via CREATE_ROBOT

IMPORTANT: Always generate proper TypeScript with the Strategy interface, not generic JavaScript. The code must be ready for production deployment — it will be compiled by the platform strategy engine.

If the user description is missing critical info, ask specific questions before generating code. Be concise but thorough.`);
      addMessageToChat(activeChatId, { role: "assistant", content: resp });
    } catch (e: any) {
      toast.error(e.message || "Erro ao comunicar com a IA");
    } finally {
      setChatLoading(false);
    }
  };

  const handleCreateRobotFromPrompt = async () => {
    if (!chatInput.trim() || !activeChatId) return toast.error("Escreva um prompt descrevendo a estratégia para a IA criar o robô.");
    
    setChatLoading(true);
    try {
      // Tenta obter contexto do mercado atual para ajudar a IA
      let marketContext = "";
      try {
        const cacheRes = await fetch(`/api/market/history/${asset}?interval=${timeframe}`);
        if (cacheRes.ok) {
          const cacheData = await cacheRes.json();
          if (cacheData.success && cacheData.data?.length > 0) {
            const lastCandles = cacheData.data.slice(-20);
            marketContext = `Current Market Context (${asset}, ${timeframe}s): Last 20 candles: ${JSON.stringify(lastCandles.map((c: any) => c.close))}`;
          }
        }
      } catch (e) {
        console.warn("Could not fetch market context for autonomous creation", e);
      }

      const promptText = `Based on the following instruction, write a COMPLETE TypeScript strategy for the QuantTerm platform.
Instruction: ${chatInput}
${marketContext}

The strategy MUST use the correct Strategy interface (you have full documentation in the system prompt):
1. Use "import { Strategy, StrategyContext, StrategyResult } from './index';"
2. Export default the Strategy object
3. Use ctx.indicators.* for ALL indicators — NEVER import indicators directly
4. Check ctx.history.length for minimum data
5. Check ctx.hasOpenTrade before entering
6. Use isFinite() to validate indicator values
7. Choose a UNIQUE id (snake_case) that is NOT in the existing list
8. Return StrategyResult | null (null = no signal)
9. If marketContext is provided, note the current price action context

Respond ONLY with valid TypeScript code. No markdown codeblocks. Just the code.`;

      const aiResponseText = await callLLM([{ role: "user", content: promptText }], "You are an autonomous QuantTerm strategy developer. Generate ONLY production-ready TypeScript strategies using the proper Strategy interface.");
      const cleanedCode = aiResponseText.replace(/^```javascript/g, '').replace(/^```/g, '').replace(/```$/g, '').trim();

      const newStrategyName = "AI_" + chatInput.slice(0, 15).replace(/\s+/g, '_') + "_" + Date.now().toString().slice(-4);
      await saveAiStrategy(cleanedCode, newStrategyName);
      
      addMessageToChat(activeChatId, { role: "user", content: `[CRIAR ROBÔ] ${chatInput}` });
      addMessageToChat(activeChatId, { role: "assistant", content: `Robô "${newStrategyName}" criado com sucesso a partir do seu prompt! Verifique na aba Robôs para ativar.` });
      
      setChatInput("");
      refreshRobots();
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar robô com IA");
    } finally {
      setChatLoading(false);
    }
  };

  // ─── Autonomous AI Trader ─────────────────────────────────────────────

  const addToAutoLog = (type: "info" | "trade" | "error" | "thinking", msg: string) => {
    setAutoLog(prev => [...prev.slice(-200), { ts: Date.now(), msg, type }]);
    setTimeout(() => autoLogRef.current?.scrollTo({ top: autoLogRef.current.scrollHeight, behavior: "smooth" }), 50);
  };

  const computeIndicators = (candles: any[]) => {
    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const lastPrice = closes[closes.length - 1];

    // RSI(14)
    let rsi = 50;
    if (closes.length > 15) {
      let gains = 0, losses = 0;
      for (let i = closes.length - 14; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains += diff; else losses -= diff;
      }
      const avgGain = gains / 14, avgLoss = losses / 14;
      if (avgLoss === 0) rsi = 100;
      else rsi = 100 - 100 / (1 + avgGain / avgLoss);
    }

    // SMA 9, 21
    const sma = (period: number) => {
      if (closes.length < period) return lastPrice;
      return closes.slice(-period).reduce((a, b) => a + b, 0) / period;
    };
    const sma9 = sma(9), sma21 = sma(21);

    // ATR(14)
    let atr = 0;
    if (closes.length > 15) {
      const trs = [];
      for (let i = closes.length - 14; i < closes.length; i++) {
        const h = highs[i], l = lows[i], pc = closes[i - 1];
        trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
      }
      atr = trs.reduce((a, b) => a + b, 0) / trs.length;
    }

    // Price action
    const lastCandle = candles[candles.length - 1];
    const prevCandle = candles[candles.length - 2];
    const candleBody = Math.abs(lastCandle.close - lastCandle.open);
    const candleRange = lastCandle.high - lastCandle.low;
    const bodyPct = candleRange > 0 ? (candleBody / candleRange) * 100 : 50;
    const isGreen = lastCandle.close > lastCandle.open;
    const isGreenPrev = prevCandle.close > prevCandle.open;

    return { rsi: rsi.toFixed(1), sma9: sma9.toFixed(4), sma21: sma21.toFixed(4), atr: atr.toFixed(4), lastPrice: lastPrice.toFixed(4), isGreen, isGreenPrev, bodyPct: bodyPct.toFixed(0) };
  };

  const executeAutoTrade = async () => {
    setAutoLoading(true);
    try {
      // 1. Fetch candles
      const cacheRes = await fetch(`/api/market/history/${autoAsset}?interval=${autoTimeframe}`);
      if (!cacheRes.ok) throw new Error("Falha ao buscar dados de mercado");
      const cacheData = await cacheRes.json();
      if (!cacheData.success || !cacheData.data?.length) throw new Error("Sem dados de mercado disponíveis");
      const candles: any[] = cacheData.data.slice(-60);

      const indicators = computeIndicators(candles);
      const lastCandles = candles.slice(-10).map((c: any) => ({ o: c.open.toFixed(4), h: c.high.toFixed(4), l: c.low.toFixed(4), c: c.close.toFixed(4) }));

      addToAutoLog("thinking", "Analisando mercado...");

      // 2. Call LLM
      const marketContext = `Ativo: ${autoAsset}
Timeframe: ${autoTimeframe}s
Preço Atual: ${indicators.lastPrice}
RSI(14): ${indicators.rsi}
SMA9: ${indicators.sma9}
SMA21: ${indicators.sma21}
ATR(14): ${indicators.atr}
Última vela: ${indicators.isGreen ? "ALTA" : "BAIXA"} (corpo: ${indicators.bodyPct}%)
Vela anterior: ${indicators.isGreenPrev ? "ALTA" : "BAIXA"}
Últimas 10 velas (OHLC): ${JSON.stringify(lastCandles)}`;

      const userPrompt = `INSTRUÇÃO DO USUÁRIO: ${autoPrompt}

DADOS ATUAIS DO MERCADO:
${marketContext}

Com base na instrução acima e nos dados de mercado, decida se deve COMPRAR (CALL), VENDER (PUT) ou AGUARDAR (HOLD).

Responda APENAS com um JSON nesta formato exato:
{"decision": "CALL" | "PUT" | "HOLD", "reason": "explicação curta em português do motivo da decisão"}`;

      const rawResponse = await callLLM(
        [{ role: "user", content: userPrompt }],
        "Você é um trader algorítmico especializado em opções binárias. Responda SEMPRE com JSON válido. Seja conservador: só opere quando tiver alta convicção."
      );

      // 3. Parse response
      let decision: "CALL" | "PUT" | "HOLD" = "HOLD";
      let reason = "Sem resposta clara da IA";
      try {
        const jsonMatch = rawResponse.match(/\{[^]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          decision = parsed.decision || "HOLD";
          reason = parsed.reason || reason;
        }
      } catch { /* use defaults */ }

      addToAutoLog("thinking", `Decisão: ${decision} — ${reason}`);

      // 4. Execute trade if decision is CALL or PUT
      if (decision === "CALL" || decision === "PUT") {
        addToAutoLog("info", `Executando ${decision} de $${autoStake} em ${autoAsset}...`);
        const result = await derivAPI.buyContract(autoAsset, autoStake, decision, parseInt(autoTimeframe));
        if (result) {
          const tradeEntry = { ts: Date.now(), asset: autoAsset, type: decision, reason, result: "OPEN" as const, pnl: 0 };
          setAutoTrades(prev => [tradeEntry, ...prev]);
          addToAutoLog("trade", `✅ ${decision} executado em ${autoAsset} por $${autoStake}`);
          useStore.getState().addTrade({
            id: result.contract_id?.toString() || `auto_${Date.now()}`,
            asset: autoAsset,
            type: decision,
            amount: autoStake,
            entry: parseFloat(indicators.lastPrice),
            result: "OPEN",
            pnl: 0,
            ts: Date.now(),
            durationS: parseInt(autoTimeframe),
            mode: "demo",
            strategyId: "ai_auto",
          });
          toast.success(`${decision} executado via IA autônoma!`);
        }
      } else {
        addToAutoLog("info", "⏳ Nenhuma operação no momento. Aguardando...");
      }

    } catch (err: any) {
      addToAutoLog("error", `Erro: ${err.message}`);
      console.error("[AutoTrader]", err);
    } finally {
      setAutoLoading(false);
    }
  };

  const startAutoTrader = () => {
    if (autoRunning || !autoPrompt.trim()) {
      if (!autoPrompt.trim()) toast.error("Escreva um prompt com a estratégia primeiro!");
      return;
    }
    if (!aiConfig.apiKey && aiConfig.provider !== "ollama") {
      toast.error("Configure a chave de API da IA nas configurações!");
      return;
    }

    setAutoRunning(true);
    addToAutoLog("info", "🚀 Robô Autônomo iniciado!");
    addToAutoLog("info", `Ativo: ${autoAsset} | Timeframe: ${autoTimeframe}s | Stake: $${autoStake}`);
    addToAutoLog("info", `Prompt: "${autoPrompt}"`);

    // Execute immediately, then every N seconds
    executeAutoTrade();
    const intervalMs = Math.max(parseInt(autoTimeframe) * 1000, 15000); // at least 15s between calls
    autoIntervalRef.current = setInterval(executeAutoTrade, intervalMs);
  };

  const stopAutoTrader = () => {
    if (autoIntervalRef.current) {
      clearInterval(autoIntervalRef.current);
      autoIntervalRef.current = null;
    }
    setAutoRunning(false);
    addToAutoLog("info", "⛔ Robô Autônomo parado.");
    toast.info("Robô autônomo desativado.");
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoIntervalRef.current) clearInterval(autoIntervalRef.current);
    };
  }, []);

  return (
    <AppShell>
      <div className="p-4 h-full flex flex-col overflow-y-auto no-scrollbar gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            IA & Automação Inteligente
          </h1>
          <p className="text-xs text-muted-foreground max-w-sm text-right">
            Conecte-se a serviços de IA (OpenRouter, OpenAI ou Ollama local) para analisar os dados e criar scripts de forma autônoma.
          </p>
        </div>

        <Tabs defaultValue="discovery" className="w-full h-full flex flex-col min-h-0">
          <TabsList className="bg-card w-full justify-start border-b border-border rounded-none h-auto p-0 mb-4 bg-transparent grid grid-cols-3 md:w-auto md:flex">
            <TabsTrigger value="discovery" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3">
              <BrainCircuit className="h-4 w-4 mr-2" /> Data Mining
            </TabsTrigger>
            <TabsTrigger value="auto" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3">
              <Bot className="h-4 w-4 mr-2" /> Autônomo
            </TabsTrigger>
            <TabsTrigger value="chat" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3">
              <MessageSquare className="h-4 w-4 mr-2" /> Chat & Robô Autônomo
            </TabsTrigger>
          </TabsList>

          <TabsContent value="discovery" className="m-0 flex-1 min-h-0">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* CONFIGURE AI/MCP */}
              <Card className="bg-secondary/20 border-border/50 md:col-span-1 relative isolate">
                <CardHeader className="py-3 px-4 border-b border-border/50">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Server className="h-4 w-4 text-warning" /> AI / MCP Config
                  </CardTitle>
                  <CardDescription className="text-[10px]">
                    Defina a URL Base e chaves de API da IA
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground uppercase font-bold">Provedor</label>
                    <Select 
                      value={aiConfig.provider || ""} 
                      onValueChange={(val: any) => {
                        const updates: any = { provider: val };
                        if (val === "openrouter") {
                          updates.baseUrl = "https://openrouter.ai/api/v1/chat/completions";
                        }
                        updateAiConfig(updates);
                      }}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openrouter">OpenRouter (Recomendado)</SelectItem>
                        <SelectItem value="openai">OpenAI (Direct API)</SelectItem>
                        <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                        <SelectItem value="gemini">Google Gemini (Vertex/AI Studio)</SelectItem>
                        <SelectItem value="ollama">Ollama (Localhost)</SelectItem>
                        <SelectItem value="custom">Outro (OpenAI-compatible)</SelectItem>
                        <SelectItem value="mcp">MCP Server</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {aiConfig.provider === "mcp" ? (
                     <div className="space-y-1">
                       <label className="text-[10px] text-muted-foreground uppercase font-bold">MCP Server URL</label>
                       <Input 
                         value={aiConfig.mcpUrl || ""} 
                         onChange={(e) => updateAiConfig({ mcpUrl: e.target.value })}
                         placeholder="http://localhost:3000/sse" 
                         className="h-8 font-mono text-xs" 
                       />
                       <p className="text-[9px] text-muted-foreground mt-1">Conecta a um servidor MCP via SSE ou HTTP.</p>
                     </div>
                  ) : (
                    <>
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground uppercase font-bold">Base URL / Endpoint</label>
                        <Input 
                          value={aiConfig.baseUrl || ""} 
                          onChange={(e) => updateAiConfig({ baseUrl: e.target.value })}
                          className="h-8 font-mono text-[10px]" 
                          placeholder="https://api.openai.com/v1/chat/completions"
                        />
                        <p className="text-[9px] text-muted-foreground mt-1">Para compatibilidade OpenAI, use o endpoint completo (ex: .../v1/chat/completions).</p>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground uppercase font-bold">Modelo</label>
                        {aiConfig.provider === "openrouter" ? (
                          <div className="space-y-1">
                            {showManualModelInput ? (
                              <div className="flex gap-1">
                                <Input
                                  value={aiConfig.model || ""}
                                  onChange={(e) => updateAiConfig({ model: e.target.value })}
                                  className="h-8 flex-1 font-mono text-xs"
                                  placeholder="Ex: anthropic/claude-opus-4"
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 shrink-0"
                                  onClick={() => { setShowManualModelInput(false); setModelSearch(""); }}
                                  title="Voltar à lista"
                                >
                                  <EyeOff className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <>
                                <div className="flex gap-1">
                                  <div className="relative flex-1">
                                    <Input
                                      value={modelSearch}
                                      onChange={(e) => setModelSearch(e.target.value)}
                                      className="h-8 pl-6 pr-2 text-xs"
                                      placeholder="Pesquisar modelos..."
                                    />
                                    <Search className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 shrink-0"
                                    onClick={() => setShowManualModelInput(true)}
                                    title="Inserir modelo manualmente"
                                  >
                                    <PenLine className="h-3 w-3" />
                                  </Button>
                                </div>
                                <div className="relative z-10">
                                  <select
                                    size={6}
                                    value={aiConfig.model || ""}
                                    onChange={(e) => { updateAiConfig({ model: e.target.value }); setModelSearch(""); }}
                                    className="w-full h-[200px] bg-black/20 border border-border/30 rounded text-xs text-muted-foreground cursor-pointer p-1 focus:outline-none focus:ring-1 focus:ring-ring"
                                  >
                                    {fetchingModels ? (
                                      <option value="" disabled className="text-muted-foreground">A carregar modelos...</option>
                                    ) : openRouterModels.length === 0 ? (
                                      <option value="" disabled className="text-muted-foreground">Nenhum modelo encontrado.</option>
                                    ) : (
                                      openRouterModels
                                        .filter(m => !modelSearch || m.name.toLowerCase().includes(modelSearch.toLowerCase()) || m.id.toLowerCase().includes(modelSearch.toLowerCase()))
                                        .slice(0, 50)
                                        .map(m => (
                                          <option key={m.id} value={m.id} className="py-1">
                                            {m.name}
                                          </option>
                                        ))
                                    )}
                                  </select>
                                  {!fetchingModels && openRouterModels.length === 0 && (
                                    <Button variant="link" size="sm" className="text-[10px] h-6 mt-1" onClick={fetchOpenRouterModels}>
                                      Tentar novamente
                                    </Button>
                                  )}
                                </div>
                                {aiConfig.model && (
                                  <p className="text-[9px] text-primary truncate">Selecionado: {aiConfig.model}</p>
                                )}
                              </>
                            )}
                          </div>
                        ) : (
                          <Input 
                            value={aiConfig.model || ""} 
                            onChange={(e) => updateAiConfig({ model: e.target.value })}
                            className="h-8" 
                            placeholder="gpt-4o, llama3, anthropic/claude-3-haiku"
                          />
                        )}
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground uppercase font-bold">API Key</label>
                        <div className="relative">
                          <Input 
                            type={showApiKey ? "text" : "password"}
                            value={aiConfig.apiKey || ""} 
                            onChange={(e) => updateAiConfig({ apiKey: e.target.value })}
                            className="h-8 pr-8" 
                            placeholder="sk-..."
                            autoComplete="off"
                          />
                          <button 
                            type="button" 
                            onClick={() => setShowApiKey(!showApiKey)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                          >
                            {showApiKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* ESTRATÉGIA IA */}
              <Card className="bg-secondary/20 border-border/50 md:col-span-2 flex flex-col min-h-0">
                <CardHeader className="py-3 px-4 border-b border-border/50 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <BrainCircuit className="h-4 w-4 text-primary" /> Descobrir Estratégia
                    </CardTitle>
                    <CardDescription className="text-[10px]">
                      Analisa o mercado em backtest e programa automaticamente uma estratégia
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="p-4 flex-1 flex flex-col gap-4 min-h-0">
                  <div className="flex items-end gap-3 flex-wrap">
                    <div className="space-y-1 w-32">
                      <label className="text-[10px] text-muted-foreground uppercase font-bold">Ativo</label>
                      <Select value={asset} onValueChange={setAsset}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="R_100">Volatility 100</SelectItem>
                          <SelectItem value="R_10">Volatility 10</SelectItem>
                          <SelectItem value="1HZ100V">Vol 100 (1s)</SelectItem>
                          <SelectItem value="RDBULL">Bull Bull</SelectItem>
                          <SelectItem value="RDBEAR">Bear Market</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-1 w-24">
                      <label className="text-[10px] text-muted-foreground uppercase font-bold">Timeframe</label>
                      <Select value={timeframe} onValueChange={setTimeframe}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="60">1 Min</SelectItem>
                          <SelectItem value="300">5 Min</SelectItem>
                          <SelectItem value="900">15 Min</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1 w-24">
                      <label className="text-[10px] text-muted-foreground uppercase font-bold">Amostra (Velas)</label>
                      <Input type="number" value={candlesCount} onChange={(e) => setCandlesCount(e.target.value)} className="h-8" />
                    </div>

                    <div className="flex items-center gap-2 h-8 mr-2 px-2 border border-border/30 rounded bg-secondary/10">
                       <label className="text-[10px] text-muted-foreground cursor-pointer flex items-center gap-1">
                         <Input 
                           type="checkbox" 
                           className="h-3 w-3" 
                           checked={useBrokerFallback} 
                           onChange={(e) => setUseBrokerFallback(e.target.checked)} 
                         />
                         Broker Fallback
                       </label>
                    </div>

                    <Button 
                      onClick={runDiscovery} 
                      disabled={loading}
                      className="h-8 ml-auto font-bold tracking-widest text-[#09090b] shadow-[0_0_15px_rgba(234,179,8,0.4)] hover:shadow-[0_0_25px_rgba(234,179,8,0.6)]"
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Bot className="h-4 w-4 mr-2" />}
                      ANALISAR & CRIAR
                    </Button>
                  </div>

                  {analysisResult && (
                    <div className="text-xs text-primary p-2 bg-primary/10 border border-primary/20 rounded">
                      💡 {analysisResult}
                    </div>
                  )}

                  <div className="flex-1 flex flex-col gap-2 min-h-[300px]">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-muted-foreground uppercase font-bold">Script da Estratégia (IA ou Manual)</label>
                    </div>
                    <Textarea 
                      value={generatedCode} 
                      onChange={(e) => setGeneratedCode(e.target.value)}
                      className="flex-1 font-mono text-xs bg-[#0f111a] border-border/50 resize-none p-4" 
                      placeholder="// Clique em Analisar & Criar para gerar ou cole o seu código aqui..."
                    />
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <Input 
                      value={strategyName} 
                      onChange={(e) => setStrategyName(e.target.value)}
                      className="h-9 w-64 uppercase tracking-widest text-xs" 
                      placeholder="NOME DA ESTRATÉGIA"
                    />
                    <Button onClick={() => saveAiStrategy(generatedCode, strategyName)} variant="outline" className="h-9 text-xs">
                      <Save className="h-4 w-4 mr-2" />
                      SALVAR COMO ROBÔ
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ─── Autonomous AI Trader Tab ───────────────────────────────── */}
          <TabsContent value="auto" className="m-0 flex-1 min-h-0">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
              {/* Left: Config + Controls */}
              <div className="md:col-span-1 space-y-3">
                <Card className="bg-secondary/20 border-border/50">
                  <CardHeader className="py-3 px-4 border-b border-border/50">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <Bot className="h-4 w-4 text-primary" /> Configuração do Robô Autônomo
                    </CardTitle>
                    <CardDescription className="text-[10px]">
                      A IA opera diretamente com base no seu prompt
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground uppercase font-bold">Prompt / Estratégia</label>
                      <Textarea
                        value={autoPrompt}
                        onChange={(e) => setAutoPrompt(e.target.value)}
                        placeholder='Ex: "Compra CALL quando RSI estiver abaixo de 30 e vela for de alta. Compra PUT quando RSI acima de 70 e vela for de baixa."'
                        className="min-h-[100px] font-mono text-xs resize-none"
                        disabled={autoRunning}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground uppercase font-bold">Ativo</label>
                        <Select value={autoAsset} onValueChange={setAutoAsset} disabled={autoRunning}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="R_100">Volatility 100</SelectItem>
                            <SelectItem value="R_10">Volatility 10</SelectItem>
                            <SelectItem value="1HZ100V">Vol 100 (1s)</SelectItem>
                            <SelectItem value="RDBULL">Bull Market</SelectItem>
                            <SelectItem value="RDBEAR">Bear Market</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground uppercase font-bold">Timeframe</label>
                        <Select value={autoTimeframe} onValueChange={setAutoTimeframe} disabled={autoRunning}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="60">1 Min</SelectItem>
                            <SelectItem value="300">5 Min</SelectItem>
                            <SelectItem value="900">15 Min</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground uppercase font-bold">Stake ($)</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={1}
                          max={20}
                          step={1}
                          value={autoStake}
                          onChange={(e) => setAutoStake(parseInt(e.target.value))}
                          className="flex-1 h-1.5 accent-primary"
                          disabled={autoRunning}
                        />
                        <span className="text-sm font-bold text-primary w-6 text-right">${autoStake}</span>
                      </div>
                    </div>

                    {!autoRunning ? (
                      <Button onClick={startAutoTrader} className="w-full h-10 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white" disabled={!autoPrompt.trim()}>
                        <Play className="h-4 w-4 mr-2" /> INICIAR ROBÔ AUTÔNOMO
                      </Button>
                    ) : (
                      <Button onClick={stopAutoTrader} className="w-full h-10 text-xs font-bold bg-red-600 hover:bg-red-700 text-white">
                        <Square className="h-4 w-4 mr-2" /> PARAR ROBÔ AUTÔNOMO
                      </Button>
                    )}

                    {autoRunning && (
                      <div className="flex items-center gap-2 text-[10px] text-emerald-400 animate-pulse">
                        <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                        IA operando em tempo real...
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Trade Summary */}
                <Card className="bg-secondary/20 border-border/50">
                  <CardHeader className="py-2 px-4 border-b border-border/50">
                    <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase">Resumo da Sessão</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 space-y-2">
                    {autoTrades.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground italic">Nenhuma operação ainda</p>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="bg-black/30 p-2 rounded border border-white/5">
                            <div className="text-lg font-black text-white">{autoTrades.length}</div>
                            <div className="text-[8px] text-muted-foreground uppercase">Trades</div>
                          </div>
                          <div className="bg-black/30 p-2 rounded border border-white/5">
                            <div className="text-lg font-black text-bull">{autoTrades.filter(t => t.result === "WIN").length}</div>
                            <div className="text-[8px] text-muted-foreground uppercase">Wins</div>
                          </div>
                          <div className="bg-black/30 p-2 rounded border border-white/5">
                            <div className="text-lg font-black text-bear">{autoTrades.filter(t => t.result === "LOSS").length}</div>
                            <div className="text-[8px] text-muted-foreground uppercase">Losses</div>
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Right: Live Log + Trade History */}
              <div className="md:col-span-2 space-y-3">
                {/* Live Log */}
                <Card className="bg-secondary/20 border-border/50">
                  <CardHeader className="py-2 px-4 border-b border-border/50 flex flex-row items-center justify-between">
                    <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-2">
                      <Clock className="h-3 w-3" /> Log de Decisões da IA
                      {autoRunning && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                    </CardTitle>
                    <button onClick={() => setAutoLog([])} className="text-[9px] text-muted-foreground hover:text-white">
                      Limpar
                    </button>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div ref={autoLogRef} className="h-[300px] overflow-y-auto p-3 space-y-1 font-mono text-[10px]">
                      {autoLog.length === 0 && (
                        <p className="text-muted-foreground italic p-4 text-center">Log aguardando início...</p>
                      )}
                      {autoLog.map((entry, i) => (
                        <div key={i} className={`flex items-start gap-2 ${
                          entry.type === "error" ? "text-red-400" :
                          entry.type === "trade" ? "text-emerald-400" :
                          entry.type === "thinking" ? "text-amber-400/70" :
                          "text-muted-foreground"
                        }`}>
                          <span className="text-[8px] text-muted-foreground/50 shrink-0 w-14">
                            {new Date(entry.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                          <span className="break-words">{entry.type === "thinking" ? "🤔" : entry.type === "trade" ? "💹" : entry.type === "error" ? "❌" : "ℹ️"} {entry.msg}</span>
                        </div>
                      ))}
                      {autoLoading && (
                        <div className="flex items-center gap-2 text-amber-400/70">
                          <Loader2 className="h-3 w-3 animate-spin" /> IA pensando...
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Trades Table */}
                <Card className="bg-secondary/20 border-border/50">
                  <CardHeader className="py-2 px-4 border-b border-border/50">
                    <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-2">
                      <TrendingUp className="h-3 w-3" /> Histórico de Operações
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="text-[9px] text-muted-foreground uppercase border-b border-border/50">
                          <th className="p-2 text-left">Hora</th>
                          <th className="p-2 text-left">Ativo</th>
                          <th className="p-2 text-center">Direção</th>
                          <th className="p-2 text-left">Motivo</th>
                          <th className="p-2 text-center">Resultado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {autoTrades.length === 0 && (
                          <tr><td colSpan={5} className="p-4 text-center text-muted-foreground italic text-[10px]">Nenhuma operação executada</td></tr>
                        )}
                        {autoTrades.slice(0, 50).map((t, i) => (
                          <tr key={i} className="border-b border-border/30 hover:bg-white/5">
                            <td className="p-2 text-muted-foreground text-[10px]">{new Date(t.ts).toLocaleTimeString()}</td>
                            <td className="p-2 text-primary font-bold text-[10px]">{t.asset}</td>
                            <td className={`p-2 text-center font-bold ${t.type === "CALL" || t.type === "BUY" ? "text-bull" : "text-bear"}`}>{t.type}</td>
                            <td className="p-2 text-[10px] text-muted-foreground max-w-[250px] truncate" title={t.reason}>{t.reason}</td>
                            <td className="p-2 text-center">
                              {t.result === "WIN" ? <span className="text-bull text-[10px] font-bold">WIN</span> :
                               t.result === "LOSS" ? <span className="text-bear text-[10px] font-bold">LOSS</span> :
                               <span className="text-muted-foreground text-[10px]">⌛</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="chat" className="m-0 flex-1 min-h-0 flex flex-row gap-4">
             {/* Chat List Sidebar */}
             <Card className="hidden md:flex flex-col w-64 bg-secondary/20 border-border/50 overflow-hidden">
                <CardHeader className="py-3 px-4 border-b border-border/50 bg-card/50">
                   <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Conversas</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => createChat()}>
                         <Sparkles className="h-3 w-3" />
                      </Button>
                   </div>
                </CardHeader>
                <CardContent className="p-2 overflow-y-auto no-scrollbar flex-1 space-y-1">
                   {marketSnapshot && (
                     <div className="mb-4 space-y-1 p-2 bg-primary/5 rounded border border-primary/20">
                        <p className="text-[9px] font-bold text-primary uppercase mb-1 flex items-center gap-1">
                           <Eye className="h-2 w-2" /> Live Market Feed
                        </p>
                        {Object.entries(marketSnapshot).map(([sym, data]: [string, any]) => (
                          <div key={sym} className="flex items-center justify-between text-[10px]">
                            <span className="text-muted-foreground">{sym}</span>
                            <span className={data.change >= 0 ? "text-green-500" : "text-red-500"}>
                              {data.lastPrice.toFixed(2)}
                            </span>
                          </div>
                        ))}
                     </div>
                   )}

                   <Button 
                      variant="outline" 
                      className="w-full justify-start text-[10px] h-8 border-dashed border-primary/30 text-primary hover:bg-primary/5 mb-2"
                      onClick={() => createChat()}
                   >
                      <Sparkles className="h-3 w-3 mr-2" /> Nova Conversa
                   </Button>
                   {chats.map(chat => (
                      <div 
                        key={chat.id} 
                        className={`group relative flex items-center p-2 rounded-md cursor-pointer transition-colors ${activeChatId === chat.id ? 'bg-primary/20 text-primary border border-primary/30' : 'hover:bg-card text-muted-foreground'}`}
                        onClick={() => setActiveChatId(chat.id)}
                      >
                         <MessageSquare className="h-3 w-3 mr-2 flex-shrink-0" />
                         <span className="text-[11px] truncate pr-4">{chat.title}</span>
                         <button 
                            className="absolute right-1 opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                            onClick={(e) => {
                               e.stopPropagation();
                               deleteChat(chat.id);
                            }}
                         >
                            <EyeOff className="h-3 w-3" />
                         </button>
                      </div>
                   ))}
                </CardContent>
             </Card>

             <Card className="bg-secondary/20 border-border/50 flex flex-col flex-1 h-full overflow-hidden">
                <CardHeader className="py-3 px-4 border-b border-border/50 flex-shrink-0 flex flex-row justify-between items-center bg-card">
                  <div className="flex items-center gap-3">
                    <div className="md:hidden">
                       <Select value={activeChatId || ""} onValueChange={setActiveChatId}>
                          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Chats" /></SelectTrigger>
                          <SelectContent>
                             {chats.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                             <SelectItem value="new" onClick={() => createChat()}>+ Novo Chat</SelectItem>
                          </SelectContent>
                       </Select>
                    </div>
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-2 text-primary">
                        <Bot className="h-5 w-5" /> {activeChat?.title || "Assistente"}
                      </CardTitle>
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                    IA Pronta
                  </div>
                </CardHeader>
                <CardContent className="flex-1 p-4 overflow-y-auto space-y-4">
                  {(!activeChat || activeChat.messages.length === 0) && (
                    <div className="flex flex-col items-center justify-center h-full opacity-50 text-center space-y-2">
                       <Bot className="h-12 w-12 text-muted-foreground" />
                       <p className="text-sm font-medium">Como posso ajudar?</p>
                       <p className="text-xs max-w-sm">Diga-me o que quer construir: "Cria um robô que compra Call quando o RSI cruza os 30 para cima no R_100".</p>
                    </div>
                  )}
                  {activeChat?.messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                       <div className={`max-w-[80%] p-3 rounded-lg text-sm ${msg.role === 'user' ? 'bg-primary/20 text-primary-foreground border border-primary/30' : 'bg-muted border border-border/50'}`}>
                          {msg.role === "assistant" && <Bot className="h-3 w-3 inline-block mr-1 opacity-70 mb-1" />}
                          <span className="whitespace-pre-wrap font-mono text-xs">{msg.content}</span>
                       </div>
                    </div>
                  ))}
                  {/* ── Live Test Log ── */}
                  {testLog.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {testLog.map((entry, i) => (
                        <div key={i} className="flex justify-start">
                          <div className="max-w-[90%] p-2.5 rounded-lg text-xs bg-blue-950/20 border border-blue-500/20 font-mono">
                            <span className="flex items-center gap-1.5 text-blue-300">
                              {entry.status === 'running' ? (
                                <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
                              ) : entry.status === 'done' ? (
                                <span className="text-green-400">✓</span>
                              ) : entry.status === 'error' ? (
                                <span className="text-red-400">✗</span>
                              ) : (
                                <span className="text-yellow-400">○</span>
                              )}
                              <span className={entry.status === 'error' ? 'text-red-300' : ''}>{entry.step}</span>
                            </span>
                            {entry.detail && (
                              <span className="text-[10px] text-blue-400/60 block mt-1 ml-5">{entry.detail}</span>
                            )}
                          </div>
                        </div>
                      ))}
                      <div ref={testLogEndRef} />
                    </div>
                  )}
                  {chatLoading && (
                    <div className="flex justify-start">
                       <div className="max-w-[80%] p-3 rounded-lg text-sm bg-muted border border-border/50 flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin"/> Mente IA a processar...
                       </div>
                    </div>
                  )}
                </CardContent>
                <CardFooter className="p-4 border-t border-border/50 flex-shrink-0 bg-card gap-2 flex-col">
                  <div className="w-full flex flex-wrap gap-2 mb-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-[9px] h-6 border-primary/30 text-primary uppercase"
                      onClick={() => {
                        setChatInput("Analise o snapshot do mercado, identifique a melhor oportunidade e crie/inicie um robô autônomo para mim agora.");
                      }}
                    >
                      🚀 Operação Full Autônoma
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-[9px] h-6 border-primary/30 text-primary uppercase"
                      onClick={() => {
                        setChatInput("Como estão meus robôs? Algum precisa ser parado?");
                      }}
                    >
                      📊 Status dos Robôs
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-[9px] h-6 border-primary/30 text-primary uppercase"
                      onClick={() => {
                        setChatInput("Analise profundamente o desempenho do robô X e sugira melhorias.");
                      }}
                    >
                      🔬 Analisar Robô
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-[9px] h-6 border-primary/30 text-primary uppercase"
                      onClick={() => {
                        setChatInput("Importe as operações/trades do robô X para as estatísticas de performance.");
                      }}
                    >
                      📥 Importar Trades para Estatísticas
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-[9px] h-6 border-primary/30 text-primary uppercase"
                      onClick={() => {
                        setChatInput("Crie uma nova estratégia inovadora baseada em Price Action e MACD e salve no sistema.");
                      }}
                    >
                      💡 Nova Estratégia
                    </Button>
                  </div>
                  <div className="flex gap-2 w-full">
                    <Input 
                      value={chatInput} 
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Descreva a estratégia ou peça 'Operação Autônoma'..." 
                      className="flex-1 h-10 font-mono text-xs"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                    />
                    <Button onClick={handleSendMessage} disabled={chatLoading || !chatInput.trim()} className="w-10 p-0 h-10">
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="w-full flex justify-end gap-2 mt-2">
                    <Button onClick={handleSendMessage} disabled={chatLoading || !chatInput.trim()} variant="outline" className="text-xs h-8 border-primary/50 text-primary hover:bg-primary/10 w-full animate-pulse">
                      <Bot className="h-3 w-3 mr-1" /> EXECUTAR COMANDO AUTÔNOMO
                    </Button>
                  </div>
                </CardFooter>
             </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

