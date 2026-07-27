# Documentação do Sistema de Estratégias

## 📁 Estrutura de Diretórios
O sistema foi projetado para ser totalmente dinâmico. Todas as estratégias devem ser colocadas na pasta `/src/strategies/`.
Nenhuma alteração é necessária no core do aplicativo ao adicionar uma nova estratégia. Ao salvar um script via a UI (botão "Novo Script"), o arquivo é:
1. **Salvo no backend** (`POST /api/strategies`) → Gravado no disco em `src/strategies/<id>.ts`
2. **Listado no frontend** (`GET /api/strategies`) → Lido pelo servidor e exibido na UI
3. **Carregado pelo Robot Engine** → Transpilado via esbuild e executado em sandbox

## 🖼️ Interface Obrigatória
Cada estratégia deve implementar a interface `Strategy`:
```typescript
import { Strategy, StrategyContext, StrategyResult } from "./index";

const MinhaEstrategia: Strategy = {
  id: "id_unico_da_estrategia",
  name: "Nome da Estratégia",
  description: "Descrição breve da lógica",
  category: "auto",           // "auto" ou "semi-auto"

  // Opcional: Estatísticas customizadas visíveis na página Stats
  customStatKeys: [
    { key: "metodo", label: "Método Utilizado" },
    { key: "confluencia", label: "Nível de Confluência", type: "number" }
  ],

  // Opcional: Filtros customizados na página de Estratégias
  customFilterKeys: [
    { key: "min_confluence", label: "Confluência Mínima", type: "range", defaultMin: 0, defaultMax: 5, step: 1 },
    { key: "method_filter", label: "Método", type: "multiselect", options: ["RSI_Bounce", "SR_Touch"] },
  ],

  onTick: (ctx: StrategyContext): StrategyResult | null => {
    // Lógica aqui
    return null;
  }
};

export default MinhaEstrategia;
```

## 🧠 Contexto (StrategyContext)
Ao executar `onTick(context)`, a estratégia recebe:

- `asset`: (string) O ativo atual (ex: "R_100");
- `lastPrice`: (number) O preço da última vela **fechada**.
- `currentPrice`: (number) O preço **atual** (tick em tempo real).
- `history`: **Array de objetos** `{t, o, h, l, c}` das velas fechadas.
- `candles`: **Array de velas** (tipo `Candle[]`) das velas fechadas (equivalente ao history, mas tipado).
- `balance`: (number) Saldo atual do usuário.
- `tradingMode`: (string) "demo", "real" ou "backtest".
- `isBacktest`: (boolean) `true` se estiver em modo backtest.
- `intervalMs`: (number) Duração da vela em milissegundos (ex: 60000 = 1m).
- `candleTimeRemainingMs`: (number) Tempo restante até a vela atual fechar (ms). No backtest = 0.
- `hasOpenTrade`: (boolean) Se já existe um trade aberto neste ativo.
- `lastTrade`: (Trade | undefined) **Novo**: Objeto do último trade finalizado (WIN/LOSS). Permite criar lógicas que dependem do resultado da última operação (como recuperação, martingale, soros, ou pausa após derrota).
  - Um objeto `Trade` contém:
    - `id`: string do identificador único do trade.
    - `asset`: ativo (ex: "R_100").
    - `type`: direção do trade ("CALL", "PUT", "BUY", "SELL").
    - `amount`: valor/stake investido.
    - `pnl`: lucro ou prejuízo do trade.
    - `result`: resultado do trade ("WIN" ou "LOSS").
    - `ts`: timestamp do trade.
- `srLines`: Array de linhas de suporte/resistência para este ativo.
- `srZones`: Array de zonas de compra/venda para este ativo.
- `activeFilters`: Filtros configurados pelo utilizador na página de Estratégias.
- `indicators`: Funções para acessar os indicadores técnicos mais comuns:
  - `indicators.rsi(period: number)`
  - `indicators.sma(period: number)`
  - `indicators.ema(period: number)`
  - `indicators.bollinger(period, multiplier)`
  - `indicators.adx(period)`
  - `indicators.macd(fast, slow, signal)`
  - `indicators.parabolicSar(afStep, afMax)` → **Novo**: SAR Nativo de alta performance.

- `getMTF(minutes: number)`: **Helper de Multi-Timeframe**. Retorna um array de velas (`Candle[]`) agrupadas pelo timeframe solicitado.
  - Exemplo: `ctx.getMTF(5)` retorna velas de 5 minutos.
  - Suporta qualquer timeframe (1, 2, 3, 5, 10, 15...).

> **⚠️ IMPORTANTE**: Todos os indicadores e o histórico são baseados EXCLUSIVAMENTE em velas já fechadas.
> O `t` (timestamp) das velas está em **milissegundos**. Para converter para minutos: `Math.floor(v.t / 60000)`.

## 🔄 Emitindo Sinais de Trading
Sua estratégia deve retornar um objeto `StrategyResult` se desejar abrir uma operação, ou `null` para aguardar.

Ao preencher `StrategyResult`:
- `action`: Pode ser `"CALL"`, `"PUT"` (opções binárias) ou `"BUY"`, `"SELL"` (forex).
- `duration`: opcional. Duração em segundos (usado em contas Demo/Reais).
- `expiryCandles`: **Recomendado**. Define em quantas velas a operação vai expirar. Obrigatório para backtesting preciso. Se não definido, no backtest ele faz uma heurística dividindo a duração definida no painel pelo timeframe atual.
- `stake`: opcional. Caso não fornecido, usará a stake configurada no painel do robô.
- `customStats`: opcional. Objeto com métricas personalizadas que aparecem nas Estatísticas e podem ser usados como filtros.
- `sequenceTrigger`: **Novo** opcional. Quando presente, ativa um **loop automático de entradas** na mesma direção enquanto a cor da vela confirmar a direção. A plataforma infere a cor esperada a partir do `action`:
  - `"CALL"` ou `"BUY"` → cor esperada = verde (`close > open`)
  - `"PUT"` ou `"SELL"` → cor esperada = vermelha (`close < open`)
  - Campos internos:
    - `maxEntradas?`: máximo de trades em sequência (default: 50)
    - `stopOnLoss?`: **Depreciado** — campo armazenado mas ignorado. A sequência só verifica a **cor da vela**; se a cor não corresponder à direção, o trade já é LOSS implicitamente.
    - `minConsecutiveCandles?`: Velas consecutivas da mesma cor exigidas **antes** de iniciar a sequência (default: 0 = entra imediatamente). Ex: `3` significa "só entra se as últimas 3 velas forem todas verdes" para CALL/BUY.

Exemplo de Operação ("CALL" expirando em 1 vela):
```typescript
return {
  action: "CALL",
  expiryCandles: 1,
  customStats: {
    metodo: "RSI_Oversold",
    confluencia: 3
  }
};
```

## 📊 Filtros Automáticos
Ao criar um robô a partir de uma estratégia, **todos os filtros configurados na página de Estratégias são copiados para o robô**. Isto inclui:
- Filtros builtin (RSI, ADX, MACD, Padrões de Vela, etc.)
- Filtros customizados definidos via `customFilterKeys`
- Filtros auto-gerados a partir de `customStatKeys`
- Estado de inversão global

Cada filtro suporta múltiplas faixas com ações:
- **Operar (allow)**: Só opera se o valor estiver nesta faixa
- **Ignorar (ignore)**: Bloqueia o sinal se o valor estiver nesta faixa
- **Inverter (invert)**: Inverte o sinal (CALL↔PUT) se o valor estiver nesta faixa

## ⏱️ Tempo de Expiração e Backtesting
No Modo Backtest, o sistema SIMULA o tempo baseado *estritamente em velas*. Não existem temporizadores de segundos (`setTimeout`).
A entrada no backtest é gravada no fechamento da vela atual (`idx`). Se `expiryCandles: 1`, a resolução ocorre comparando a entrada com o preço da próxima vela (`idx + 1`).

## 🤖 Robôs de Produção
Quando um robô é criado a partir de uma estratégia:
1. O `strategyFileName` é guardado para que o servidor encontre o ficheiro correto.
2. Todos os filtros configurados são copiados integralmente para o robô.
3. O estado de inversão global é também copiado.
4. No servidor (VPS), a estratégia é carregada via transpilação esbuild — não precisa de rebuild.
5. A análise usa **apenas velas fechadas** — nunca a vela em formação.

## 🔒 Boas Práticas
- Só execute chamadas (returns) quando um rompimento/condição ocorrer no frame de mudança.
- O sistema possui gestão de risco (Anti-Martingale, Stop-Loss, VDV), então você não precisa criar gestões de risco rígidas dentro da estratégia.
- Use `ctx.history[ctx.history.length - 1]` para acessar a **última vela fechada**.
- Use `ctx.lastPrice` para o preço atual do tick (vela em formação).
- Sempre verifique `ctx.hasOpenTrade` para evitar múltiplas ordens no mesmo ativo.
- Verifique `ctx.history.length` mínimo antes de usar indicadores (ex: RSI precisa de pelo menos 15 velas).
- Use `customStats` para rastrear qual "sub-método" da estratégia gerou cada trade — esses dados aparecem na página de Estatísticas e podem ser usados como filtros.

## 📦 Imports e Dependências
As estratégias são transpiladas em runtime. Para usar indicadores ou tipos, você **deve** importá-los:

```typescript
// Obrigatório para definir a estratégia
import { Strategy, StrategyContext, StrategyResult } from "./index";

// Se você usar indicadores diretamente (fora do ctx.indicators), importe aqui:
import { rsi, adx, sma, ema, bollinger, macd, type Candle } from "@/lib/market";
```

## 🛠️ Acessando Filtros na Prática
Os filtros configurados na UI chegam via `ctx.activeFilters`. O acesso varia conforme o tipo:

- **Range**: `filters.meu_filtro.ranges[0].min` (ou max)
- **Select**: `filters.meu_filtro.value` (string única)
- **Multiselect**: `filters.meu_filtro.values` (array de strings)

Exemplo de uso seguro:
```typescript
const filters = ctx.activeFilters || {};
if (filters.meu_multiselect?.enabled && filters.meu_multiselect.values?.includes("OPCAO_A")) {
  // ... lógica
}
```

## 🚀 Como usar o `lastTrade` (Exemplo Prático de Martingale ou Pausa)

A propriedade `ctx.lastTrade` contém o resultado do último trade fechado para a estratégia corrente. Veja um exemplo prático de como implementar uma lógica de alteração de stake para Martingale ou recuperação caso a última operação tenha sido LOSS:

```typescript
import { Strategy, StrategyContext, StrategyResult } from "./index";

const MinhaEstrategiaRecuperacao: Strategy = {
  id: "estrategia_recuperacao",
  name: "Recuperação Dinâmica",
  description: "Dobra o stake após perda (Martingale) e pausa após 2 derrotas consecutivas",
  category: "auto",

  onTick: (ctx: StrategyContext): StrategyResult | null => {
    if (ctx.history.length < 50) return null;
    if (ctx.hasOpenTrade) return null;

    let proximaStake = 2.0; // Stake base padrão

    // Analisar a última operação
    if (ctx.lastTrade) {
      if (ctx.lastTrade.result === "LOSS") {
        // Se perdeu o último trade, dobra a entrada anterior (Martingale simples)
        proximaStake = ctx.lastTrade.amount * 2;
        ctx.toast?.info(`Último trade foi LOSS. Dobrando stake para: $${proximaStake}`);
      } else if (ctx.lastTrade.result === "WIN") {
        ctx.toast?.success(`Último trade foi WIN! Retornando para stake base: $${proximaStake}`);
      }
    }

    // Condições fictícias para demonstrar o gatilho de sinal
    const superouRsiOversold = true; // Exemplo de sinal
    if (superouRsiOversold) {
      return {
        action: "CALL",
        expiryCandles: 1,
        stake: proximaStake, // Envia a stake calculada de forma dinâmica!
        customStats: {
          historico_pnl: ctx.lastTrade?.pnl || 0
        }
      };
    }

    return null;
  }
};

export default MinhaEstrategiaRecuperacao;
```

---

## 🚀 Como usar o `sequenceTrigger` (Exemplo Prático de Sequência Automática)

O `sequenceTrigger` permite criar um **loop automático de entradas** na mesma direção sem que a estratégia precise de lógica adicional. A plataforma trata de tudo automaticamente.

### Funcionamento interno

1. Quando uma estratégia retorna um `StrategyResult` com `sequenceTrigger`, a plataforma armazena o estado da sequência para aquele ativo.
2. A cada nova vela fechada, **antes** de chamar o `onTick` da estratégia, a plataforma verifica se a sequência deve avançar.
3. Se a sequência estiver ativa, o `onTick` **não é chamado** — a sequência tem prioridade total.
4. Quando a sequência termina (por cor errada ou max entradas), o `onTick` volta a ser executado normalmente.

### Regras de paragem

A sequência verifica **apenas a cor da vela** — não verifica o resultado do trade (WIN/LOSS), pois a cor da vela já determina implicitamente o resultado.

| Condição | Descrição |
|---|---|
| Cor da vela ≠ cor esperada | A vela fechou na direção oposta. A sequência para imediatamente. |
| `totalEntradas ≥ maxEntradas` | Atingiu o limite máximo configurado. A sequência para. |

### Exemplo prático — Estratégia com sequência automática

```typescript
import { Strategy, StrategyContext, StrategyResult } from "./index";

const MinhaEstrategiaSequencia: Strategy = {
  id: "estrategia_sequencia",
  name: "Sequência Automática",
  description: "Entra em CALL e a plataforma repete enquanto as velas forem verdes",
  category: "auto",

  onTick: (ctx: StrategyContext): StrategyResult | null => {
    if (ctx.history.length < 50) return null;
    if (ctx.hasOpenTrade) return null;

    // Exemplo: entrar em CALL se RSI estiver oversold
    const rsiValue = ctx.indicators.rsi(14);
    const lastRsi = rsiValue[rsiValue.length - 1];
    if (lastRsi !== null && lastRsi < 30) {
      return {
        action: "CALL",
        expiryCandles: 1,
        // ════════════════════════════════════════════
        // sequenceTrigger ativa o loop automático:
        //   - maxEntradas: 50 (pára após 50 entradas)
        //   ⚠ A sequência só verifica a cor da vela,
        //     não o resultado do trade (stopOnLoss ignorado)
        // ════════════════════════════════════════════
        sequenceTrigger: {
          maxEntradas: 50,
          stopOnLoss: true,
          minConsecutiveCandles: 2, // opcional: espera 2 velas verdes consecutivas antes de entrar
        },
        customStats: {
          setupTipo: "S1-CALL: Entrada inicial",
        },
      };
    }

    return null;
  }
};

export default MinhaEstrategiaSequencia;
```

**O que acontece após este retorno:**

1. A plataforma abre o primeiro trade **CALL** com `expiryCandles: 1`.
2. Quando esse trade fecha (na próxima vela):
   - **Se a vela for verde** → abre outro CALL automaticamente.
   - **Se a vela for vermelha** → sequência para (cor errada).
3. Assim que a sequência termina, o `onTick` volta a ser chamado normalmente.

### Como testar no Backtest

O backtest suporta `sequenceTrigger` da mesma forma que o modo real. Os resultados da sequência aparecem no histórico de trades com `customStats.setupTipo` = `"Sequência #N (CALL)"`, permitindo filtrar e analisar o desempenho das entradas sequenciais separadamente.

---

## ⚠️ Erros Comuns e Soluções
1. **"ReferenceError: rsi is not defined"**: Você esqueceu de importar o `rsi` de `@/lib/market`.
2. **"TypeError: Cannot read property 'values' of undefined"**: Sempre use o operador `?.` ao acessar filtros (`filters.nome?.values`).
3. **M10 desconfigurado**: Lembre-se que `v.t` é milissegundos. Se precisar agrupar manualmente, divida por 60000, não por 60.
4. **Sinal não aparece**: Verifique se a sua estratégia retorna `null` por falta de histórico. Use `if (ctx.history.length < 100) return null;` no início.
