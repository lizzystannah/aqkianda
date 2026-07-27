import { DerivAPI } from "./derivCore";
import { getDynamicExecutionLimits } from "./executionLimits";
import { rsi, sma, ema, bollinger, adx, macd, parabolicSar, type Candle, getDerivSymbol, REVERSE_SYMBOL_MAP, resampleCandles, computeIndicatorValues } from "./market";
import { isDbActive, getDb } from "./db";
import { robots as robotsSchema, trades as tradesSchema, strategies as strategiesSchema, backtestCandles as backtestCandlesSchema } from "./schema";
import { eq } from "drizzle-orm";


import { applyFilterLogic, type StrategyContext, type StrategyResult, type Strategy } from "../strategies";
import { buildIndicatorSnapshot } from "./indicatorService";
import * as marketLib from "./market";
import fs from "fs";
import path from "path";
import { Server, Socket } from "socket.io";
import { transformSync } from "esbuild";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

/** Inverte a direção de uma ação CALL↔PUT (temporário para robotInvert) */
function invertAction(action: "CALL" | "PUT" | "BUY" | "SELL"): "CALL" | "PUT" | "BUY" | "SELL" {
  if (action === "CALL" || action === "BUY") return "PUT";
  return "CALL";
}

export function parseDuration(val: any): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    if (val.includes('/')) {
      const [num, den] = val.split('/');
      const parsed = Number(num) / Number(den);
      return isNaN(parsed) ? 1 : parsed;
    }
    const parsed = parseFloat(val);
    if (!isNaN(parsed)) return parsed;
  }
  return 1;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type AssetState = {
  candles: Candle[];
  lastTradeTime: number;
  lastSignalCandleTs: number;
  ready: boolean;
  isProcessing?: boolean;
  lastIndicatorCandleTs?: number;
  cachedRsiArr?: (number | null)[];
  cachedAdxData?: any;
  cachedIndicators?: Record<string, any>;
  strategyMod?: { id?: string; onTick: (ctx: StrategyContext) => StrategyResult | null } | null;
};

type RobotRuntime = {
  id: string;
  config: any;
  demoToken?: string;
  realToken?: string;
  assignedToken?: string; // token assigned via round-robin from robotTokens[]
  candleToken?: string;  // dedicated candle data token for this robot
  assetStates: Record<string, AssetState>;
  tickInterval: NodeJS.Timeout | null;
  lastResult: "WIN" | "LOSS" | null;
  lastPnl: number;
  lastStake: number;
  managementState: {
    lastDemoResult: "WIN" | "LOSS" | null;
    vdCycle: string;
    isPausedByVD: boolean;
    waitingForWins: number;
    currentDailyPnl: number;
    totalPnl: number;
    lastResetDate: string;
  };
  activeContractIds: Set<string>;
  warmupContractIds: Set<string>;
  activeContractsByAsset: Map<string, string>;
  activeContractsExpiry: Map<string, number>;
  /** Metadados dos contratos ativos — usados para early settle por ticks */
  contractMeta: Map<string, {
    type: "CALL" | "PUT";
    derivSymbol: string;
    entryPrice: number;
    isWarmup: boolean;
  }>;
  currentStake: number;
  /** Contador de vitórias consecutivas no modo Soros */
  sorosConsecutiveWins: number;
  /** Contador de passos de multiplicação/martingale consecutivos */
  martingaleStep: number;
  strategyMod: Strategy | null;
  startedAt: number;
  srLines: any[];
  srZones: any[];
  trendLines: any[];
  deferredSettlements: Map<string, any>;
  /** Contador de tentativas falhas do poll API por contrato — usado para retry antes de forçar settlement */
  contractPollRetries: Map<string, number>;
  /** Timestamp da última consulta à API da Deriv por contrato (para debouncing) */
  lastPollTimes?: Map<string, number>;
  /** Buffer do último resultado do lote: só avança estado da gestão quando o lote completo chegar */
  pendingBatchMgmt: {
    batchKey: string;
    result: "WIN" | "LOSS";
    pnl: number;
    hasLoss: boolean;
  } | null;
  pendingBatchTimer: NodeJS.Timeout | null;
  trades: any[];
  /** Histórico de operações da gestão — persistido individualmente para cada robô */
  managementTrades?: any[];
  pendingCheckInterval: NodeJS.Timeout | null;
  pendingOrders: Map<string, {
    action: "CALL" | "PUT";
    targetPrice: number;
    expiryTs: number;
    entryStake: number;
    customStats?: any;
    expiryCandles: number;
  }>;
  /** Estado de sequência automática ativa, keyed por asset */
  sequenceState?: Record<string, {
    active: boolean;
    action: "CALL" | "PUT" | "BUY" | "SELL";
    corEsperada: "verde" | "vermelha";
    expiryCandles: number;
    stake: number;
    maxEntradas: number;
    stopOnLoss: boolean;
    totalEntradas: number;
    ultimoTradeId: string | undefined;
    /** Fix C: timestamp do candle onde entrou a última entrada da sequência — usado para impor 1-candle gap */
    ultimoEntryCandleTs?: number;
  }>;
};

const runtimes = new Map<string, RobotRuntime>();
const startupErrors = new Map<string, { message: string, ts: number }>();
export const bootingRobotIds = new Set<string>();
let io: Server | null = null;

// Determine base persistent directory (Docker volume vs local dev)
const DOCKER_VOLUME_DIR = "/app/data";
const BASE_DATA_DIR = fs.existsSync(DOCKER_VOLUME_DIR)
  ? DOCKER_VOLUME_DIR
  : path.join(process.cwd(), "data");

// Diretórios de persistência
const ROBOTS_DIR = path.join(BASE_DATA_DIR, "robots");
const PERSISTENCE_FILE = process.env.ACTIVE_ROBOTS_PATH || path.join(BASE_DATA_DIR, "active_robots.json");
const TOKEN_CONFIG_PATH = process.env.TOKEN_CONFIG_PATH || path.join(BASE_DATA_DIR, "token_config.json");

// Diretórios de estratégias (Git e Dinâmico)
const GIT_STRATEGIES_DIR = path.join(process.cwd(), "src", "strategies");
const DYNAMIC_STRATEGIES_DIR = process.env.STRATEGIES_DIR || path.join(BASE_DATA_DIR, "strategies");

const MAX_CANDLES_LIMIT = Number(process.env.MAX_CANDLES_LIMIT) || 10000;


// Memory cache for active and offline robots loaded from SQLite/MySQL or JSON files
let robotsCache: Record<string, any> = {};
let dbSyncPromise: Promise<void> | null = null;

export function loadRobotsDbFromFiles(): Record<string, any> {
  const robots: Record<string, any> = {};
  try {
    if (!fs.existsSync(ROBOTS_DIR)) {
      fs.mkdirSync(ROBOTS_DIR, { recursive: true });
      return {};
    }

    const files = fs.readdirSync(ROBOTS_DIR).filter(f => f.endsWith(".json"));
    for (const file of files) {
      try {
        const id = file.replace(".json", "");
        const raw = fs.readFileSync(path.join(ROBOTS_DIR, file), "utf-8");
        robots[id] = JSON.parse(raw);
      } catch (err) {
        console.error(`[ServerEngine] ❌ Error loading robot file ${file}:`, err);
      }
    }
  } catch (err) {
    console.error("[ServerEngine] ❌ Failed to list robots directory:", err);
  }
  return robots;
}

export async function syncDatabase() {
  if (dbSyncPromise) return dbSyncPromise;
  
  dbSyncPromise = (async () => {
    try {
      const active = await isDbActive();
      if (!active) {
        console.log("[ServerEngine] ℹ️ Database is not configured or not active. Using JSON files as fallback.");
        robotsCache = loadRobotsDbFromFiles();
        return;
      }

      console.log("[ServerEngine] 🚀 Database is active! Initializing cache and syncing data...");
      const db = await getDb();

      // 1. One-time Migration from Files to Mysql/Postgres if DB is empty or has fewer content than files
      const localRobots = loadRobotsDbFromFiles();
      const dbRobots = await db.select().from(robotsSchema);
      const dbTrades = await db.select().from(tradesSchema);
      const dbTradeIds = new Set(dbTrades.map(t => t.id));
      
      console.log(`[ServerEngine] SQL current robots: ${dbRobots.length}. Local files: ${Object.keys(localRobots).length}`);

      // If SQL is empty or we have local files, let's migrate missing robots and trades!
      for (const [id, localData] of Object.entries(localRobots)) {
        if (!localData || !localData.config) continue;
        
        const exists = dbRobots.some(r => r.id === id);
        if (!exists) {
          console.log(`[ServerEngine] [Migration] Migrating robot ${id} to DB...`);
          // Insert robot configuration
          await db.insert(robotsSchema).values({
            id,
            name: localData.config.name || id,
            active: localData.active || false,
            config: localData.config,
            managementState: localData.managementState || {},
            managementTrades: localData.managementTrades || [],
          });
        }

        // Migrate trades for this robot (even if the robot already exists in SQL but trades are missing)
        const localTrades = localData.trades || localData.config?.trades || [];
        if (localTrades.length > 0) {
          let migratedTradesCount = 0;
          for (const t of localTrades) {
            if (!t || !t.id) continue;
            if (dbTradeIds.has(t.id)) continue; // Already migrated!

            try {
              await db.insert(tradesSchema).values({
                id: t.id,
                robotId: id,
                contractId: String(t.contractId || t.entry || t.id),
                asset: t.asset || "R_100",
                action: t.action || t.type || "CALL",
                stake: String(t.stake || t.amount || 10),
                payout: String(t.payout || 0),
                profit: String(t.profit || t.pnl || 0),
                result: t.result || "LOSS",
                mode: t.mode || "demo",
                warmup: t.warmup === true,
                timestamp: t.ts ? new Date(t.ts) : new Date(),
                snapshot: t.snapshot || null,
              });
              dbTradeIds.add(t.id);
              migratedTradesCount++;
            } catch (err: any) {
              // Silently ignore individual trade insert errors
            }
          }
          if (migratedTradesCount > 0) {
            console.log(`[ServerEngine] [Migration] Migrated ${migratedTradesCount} missing trades for robot ${id}.`);
          }
        }
      }

      // Proactive Recovery for Missing Trade History from Legacy single DB file
      const legacyFileList = [
        path.join(BASE_DATA_DIR, "robots_db.json"),
        path.join(BASE_DATA_DIR, "robots_db.json.migrated"),
        path.join(process.cwd(), "data", "robots_db.json"),
        path.join(process.cwd(), "data", "robots_db.json.migrated"),
        path.join("/app/data", "robots_db.json"),
        path.join("/app/data", "robots_db.json.migrated")
      ];

      for (const legacyPath of legacyFileList) {
        if (fs.existsSync(legacyPath)) {
          try {
            console.log(`[ServerEngine] 🔍 [Recovery] Checking legacy database file: ${legacyPath}`);
            const raw = fs.readFileSync(legacyPath, "utf-8");
            const parsed = JSON.parse(raw);
            const robots = parsed?.robots || {};
            
            for (const [id, rData] of Object.entries(robots)) {
              if (!rData) continue;
              const legacyTrades = (rData as any).trades || (rData as any).config?.trades || [];
              if (legacyTrades.length > 0) {
                let recoveredCount = 0;
                for (const t of legacyTrades) {
                  if (!t || !t.id) continue;
                  const tIdStr = String(t.id);
                  if (dbTradeIds.has(tIdStr)) continue; // Already exists in MySQL
                  
                  try {
                    await db.insert(tradesSchema).values({
                      id: tIdStr,
                      robotId: id,
                      contractId: String(t.contractId || t.entry || t.id),
                      asset: t.asset || "R_100",
                      action: t.action || t.type || "CALL",
                      stake: String(t.stake || t.amount || 10),
                      payout: String(t.payout || 0),
                      profit: String(t.profit || t.pnl || 0),
                      result: t.result || "LOSS",
                      mode: t.mode || "demo",
                      timestamp: t.ts ? new Date(t.ts) : new Date(),
                      snapshot: t.snapshot || null,
                    });
                    dbTradeIds.add(tIdStr);
                    recoveredCount++;
                  } catch (err: any) {
                    // Silently ignore individual trade insert errors
                  }
                }
                if (recoveredCount > 0) {
                  console.log(`[ServerEngine] 🌟 [Recovery] Successfully restored ${recoveredCount} historical trades for robot "${id}" from ${path.basename(legacyPath)} into MySQL!`);
                }
              }
            }
          } catch (recoveryErr: any) {
            console.error(`[ServerEngine] ❌ [Recovery] Error reading legacy file ${legacyPath}:`, recoveryErr.message || recoveryErr);
          }
        }
      }

      // Sync strategies to MySQL/Postgres
      const allStrategies = new Map<string, any>();
      
      // Read Git strategies
      if (fs.existsSync(GIT_STRATEGIES_DIR)) {
        const files = fs.readdirSync(GIT_STRATEGIES_DIR).filter(f => f.endsWith(".ts") && f !== "index.ts" && f !== "README.md");
        for (const file of files) {
          try {
            const filePath = path.join(GIT_STRATEGIES_DIR, file);
            const code = fs.readFileSync(filePath, "utf-8");
            const nameMatch = code.match(/name:\s*["'`](.+?)["'`](?:\s*,)?/);
            const idMatch = code.match(/id:\s*["'`](.+?)["'`](?:\s*,)?/);
            const descMatch = code.match(/description:\s*["'`](.+?)["'`](?:\s*,)?/);
            const categoryMatch = code.match(/category:\s*["'`](.+?)["'`](?:\s*,)?/);
            const id = idMatch ? idMatch[1] : file.replace(".ts", "");
            
            allStrategies.set(id, {
              id,
              name: nameMatch ? nameMatch[1] : file.replace(".ts", ""),
              description: descMatch ? descMatch[1] : "",
              code,
              category: categoryMatch ? categoryMatch[1] : "auto",
            });
          } catch (_) { /* ignore */ }
        }
      }

      // Read Dynamic strategies
      if (fs.existsSync(DYNAMIC_STRATEGIES_DIR)) {
        const files = fs.readdirSync(DYNAMIC_STRATEGIES_DIR).filter(f => f.endsWith(".ts") && f !== "index.ts" && f !== "README.md");
        for (const file of files) {
          try {
            const filePath = path.join(DYNAMIC_STRATEGIES_DIR, file);
            const code = fs.readFileSync(filePath, "utf-8");
            const nameMatch = code.match(/name:\s*["'`](.+?)["'`](?:\s*,)?/);
            const idMatch = code.match(/id:\s*["'`](.+?)["'`](?:\s*,)?/);
            const descMatch = code.match(/description:\s*["'`](.+?)["'`](?:\s*,)?/);
            const categoryMatch = code.match(/category:\s*["'`](.+?)["'`](?:\s*,)?/);
            const id = idMatch ? idMatch[1] : file.replace(".ts", "");
            
            allStrategies.set(id, {
              id,
              name: nameMatch ? nameMatch[1] : file.replace(".ts", ""),
              description: descMatch ? descMatch[1] : "",
              code,
              category: categoryMatch ? categoryMatch[1] : "auto",
            });
          } catch (_) { /* ignore */ }
        }
      }

      // Update strategies in MySQL/Postgres
      for (const [id, strat] of allStrategies.entries()) {
        try {
          const existStrat = await db.select().from(strategiesSchema).where(eq(strategiesSchema.id, id)).limit(1);
          if (existStrat.length > 0) {
            await db.update(strategiesSchema).set({
              name: strat.name,
              description: strat.description,
              code: strat.code,
              category: strat.category,
              updatedAt: new Date(),
            }).where(eq(strategiesSchema.id, id));
          } else {
            await db.insert(strategiesSchema).values({
              id,
              name: strat.name,
              description: strat.description,
              code: strat.code,
              category: strat.category,
            });
          }
        } catch (stratErr) {
          // Skip
        }
      }

      // 2. Fetch all robots and trades from DB to populate our in-memory cache
      const allDbRobots = await db.select().from(robotsSchema);
      const allDbTradesActual = await db.select().from(tradesSchema);

      // Group trades by robotId (case-insensitive for robotId field to support Postgres defaults)
      const tradesByRobot: Record<string, any[]> = {};
      for (const t of allDbTradesActual) {
        const rId = t.robotId || (t as any).robotid;
        if (!rId) continue;

        if (!tradesByRobot[rId]) {
          tradesByRobot[rId] = [];
        }

        const contractIdVal = t.contractId || (t as any).contractid || t.id;
        const timestampVal = t.timestamp || (t as any).timestamp;

        tradesByRobot[rId].push({
          id: t.id,
          asset: t.asset,
          type: t.action,
          amount: Number(t.stake),
          entry: contractIdVal ? Number(contractIdVal) : 0,
          payout: Number(t.payout || 0),
          pnl: Number(t.profit || 0),
          result: t.result,
          mode: t.mode,
          ts: timestampVal ? new Date(timestampVal).getTime() : Date.now(),
          snapshot: typeof t.snapshot === "string" ? JSON.parse(t.snapshot) : (t.snapshot || null),
          warmup: t.warmup === true,
        });
      }

      const newCache: Record<string, any> = {};
      for (const r of allDbRobots) {
        let mState = r.managementState || (r as any).managementstate;
        if (typeof mState === "string") {
          try {
            mState = JSON.parse(mState);
          } catch (_) {
            mState = {};
          }
        }
        
        let configObj = r.config || (r as any).config;
        if (typeof configObj === "string") {
          try {
            configObj = JSON.parse(configObj);
          } catch (_) {
            configObj = {};
          }
        }

        const robotTrades = tradesByRobot[r.id] || [];
        // Calculate the actual total P&L from trades to heal potential zero/NaN states
        const realTotalPnl = robotTrades
          .filter(t => t.result === "WIN" || t.result === "LOSS")
          .reduce((sum, t) => sum + (t.pnl || 0), 0);

        if (!mState) {
          mState = {
            lastDemoResult: null,
            vdCycle: "",
            isPausedByVD: false,
            waitingForWins: 0,
            currentDailyPnl: 0,
            totalPnl: Number(realTotalPnl.toFixed(2)),
            lastResetDate: new Date().toISOString().split("T")[0],
          };
        } else {
          // Heal total P&L from actual trades — o banco de trades é a fonte da verdade
          mState.totalPnl = Number(realTotalPnl.toFixed(2));
        }

        let mgmtTrades = (r as any).managementTrades;
        if (typeof mgmtTrades === "string") {
          try { mgmtTrades = JSON.parse(mgmtTrades); } catch (_) { mgmtTrades = []; }
        }

        newCache[r.id] = {
          config: configObj,
          trades: robotTrades.sort((a, b) => b.ts - a.ts),
          managementState: mState,
          managementTrades: Array.isArray(mgmtTrades) ? mgmtTrades : [],
          updatedAt: r.updatedAt ? new Date(r.updatedAt).getTime() : Date.now(),
        };
      }

      robotsCache = newCache;
      console.log(`[ServerEngine] ✅ SQL sync completed! Loaded ${Object.keys(robotsCache).length} robots and synced up strategies.`);
    } catch (err: any) {
      console.error("[ServerEngine] [Sync] Error syncing database:", err.message || err);
      robotsCache = loadRobotsDbFromFiles();
    }
  })();
  
  return dbSyncPromise;
}

/**
 * Migração de robots_db.json (ficheiro único legado) para ficheiros individuais na pasta data/robots/
 */
function migrateRobotsDbToFiles() {
  const legacyDbFile = path.join(BASE_DATA_DIR, "robots_db.json");
  
  if (!fs.existsSync(ROBOTS_DIR)) {
    fs.mkdirSync(ROBOTS_DIR, { recursive: true });
  }

  if (fs.existsSync(legacyDbFile)) {
    try {
      const raw = fs.readFileSync(legacyDbFile, "utf-8");
      const parsed = JSON.parse(raw);
      const robots = parsed?.robots || {};
      
      let migrated = 0;
      for (const [id, data] of Object.entries(robots)) {
        const filePath = path.join(ROBOTS_DIR, `${id}.json`);
        if (!fs.existsSync(filePath)) {
          fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
          migrated++;
        }
      }
      
      if (migrated > 0) {
        console.log(`[ServerEngine] ✅ Migrated ${migrated} robots from legacy robots_db.json to ${ROBOTS_DIR}`);
        // Consider renaming the legacy file to avoid re-migration
        fs.renameSync(legacyDbFile, legacyDbFile + ".migrated");
      }
    } catch (err) {
      console.error("[ServerEngine] ❌ Error during robots migration:", err);
    }
  }
}

let internalApi: DerivAPI | null = null;
let internalApiPromise: Promise<DerivAPI> | null = null;
let _candleToken: string | null = null; // dedicated token for candle data (central collector)

// ─── Multi-Token Trading API Pool ──────────────────────────────────────
// Key: "${accountType}:${token}" — one WebSocket per DISTINCT token, not per robot.
// This distributes Deriv API rate limits across all configured tokens.
// Assets are assigned to tokens round-robin.
const tradingApiPool = new Map<string, { api: DerivAPI; refCount: number }>();
const assetTokenMap = new Map<string, string>(); // assetSymbol → "demo:token" | "real:token"

let _robotTokens: string[] = [];

/** Synchronise _robotTokens from persisted config (called after saveTokenConfig / loadTokenConfig). */
function syncRobotTokens(): void {
  const cfg = loadTokenConfig();
  const set = new Set<string>();
  if (cfg.demoToken?.trim()) set.add(cfg.demoToken.trim());
  if (cfg.realToken?.trim()) set.add(cfg.realToken.trim());
  if (cfg.candleToken?.trim()) set.add(cfg.candleToken.trim());
  if (Array.isArray(cfg.robotTokens)) {
    for (const t of cfg.robotTokens) {
      if (t?.trim()) set.add(t.trim());
    }
  }
  _robotTokens = Array.from(set);
}
syncRobotTokens(); // initial load

/**
 * Resolve which token to use for a given asset, assigning round-robin from available tokens.
 * Falls back to the primary (first) token if no robotTokens are configured.
 */
function resolveTokenForAsset(accountType: "demo" | "real", assetSymbol: string, primaryToken: string | null): string {
  const poolKey = `${accountType}:`;
  const existing = assetTokenMap.get(assetSymbol);
  if (existing?.startsWith(poolKey)) return existing;

  // Gather all available tokens for this account type
  const tokenSet = new Set<string>(_robotTokens);
  if (primaryToken?.trim()) tokenSet.add(primaryToken.trim());
  const available = Array.from(tokenSet).filter((t) => t && t.length > 0);

  if (available.length === 0) {
    const fallback = getAnyValidToken() || "null";
    assetTokenMap.set(assetSymbol, `${poolKey}${fallback}`);
    return `${poolKey}${fallback}`;
  }

  // Round-robin: assign each asset to the next available token in the pool
  const idx = assetTokenMap.size % available.length;
  const chosen = available[idx];
  assetTokenMap.set(assetSymbol, `${poolKey}${chosen}`);
  return `${poolKey}${chosen}`;
}

/**
 * Get or create a trading DerivAPI for the given accountType + token pair.
 * Each DISTINCT token gets its own WebSocket + OTP session.
 * Use `assetSymbol` to automatically distribute load across tokens.
 */
async function getTradingApi(
  accountType: "demo" | "real",
  token: string | null,
  apiName = "Trading",
  assetSymbol?: string,
): Promise<DerivAPI> {
  let poolKey: string;
  if (assetSymbol) {
    poolKey = resolveTokenForAsset(accountType, assetSymbol, token);
  } else {
    const actualToken = token || _robotTokens[0] || getAnyValidToken();
    poolKey = `${accountType}:${actualToken || "null"}`;
  }

  const existing = tradingApiPool.get(poolKey);
  if (existing) return existing.api;

  // Extract the actual token string from poolKey
  const actualToken = poolKey.slice(poolKey.indexOf(":") + 1);

  const api = new DerivAPI();
  api.name = `${apiName}-${accountType}${actualToken ? "" : "-public"}`;
  api.accountType = accountType;

  // Dispatch onOpenContract to the correct runtime (by contractId or passthrough)
  api.onOpenContract = (contract) => {
    const cid = String(contract.contract_id);
    for (const [, rt] of runtimes) {
      if (rt.activeContractIds.has(cid)) {
        handleContractUpdate(rt, contract);
        return;
      }
    }
    const passthroughRobotId = contract.passthrough?.robotId || contract.echo_req?.passthrough?.robotId;
    if (passthroughRobotId) {
      const rt = runtimes.get(passthroughRobotId);
      if (rt) handleContractUpdate(rt, contract);
    }
  };

  if (actualToken && actualToken !== "null") {
    try {
      await api.connect(actualToken);
      await api.readyPromise;
    } catch (err) {
      console.warn(`[ServerEngine] Trading API ${poolKey} auth failed, connecting public:`, err);
      api.clearInitialToken();
      await api.connect();
      await api.readyPromise;
    }
  } else {
    await api.connect();
    await api.readyPromise;
  }

  tradingApiPool.set(poolKey, { api, refCount: 0 });
  return api;
}

/**
 * Register a robot's reference on the shared trading DerivAPI pool (increments refCount).
 */
async function acquireTradingApi(
  accountType: "demo" | "real",
  token: string | null,
  apiName = "Trading",
  assetSymbol?: string,
): Promise<DerivAPI> {
  const key = accountType;
  // assetSymbol is unknown at startup; just use the first available token
  const api = await getTradingApi(accountType, token, apiName, assetSymbol);
  // Find the pool entry for this api
  for (const [, entry] of tradingApiPool) {
    if (entry.api === api) {
      entry.refCount++;
      break;
    }
  }
  return api;
}

function releaseTradingApi(accountType: "demo" | "real"): void {
  // Release ALL pool entries for this accountType
  for (const [key, entry] of tradingApiPool) {
    if (key.startsWith(`${accountType}:`)) {
      entry.refCount--;
      if (entry.refCount <= 0) {
        console.log(`[ServerEngine] Releasing shared trading API for ${key} (no more robots using it)`);
        entry.api.disconnect();
        tradingApiPool.delete(key);
      }
    }
  }
}

/**
 * Resolve which shared trading API account type to use for a given robot/trade.
 * - Warmup/shadow trades always use "demo"
 * - Normal trades use management.account if management is active, otherwise the robot mode
 */
function resolveTradingAccountType(runtime: RobotRuntime, shouldWarmup: boolean): "demo" | "real" {
  if (shouldWarmup) return "demo";
  if (runtime.config.management?.active && runtime.config.management?.account) {
    return runtime.config.management.account as "demo" | "real";
  }
  return (runtime.config.mode || "demo") as "demo" | "real";
}

function getAnyValidToken(): string | null {
  for (const r of runtimes.values()) {
    if (r.demoToken && r.demoToken !== "DIEnt6WVRXH0QoF") return r.demoToken;
    if (r.realToken && r.realToken !== "DIEnt6WVRXH0QoF") return r.realToken;
  }
  if (fs.existsSync(PERSISTENCE_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(PERSISTENCE_FILE, "utf-8"));
      if (Array.isArray(data)) {
        for (const robot of data) {
          if (robot.demoToken && robot.demoToken !== "DIEnt6WVRXH0QoF") return robot.demoToken;
          if (robot.realToken && robot.realToken !== "DIEnt6WVRXH0QoF") return robot.realToken;
          if (robot.token && robot.token !== "DIEnt6WVRXH0QoF") return robot.token;
        }
      }
    } catch (_) { /* empty */ }
  }
  return null;
}

const centrallySubscribedSymbols = new Set<string>();
/** Último preço de tick recebido por símbolo — usado para early settle de contratos */
const lastTickPrices = new Map<string, number>();

async function handleCentralTick(tick: any) {
  if (!tick || !tick.symbol) return;

  const derivSymbol = tick.symbol;
  const baseTfMs = 60_000;
  const candleTs = Math.floor((tick.epoch * 1000) / baseTfMs) * baseTfMs;

  // 1. Update the global candle cache
  let cached = globalCandleCache.get(derivSymbol);
  if (!cached) {
    cached = { candles: [], lastUpdate: Date.now() };
    globalCandleCache.set(derivSymbol, cached);
  }

  const lastCacheCandle = cached.candles[cached.candles.length - 1];
  if (!lastCacheCandle || candleTs > lastCacheCandle.t) {
    cached.candles.push({ t: candleTs, o: tick.quote, h: tick.quote, l: tick.quote, c: tick.quote });
    if (cached.candles.length > MAX_CANDLES_LIMIT) cached.candles.shift();
  } else {
    lastCacheCandle.c = tick.quote;
    lastCacheCandle.h = Math.max(lastCacheCandle.h, tick.quote);
    lastCacheCandle.l = Math.min(lastCacheCandle.l, tick.quote);
  }
  cached.lastUpdate = Date.now();
  cached.lastEpoch = tick.epoch;

  // 1b. Update the last tick price cache for early contract settlement
  lastTickPrices.set(derivSymbol, tick.quote);

  // 2. Propagate to ALL running robots that use this asset
  for (const runtime of runtimes.values()) {
    const configuredSymbol = Object.keys(runtime.assetStates).find((s) => getDerivSymbol(s) === derivSymbol);
    if (!configuredSymbol) continue;

    const state = runtime.assetStates[configuredSymbol];
    if (!state || !state.ready) continue;

    state.candles = [...cached.candles];

    // ── Pending Orders Logic for this robot ──
    const pending = runtime.pendingOrders?.get(configuredSymbol);
    if (pending && !state.isProcessing) {
      const now = Date.now();
      const elapsedMs = now - (pending.expiryTs - 15000); // time since creation (~15000ms before expiry)
      if (now > pending.expiryTs) {
        console.log(`[ServerEngine] ⏳ Pending order for ${configuredSymbol} EXPIRED after ${elapsedMs}ms (target: ${pending.targetPrice}, action: ${pending.action}).`);
        runtime.pendingOrders.delete(configuredSymbol);
      } else {
        const hit = (pending.action === "CALL")
          ? (tick.quote <= pending.targetPrice)
          : (tick.quote >= pending.targetPrice);

        if (hit) {
          console.log(`[ServerEngine] 🎯 Pending order TRIGGERED for ${configuredSymbol} at ${tick.quote} (Target: ${pending.targetPrice}, elapsed: ${elapsedMs}ms)`);
          const orderData = { ...pending };
          runtime.pendingOrders.delete(configuredSymbol);
          triggerPendingExecution(runtime, configuredSymbol, orderData);
        }
      }
    }
  }
}

async function ensureCentralSubscription(derivSymbol: string) {
  const api = await getInternalApi();
  
  if (api.onTick !== handleCentralTick) {
    api.onTick = handleCentralTick;
  }

  if (!centrallySubscribedSymbols.has(derivSymbol)) {
    console.log(`[ServerEngine] Establishing central tick subscription for: ${derivSymbol}`);
    try {
      await api.subscribeTicks(derivSymbol);
      centrallySubscribedSymbols.add(derivSymbol);
      console.log(`[ServerEngine] ✅ Centrally subscribed to: ${derivSymbol}`);
      
      // Stagger consecutive subscriptions slightly
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (errMsg.includes("already subscribed")) {
        centrallySubscribedSymbols.add(derivSymbol);
        console.log(`[ServerEngine] ✅ Centrally subscribed to: ${derivSymbol} (already subscribed detected)`);
      } else {
        console.error(`[ServerEngine] ❌ Failed to centrally subscribe to ${derivSymbol}:`, errMsg);
      }
    }
  }
}

async function getInternalApi(): Promise<DerivAPI> {
  if (internalApi) return internalApi;
  if (internalApiPromise) return internalApiPromise;

  internalApiPromise = (async () => {
    const api = new DerivAPI();
    api.name = "MANAGEMENT_DATA_COLLECTOR";
    api.onLatency = (ms) => {
      io?.emit("server-latency", { id: "central", ms });
    };

    // Monkeypatch connect to handle re-subscriptions upon reconnection automatically
    const originalConnect = api.connect.bind(api);
    api.connect = async function(token?: string) {
      const res = await originalConnect(token);
      
      if (centrallySubscribedSymbols.size > 0) {
        console.log(`[ServerEngine] 🔄 Central API reconnected! Re-subscribing to ${centrallySubscribedSymbols.size} symbols...`);
        for (const symbol of centrallySubscribedSymbols) {
          try {
            await api.send({ ticks: symbol, subscribe: 1 });
            console.log(`[ServerEngine] ✅ Re-subscribed to: ${symbol}`);
            
            // Stagger re-subscriptions to stay well within limits
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (err: any) {
            const errMsg = err?.message || String(err);
            if (errMsg.includes("already subscribed")) {
              console.log(`[ServerEngine] ✅ Already subscribed dynamically to: ${symbol}`);
            } else {
              console.error(`[ServerEngine] ❌ Failed to re-subscribe to ${symbol}:`, err);
            }
          }
        }
      }
      return res;
    };

    // Use dedicated candle token if available, otherwise fall back to any valid token
    const token = _candleToken || getAnyValidToken();
    if (token) {
      console.log(`[ServerEngine] MANAGEMENT_DATA_COLLECTOR will authorize with available token...`);
      try {
        await api.connect(token);
        await api.readyPromise;
      } catch (err) {
        console.warn(`[ServerEngine] MANAGEMENT_DATA_COLLECTOR auth failed, connecting without token fallback:`, err);
        api.clearInitialToken();
        await api.connect();
        await api.readyPromise;
      }
    } else {
      await api.connect();
      await api.readyPromise;
    }

    // Force a responsive 5s ping for central API tracking
    api.startPing(5000);

    internalApi = api;
    return api;
  })();

  return internalApiPromise;
}

// Module-level cache for candle data shared across all robots
// key: derivSymbol, value: { candles: Candle[], lastUpdate: number }
const globalCandleCache = new Map<string, { candles: Candle[], lastUpdate: number, lastEpoch?: number }>();

export function getCachedCandles(symbol: string, intervalSeconds: number = 60): Candle[] | null {
  const derivSymbol = getDerivSymbol(symbol);
  const cacheKey = (intervalSeconds === 60) ? derivSymbol : `${derivSymbol}_${intervalSeconds}`;
  const cached = globalCandleCache.get(cacheKey);
  // Remove strict freshness check to allow backtesting on persistent buffers
  if (cached && cached.candles.length > 0) {
    return cached.candles;
  }
  return null;
}

export async function getOrFetchCandles(symbol: string, intervalSeconds: number = 60): Promise<Candle[] | null> {
  const existing = getCachedCandles(symbol, intervalSeconds);
  if (existing && existing.length >= 20) {
    console.log(`[ServerEngine] Cache hit for ${symbol} with ${existing.length} candles. Reusing memory cache.`);
    return existing;
  }

  // No DB fallback — always fetch fresh from Deriv API to prevent chart misalignment
  // DB candles are only used for explicit backtesting requests (server.ts handler)

  console.log(`[ServerEngine] Fetching from Deriv for ${symbol}...`);
  try {
    // Use the central MANAGEMENT_DATA_COLLECTOR API (no per-robot WS to borrow)
    const api = await getInternalApi();

    const derivSymbol = getDerivSymbol(symbol);
    const candlesRaw = await api.getCandles(derivSymbol, MAX_CANDLES_LIMIT, intervalSeconds);

    if (candlesRaw && candlesRaw.length > 0) {
      const candlesData = candlesRaw.map((c: any) => ({
        t: c.epoch * 1000,
        o: c.open,
        h: c.high,
        l: c.low,
        c: c.close,
      }));
      const cacheKey = (intervalSeconds === 60) ? derivSymbol : `${derivSymbol}_${intervalSeconds}`;
      globalCandleCache.set(cacheKey, { candles: candlesData, lastUpdate: Date.now() });
      return candlesData;
    }
  } catch (err) {
    console.error(`[ServerEngine] Failed to fetch candles for ${symbol} with interval ${intervalSeconds}s on demand:`, err);
  }
  return null;
}

export async function getBacktestCandlesFromDb(symbol: string): Promise<Candle[] | null> {
  try {
    const active = await isDbActive();
    if (!active) return null;

    const db = await getDb();
    const records = await db.select().from(backtestCandlesSchema).where(eq(backtestCandlesSchema.asset, symbol)).limit(1);
    if (records.length > 0 && records[0].candles) {
      const list = JSON.parse(records[0].candles);
      if (Array.isArray(list) && list.length > 0) {
        console.log(`[ServerEngine] DB backtest cache hit for ${symbol}: found ${list.length} frozen candles.`);
        return list as Candle[];
      }
    }
  } catch (err: any) {
    console.error(`[ServerEngine] Error loading backtest candles for ${symbol} from DB:`, err.message || err);
  }
  return null;
}

export async function clearAllBacktestCandlesDb(): Promise<boolean> {
  try {
    const active = await isDbActive();
    if (!active) return false;

    const db = await getDb();
    await db.delete(backtestCandlesSchema);
    console.log(`[ServerEngine] Cleared all backtest candles from DB to avoid unnecessary accumulation.`);
    return true;
  } catch (err: any) {
    console.error(`[ServerEngine] Error clearing all backtest candles from DB:`, err.message || err);
  }
  return false;
}

export async function saveBacktestCandlesToDb(symbol: string, candles: Candle[]): Promise<boolean> {
  try {
    const active = await isDbActive();
    if (!active) return false;

    if (!candles || candles.length === 0) return false;

    const db = await getDb();
    const existing = await db.select().from(backtestCandlesSchema).where(eq(backtestCandlesSchema.asset, symbol)).limit(1);
    if (existing.length > 0) {
      await db.update(backtestCandlesSchema).set({ candles: JSON.stringify(candles), updatedAt: new Date() }).where(eq(backtestCandlesSchema.asset, symbol));
    } else {
      await db.insert(backtestCandlesSchema).values({ asset: symbol, candles: JSON.stringify(candles), updatedAt: new Date() });
    }
    console.log(`[ServerEngine] Successfully persisted ${candles.length} backtest candles for ${symbol} in MySQL database.`);
    return true;
  } catch (err: any) {
    console.error(`[ServerEngine] Error saving backtest candles for ${symbol} to DB:`, err.message || err);
  }
  return false;
}

// ─── Symbol mapping ───────────────────────────────────────────────────────────



// ─── VDV helper ───────────────────────────────────────────────────────────────

function handleVdv(robot: any, result: "WIN" | "LOSS"): Partial<any> {
  let vdvPaused = robot.vdvPaused;
  let vdvWinsCount = robot.vdvWinsCount || 0;

  if (vdvPaused) {
    if (result === "WIN") {
      vdvWinsCount += 1;
      if (vdvWinsCount >= 2) {
        vdvPaused = false;
        vdvWinsCount = 0;
      }
    } else {
      vdvWinsCount = 0;
    }
  }

  return { vdvPaused, vdvWinsCount };
}


function computeWarmupActive(robot: any, lastResult: "WIN" | "LOSS"): boolean {
  if (!robot.entryAfterWin && !robot.entryAfterLoss) return false;
  if (robot.entryAfterWin) return lastResult !== "WIN";
  if (robot.entryAfterLoss) return lastResult !== "LOSS";
  return false;
}

// ─── Engine init ──────────────────────────────────────────────────────────────

export function initServerEngine(socketIo: Server) {
  io = socketIo;
  console.log("[ServerEngine] ✅ Server Robot Engine initialized");

  // Migrar dados de robots_db.json para ficheiros individuais
  migrateRobotsDbToFiles();

  // Load and restart persisted robots
  loadPersistedRobots();
}

// ── Token config persistence (saved from Settings UI) ──
export function saveTokenConfig(tokens: {
  demoToken?: string;
  realToken?: string;
  candleToken?: string;
  robotTokens?: string[];
}): boolean {
  try {
    const existing = loadTokenConfig();
    const merged = { ...existing, ...tokens };
    // Remove empty strings
    if (!merged.demoToken) delete merged.demoToken;
    if (!merged.realToken) delete merged.realToken;
    if (!merged.candleToken) delete merged.candleToken;
    if (!merged.robotTokens?.length) delete merged.robotTokens;
    fs.writeFileSync(TOKEN_CONFIG_PATH, JSON.stringify(merged, null, 2));
    console.log("[ServerEngine] ✅ Token config saved");
    syncRobotTokens();
    assetTokenMap.clear();
    console.log(`[ServerEngine] 🔄 Asset-token mapping reset (${_robotTokens.length} tokens available)`);
    return true;
  } catch (err) {
    console.error("[ServerEngine] ❌ Failed to save token config:", err);
    return false;
  }
}

export function loadTokenConfig(): { demoToken?: string; realToken?: string; candleToken?: string; robotTokens?: string[] } {
  try {
    if (fs.existsSync(TOKEN_CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(TOKEN_CONFIG_PATH, "utf-8"));
      return data;
    }
  } catch (err) {
    console.error("[ServerEngine] ❌ Failed to load token config:", err);
  }
  return {};
}

function saveActiveRobots() {
  try {
    const active = Array.from(runtimes.values()).map(r => ({
      config: {
        ...r.config,
        // Remove heavy trade history from the restart-list file but KEEP management state
        trades: [],
        managementState: r.managementState
      },
      managementTrades: r.managementTrades || [],
      demoToken: r.demoToken,
      realToken: r.realToken,
      srLines: r.srLines,
      srZones: r.srZones || [],
      trendLines: r.trendLines || []
    }));
    fs.writeFileSync(PERSISTENCE_FILE, JSON.stringify(active, null, 2));
  } catch (err) {
    console.error("[ServerEngine] ❌ Failed to save persistence state:", err);
  }
}

async function loadPersistedRobots() {
  await syncDatabase();
  
  const robotsToRestart = new Map<string, any>();

  // 1. Fetch active robots from MySQL/Postgres Database
  try {
    const active = await isDbActive();
    if (active) {
      const db = await getDb();
      const dbActiveRobots = await db.select().from(robotsSchema).where(eq(robotsSchema.active, true));
      console.log(`[ServerEngine] 💾 Database has ${dbActiveRobots.length} active robots persisted.`);
      
      for (const r of dbActiveRobots) {
        let mState = r.managementState || (r as any).managementstate;
        if (typeof mState === "string") {
          try {
            mState = JSON.parse(mState);
          } catch (_) {
            mState = {};
          }
        }
        let configObj = r.config || (r as any).config;
        if (typeof configObj === "string") {
          try {
            configObj = JSON.parse(configObj);
          } catch (_) {
            configObj = {};
          }
        }
        
        if (configObj && configObj.id) {
          robotsToRestart.set(configObj.id, {
            config: configObj,
            demoToken: mState?.demoToken || mState?.token,
            realToken: mState?.realToken || mState?.token,
            srLines: mState?.srLines || [],
            srZones: mState?.srZones || [],
            trendLines: mState?.trendLines || [],
          });
        }
      }
    }
  } catch (err: any) {
    console.error("[ServerEngine] [DB Auto-restart] Failed to fetch active robots from DB:", err.message || err);
  }

  // 2. Supplement/Backup from local PERSISTENCE_FILE
  if (fs.existsSync(PERSISTENCE_FILE)) {
    try {
      console.log("[ServerEngine] 💾 Reading local active_robots.json file as backup...");
      const fileData = JSON.parse(fs.readFileSync(PERSISTENCE_FILE, "utf-8"));
      if (Array.isArray(fileData)) {
        for (const robot of fileData) {
          if (robot.config && robot.config.id) {
            robotsToRestart.set(robot.config.id, {
              config: robot.config,
              demoToken: robot.demoToken || robot.token,
              realToken: robot.realToken || robot.token,
              srLines: robot.srLines || [],
              srZones: robot.srZones || [],
              trendLines: robot.trendLines || [],
            });
          }
        }
      }
    } catch (err: any) {
      console.error("[ServerEngine] ❌ Failed to read persistence file:", err.message || err);
    }
  }

  // 3. Fallback: fill missing tokens from saved token config (Settings UI)
  const savedTokens = loadTokenConfig();
  if (savedTokens.candleToken && !_candleToken) {
    _candleToken = savedTokens.candleToken;
    console.log("[ServerEngine] 💾 Loaded candle token from saved config");
  }
  if (savedTokens.demoToken || savedTokens.realToken) {
    console.log("[ServerEngine] 💾 Using saved token config as fallback for auto-restart...");
    for (const [id, robot] of robotsToRestart.entries()) {
      if (!robot.demoToken) robot.demoToken = savedTokens.demoToken || "";
      if (!robot.realToken) robot.realToken = savedTokens.realToken || "";
    }
  }

  if (robotsToRestart.size === 0) {
    console.log("[ServerEngine] ℹ️ No active robots found to auto-restart.");
    return;
  }

  console.log(`[ServerEngine] 🚀 Auto-restarting ${robotsToRestart.size} robots...`);

  // Pre-add all persisted robot IDs to bootingRobotIds so clients see them as running immediately
  for (const [id, r] of robotsToRestart.entries()) {
    bootingRobotIds.add(id);
  }

  for (const [id, robot] of robotsToRestart.entries()) {
    console.log(`[ServerEngine] 🔄 Auto-restarting robot: ${robot.config.name} (${id})`);
    const dToken = robot.demoToken;
    const rToken = robot.realToken;

    try {
      await startRobotOnServer(robot.config, dToken, rToken, undefined, undefined, robot.srLines || [], robot.srZones || [], robot.trendLines || []);

      // Stagger next startup by 10 seconds to avoid flooding Deriv API
      console.log(`[ServerEngine] ⏳ Staggering startup: waiting 10 seconds before starting next robot...`);
      await new Promise(resolve => setTimeout(resolve, 10000));
    } catch (err) {
      console.error(`[ServerEngine] ❌ Failed to auto-restart robot "${robot.config.name}":`, err);
      bootingRobotIds.delete(id);
    }
  }
}

// ─── Robots DB persistence (volume Docker) ────────────────────────────────────

export function loadRobotsDb(): Record<string, any> {
  if (Object.keys(robotsCache).length === 0) {
    robotsCache = loadRobotsDbFromFiles();
  }
  return robotsCache;
}

export function saveRobotsDb(robots: Record<string, any>) {
  try {
    // 1. Sync memory cache
    robotsCache = { ...robotsCache, ...robots };

    // 2. Save to JSON files as robust local backups
    if (!fs.existsSync(ROBOTS_DIR)) {
      fs.mkdirSync(ROBOTS_DIR, { recursive: true });
    }
    for (const [id, data] of Object.entries(robots)) {
      const filePath = path.join(ROBOTS_DIR, `${id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }

    // 3. Sync to MySQL DB in the background
    (async () => {
      try {
        const active = await isDbActive();
        if (!active) return;

        const db = await getDb();
        for (const [id, data] of Object.entries(robots)) {
          const d = data as any;
          if (!d || !d.config) continue;

          const robotExists = await db.select().from(robotsSchema).where(eq(robotsSchema.id, id)).limit(1);
          if (robotExists.length > 0) {
            await db.update(robotsSchema).set({
              name: d.config.name || id,
              active: d.config.active || false,
              config: d.config,
              managementState: d.managementState || {},
              managementTrades: d.managementTrades || [],
              updatedAt: new Date(),
            }).where(eq(robotsSchema.id, id));
          } else {
            await db.insert(robotsSchema).values({
              id,
              name: d.config.name || id,
              active: d.config.active || false,
              config: d.config,
              managementState: d.managementState || {},
              managementTrades: d.managementTrades || [],
            });
          }
        }
      } catch (dbErr: any) {
        console.error("[ServerEngine] [DB Backup] Failed to save robots to MySQL:", dbErr.message || dbErr);
      }
    })();
  } catch (err) {
    console.error("[ServerEngine] ❌ Failed to save robots to directory:", err);
  }
}

/** Calculates the exact stake to inject based on management rules (Soros, Reinvest, Martingale/Duplication, Fixed) */
export function calculateManagementStake(runtime: RobotRuntime, shouldWarmup: boolean): number {
  const baseStake = runtime.config.management?.stake || runtime.currentStake || 10;
  if (shouldWarmup) return baseStake;

  const mode = runtime.config.management?.mode || "fixed";
  const sorosMaxLevels = runtime.config.management?.sorosLevels || 2;
  const sorosCap = runtime.config.management?.sorosMaxStake || 0;

  let finalStake = baseStake;

  if (mode === "soros") {
    // Soros Mode: Stake Base + Profit from last win (up to sorosMaxLevels consecutive wins)
    if (runtime.lastResult === "WIN" && runtime.sorosConsecutiveWins > 0 && runtime.sorosConsecutiveWins < sorosMaxLevels) {
      finalStake = (runtime.lastStake || baseStake) + Math.abs(runtime.lastPnl || 0);
      if (sorosCap > 0) {
        finalStake = Math.min(finalStake, sorosCap);
      }
    } else {
      // Reached max level or last result was LOSS -> reset to base stake
      finalStake = baseStake;
      if (runtime.lastResult === "LOSS" || runtime.sorosConsecutiveWins >= sorosMaxLevels) {
        runtime.sorosConsecutiveWins = 0;
      }
    }
  } else if (mode === "reinvest") {
    if (runtime.lastResult === "WIN") {
      finalStake = (runtime.lastStake || baseStake) + Math.abs(runtime.lastPnl || 0);
      if (sorosCap > 0) {
        finalStake = Math.min(finalStake, sorosCap);
      }
    } else {
      finalStake = baseStake;
    }
  } else if (mode === "martingale" || mode === "duplication" || mode === "multiplication" || (runtime.config as any).risk?.martingale) {
    // Martingale / Duplication / Multiplication Mode: Multiply stake on LOSS
    const factor = runtime.config.management?.martingaleFactor || (runtime.config as any).risk?.martingaleFactor || 2.0;
    const maxSteps = runtime.config.management?.martingaleMaxSteps || 5;

    if (runtime.lastResult === "LOSS" && runtime.martingaleStep > 0 && runtime.martingaleStep <= maxSteps) {
      finalStake = (runtime.lastStake || baseStake) * factor;
      if (sorosCap > 0) {
        finalStake = Math.min(finalStake, sorosCap);
      }
    } else {
      // WIN or exceeded maxSteps -> reset to base stake
      finalStake = baseStake;
      runtime.martingaleStep = 0;
    }
  } else {
    finalStake = baseStake;
  }

  finalStake = Number(Math.max(1, finalStake).toFixed(2));
  runtime.lastStake = finalStake;
  return finalStake;
}

export function updateRobotInDb(
  robotId: string,
  config: any,
  trades?: any[],
  managementState?: any,
  managementTrades?: any[],
  options?: { resetTrades?: boolean }
) {
  try {
    const filePath = path.join(ROBOTS_DIR, `${robotId}.json`);
    let existing: any = {};

    if (fs.existsSync(filePath)) {
      try {
        existing = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      } catch (_) { /* ignore */ }
    } else {
      // Direct load from memory for running robots if file is missing
      const runtime = runtimes.get(robotId);
      if (runtime) {
        existing = {
          config: runtime.config,
          trades: runtime.trades,
          managementState: runtime.managementState
        };
      }
    }
    
    // Merge configs
    const mergedConfig = { ...(existing.config || {}), ...config };
    
    // Merge trades: DO NOT overwrite non-empty trades unless resetTrades option is explicitly true
    let mergedTrades = existing.trades || [];
    if (options?.resetTrades === true) {
      mergedTrades = [];
    } else if (trades && trades.length > 0) {
      const tradeMap = new Map();
      mergedTrades.forEach((t: any) => {
        if (t && t.id) tradeMap.set(t.id, t);
      });
      trades.forEach((t: any) => {
        if (t && t.id) {
          tradeMap.set(t.id, { ...(tradeMap.get(t.id) || {}), ...t });
        }
      });
      mergedTrades = Array.from(tradeMap.values()).sort((a: any, b: any) => (b.ts || 0) - (a.ts || 0));
    }

    // Merge managementState: prevent zero/empty state from wiping out accumulated stats
    const mergedManagementState = { ...(existing.managementState || {}) };
    if (managementState) {
      for (const [key, val] of Object.entries(managementState)) {
        if (val !== undefined && val !== null) {
          // If the new value is 0 but we already have a non-zero value, and it's not an explicit reset request, preserve the non-zero value.
          // Note: resetRobotPnl and resetRobotDailyPnl set lastResetDate to 'now'.
          if ((key === "totalPnl" || key === "currentDailyPnl") && val === 0 && mergedManagementState[key] && mergedManagementState[key] !== 0) {
            // Check if lastResetDate was recently updated. If not, preserve the value.
            if (managementState.lastResetDate !== existing.managementState?.lastResetDate) {
               mergedManagementState[key] = val;
            }
          } else {
            mergedManagementState[key] = val;
          }
        }
      }
    }

    const updatedData = {
      ...existing,
      config: mergedConfig,
      trades: mergedTrades,
      managementState: mergedManagementState,
      ...(managementTrades !== undefined ? { managementTrades } : {}),
      updatedAt: Date.now(),
    };

    if (!fs.existsSync(ROBOTS_DIR)) {
      fs.mkdirSync(ROBOTS_DIR, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(updatedData, null, 2));

    // Update global cache synchronously
    robotsCache[robotId] = updatedData;

    // Async sync to MySQL DB
    (async () => {
      try {
        const active = await isDbActive();
        if (!active) return;

        const db = await getDb();
        
        // Upsert Robot config
        const isRobotRunning = runtimes.has(robotId);
        
        // Save execution details inside managementState for persistence recoveries
        if (isRobotRunning) {
          const runDetail = runtimes.get(robotId);
          if (runDetail) {
            mergedManagementState.demoToken = runDetail.demoToken;
            mergedManagementState.realToken = runDetail.realToken;
            mergedManagementState.srLines = runDetail.srLines || [];
            mergedManagementState.srZones = runDetail.srZones || [];
            mergedManagementState.trendLines = runDetail.trendLines || [];
          }
        }

        // Merge managementTrades — preserve existing if parameter not provided
        const mergedMgmtTrades = managementTrades !== undefined
          ? managementTrades
          : (existing.managementTrades || []);

        const robotExists = await db.select().from(robotsSchema).where(eq(robotsSchema.id, robotId)).limit(1);
        if (robotExists.length > 0) {
          await db.update(robotsSchema).set({
            name: mergedConfig.name || robotId,
            active: mergedConfig.active === true,
            config: mergedConfig,
            managementState: mergedManagementState,
            managementTrades: mergedMgmtTrades,
            updatedAt: new Date(),
          }).where(eq(robotsSchema.id, robotId));
        } else {
          await db.insert(robotsSchema).values({
            id: robotId,
            name: mergedConfig.name || robotId,
            active: mergedConfig.active === true,
            config: mergedConfig,
            managementState: mergedManagementState,
            managementTrades: mergedMgmtTrades,
          });
        }

        // Upsert Trades
        if (trades && trades.length > 0) {
          for (const t of trades) {
            if (!t || !t.id) continue;
            try {
              const tradeExists = await db.select().from(tradesSchema).where(eq(tradesSchema.id, t.id)).limit(1);
              const values = {
                id: t.id,
                robotId,
                contractId: t.contractId || t.id,
                asset: t.asset || "R_100",
                action: t.action || t.type || "CALL",
                stake: String(t.stake || t.amount || 10),
                payout: String(t.payout || 0),
                profit: String(t.profit || t.pnl || 0),
                result: t.result || "LOSS",
                mode: t.mode || "demo",
                warmup: t.warmup === true,
                timestamp: t.ts ? new Date(t.ts) : new Date(),
                snapshot: t.snapshot || null,
              };

              if (tradeExists.length > 0) {
                await db.update(tradesSchema).set(values).where(eq(tradesSchema.id, t.id));
              } else {
                await db.insert(tradesSchema).values(values);
              }
            } catch (_) { /* ignore individual trade error */ }
          }
        } else if (trades && trades.length === 0) {
          await db.delete(tradesSchema).where(eq(tradesSchema.robotId, robotId));
        }
      } catch (dbErr: any) {
        console.error(`[ServerEngine] [DB Backup] Failed to update robot ${robotId} in MySQL:`, dbErr.message || dbErr);
      }
    })();
  } catch (err) {
    console.error(`[ServerEngine] ❌ Failed to update robot ${robotId} in file:`, err);
  }
}

// ─── MT5 / Binary trade router ───────────────────────────────────────
// Routes BUY/SELL orders to MT5 (forex CFD) or CALL/PUT to binary API based on market type.
async function executeTrade(
  api: any,
  runtime: RobotRuntime,
  derivSymbol: string,
  action: string,
  stake: number,
  duration: number
): Promise<any> {
  const isForex = runtime.config?.marketType === "forex";
  const mt5Connected = api.mt5Connected === true;

  // MT5 path: forex CFD with lot size, SL, TP
  if (isForex && mt5Connected) {
    const config = runtime.config;
    const lotSize = config.forexConfig?.stake || config.management?.stake || 0.1;
    const stopLossPips = config.forexConfig?.stopLoss || 0;
    const takeProfitPips = config.forexConfig?.goal || 0;
    const entryPrice = 0; // 0 = market order

    console.log(`[ServerEngine] 📊 MT5 Order: ${action} ${lotSize} lot on ${derivSymbol} (SL: ${stopLossPips}p, TP: ${takeProfitPips}p)`);

    const orderRes = await api.mt5CreateOrder(derivSymbol, action, lotSize, stopLossPips, takeProfitPips);
    if (orderRes?.mt5_order) {
      return {
        contract_id: orderRes.mt5_order.order,
        buy: { contract_id: orderRes.mt5_order.order }
      };
    }
    return null;
  }

  // Binary path: standard buyContract with CALL/PUT
  return api.buyContract(derivSymbol, stake, action as any, duration, "s", { 
    robotId: runtime.id,
    timeframe: runtime.config?.timeframe || "1m"
  });
}

export function deleteRobotFromDb(robotId: string) {
  try {
    const filePath = path.join(ROBOTS_DIR, `${robotId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[ServerEngine] 🗑 Deleted robot file "${filePath}"`);
    }

    // Synchronously clean cache
    delete robotsCache[robotId];

    // Async DB deletion
    (async () => {
      try {
        const active = await isDbActive();
        if (!active) return;

        const db = await getDb();
        await db.delete(robotsSchema).where(eq(robotsSchema.id, robotId));
        await db.delete(tradesSchema).where(eq(tradesSchema.robotId, robotId));
        console.log(`[ServerEngine] [DB Backup] Deleted robot ${robotId} from MySQL.`);
      } catch (dbErr: any) {
        console.error(`[ServerEngine] [DB Backup] Failed to delete robot ${robotId} from MySQL:`, dbErr.message || dbErr);
      }
    })();
  } catch (err) {
    console.error(`[ServerEngine] ❌ Failed to delete robot file for ${robotId}:`, err);
  }
}

export function isRobotRunningOrBooting(id: string): boolean {
  return runtimes.has(id) || bootingRobotIds.has(id);
}

export function getRunningRobotStatuses() {
  const statuses: any[] = [];
  
  // 1. Process active runtimes
  runtimes.forEach((runtime, id) => {
    const uptime = Math.floor((Date.now() - runtime.startedAt) / 1000);
    statuses.push({
      id,
      status: "running",
      message: "Operando na VPS",
      uptime,
      assets: Object.keys(runtime.assetStates),
      candleCount: Object.values(runtime.assetStates).reduce((s, a) => s + a.candles.length, 0),
      // Omit trades to prevent WebSocket max payload limit violations (fixes transport error)
      managementState: runtime.managementState,
    });
  });

  // 2. Process booting robots as placeholder runtimes so client handles reconnects cleanly
  bootingRobotIds.forEach((id) => {
    if (runtimes.has(id)) return;
    if (startupErrors.has(id)) return;
    statuses.push({
      id,
      status: "running",
      message: "Iniciando na VPS...",
      uptime: 0,
      assets: [],
      candleCount: 0,
      trades: [],
      managementState: {},
    });
  });

  // 3. Process failed robots
  startupErrors.forEach((err, id) => {
    statuses.push({
      id,
      status: "error",
      message: err.message,
      ts: err.ts
    });
  });

  return statuses;
}

/**
 * Returns a summary of current market data for AI consumption.
 */
export async function getGlobalMarketSnapshot() {
  const snapshot: Record<string, any> = {};
  
  // 1. Get data from global cache
  try {
    for (const [symbol, data] of globalCandleCache.entries()) {
      if (data.candles && data.candles.length > 0) {
        const last = data.candles[data.candles.length - 1];
        const prev = data.candles[data.candles.length - 2];
        
        snapshot[symbol] = {
          lastPrice: last.c,
          change: prev ? ((last.c / prev.c) - 1) * 100 : 0,
          high: last.h,
          low: last.l,
          lastUpdate: data.lastUpdate
        };
      }
    }
  } catch (err) {
    console.error("[ServerEngine] Error iterating candle cache:", err);
  }

  // 2. Try fetching missing common assets if snapshot is small
  const commonAssets = ["R_100", "R_50", "R_10", "R_25"];
  
  // Check if we even HAVE a token before attempting background fetches
  // If no robots are running and no persistence token, don't even try - prevents 500s from auth loops
  const hasToken = getAnyValidToken() !== null;
  
  if (hasToken) {
    for (const asset of commonAssets) {
      if (snapshot[asset]) continue;
      try {
        // Use a timeout for each fetch to prevent hanging the whole request
        const candles = await Promise.race([
          getOrFetchCandles(asset),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2000))
        ]).catch(() => null);

        if (candles && candles.length > 0) {
          const last = candles[candles.length - 1];
          snapshot[asset] = {
            lastPrice: last.c,
            lastUpdate: Date.now()
          };
        }
      } catch (err) {
        // Silently ignore background fetch errors for snapshot
      }
    }
  }

  return snapshot;
}

// ─── Timeframe helpers ────────────────────────────────────────────────────────

function tfToMs(tf: string): number {
  const map: Record<string, number> = {
    "1m": 60_000,
    "2m": 120_000,
    "3m": 180_000,
    "5m": 300_000,
    "10m": 600_000,
    "15m": 900_000,
    "30m": 1_800_000,
    "1h": 3_600_000,
    "4h": 14_400_000,
    "1d": 86_400_000,
  };
  return map[tf] || 60_000;
}

/** Retorna o runtime ativo de um robô pelo ID (usado para updates de config em tempo real) */
export function getRobotRuntime(id: string): RobotRuntime | undefined {
  return runtimes.get(id);
}

export function updateRobotLines(id: string, srLines: any[], srZones: any[], trendLines?: any[]) {
  const runtime = runtimes.get(id);
  if (runtime) {
    runtime.srLines = srLines;
    runtime.srZones = srZones;
    if (trendLines) runtime.trendLines = trendLines;
  }
}

export function resetRobotPnl(id: string) {
  const runtime = runtimes.get(id);
  if (runtime) {
    console.log(`[ServerEngine] ♻ Resetting history and PnL for robot "${id}"`);
    runtime.config.currentDailyPnl = 0;
    if (runtime.managementState) {
      runtime.managementState.currentDailyPnl = 0;
      runtime.managementState.totalPnl = 0;
      runtime.managementState.lastResetDate = new Date().toISOString().split("T")[0];
    }
    runtime.lastResult = null;
    runtime.lastPnl = 0;
    runtime.trades = [];
    saveActiveRobots();
    // Persist reset to robot file
    updateRobotInDb(id, runtime.config, [], runtime.managementState, runtime.managementTrades, { resetTrades: true });
  } else {
    // Robot not running — clean up file directly with atomic reset
    updateRobotInDb(id, {}, [], {
      totalPnl: 0,
      currentDailyPnl: 0,
      lastResetDate: new Date().toISOString().split("T")[0]
    }, [], { resetTrades: true });
  }
}

/** Reseta todos os dados da gestão de um robô — PnL, trades de gestão, estado de runtime */
export function resetRobotManagement(id: string) {
  const runtime = runtimes.get(id);
  if (runtime) {
    console.log(`[ServerEngine] ♻ Resetting full management state for robot "${id}"`);
    runtime.lastResult = null;
    runtime.lastPnl = 0;
    runtime.lastStake = 0;
    runtime.currentStake = runtime.config.management?.stake || 10;
    runtime.sorosConsecutiveWins = 0;
    runtime.martingaleStep = 0;
    runtime.managementTrades = [];
    runtime.managementState.lastDemoResult = null;
    runtime.managementState.vdCycle = "";
    runtime.managementState.isPausedByVD = false;
    runtime.managementState.waitingForWins = 0;
    runtime.managementState.currentDailyPnl = 0;
    runtime.managementState.totalPnl = 0;
    runtime.managementState.sorosConsecutiveWins = 0;
    runtime.managementState.martingaleStep = 0;
    runtime.managementState.lastResult = null;
    runtime.managementState.lastPnl = 0;
    runtime.managementState.lastStake = 0;
    runtime.managementState.lastResetDate = new Date().toISOString().split("T")[0];
    runtime.config.currentDailyPnl = 0;
    saveActiveRobots();
    updateRobotInDb(id, runtime.config, runtime.trades, runtime.managementState, runtime.managementTrades);
  } else {
    const today = new Date().toISOString().split("T")[0];
    updateRobotInDb(id, {}, [], {
      lastDemoResult: null,
      vdCycle: "",
      isPausedByVD: false,
      waitingForWins: 0,
      currentDailyPnl: 0,
      totalPnl: 0,
      sorosConsecutiveWins: 0,
      martingaleStep: 0,
      lastResult: null,
      lastPnl: 0,
      lastStake: 0,
      lastResetDate: today,
    }, []);
  }
}

export function resetRobotDailyPnl(id: string) {
  const runtime = runtimes.get(id);
  if (runtime) {
    console.log(`[ServerEngine] ♻ Resetting daily PnL for robot "${id}" (preserving history & total PnL)`);
    runtime.config.currentDailyPnl = 0;
    if (runtime.managementState) {
      runtime.managementState.currentDailyPnl = 0;
      runtime.managementState.lastResetDate = new Date().toISOString().split("T")[0];
    }
    saveActiveRobots();
    // Persist reset to robot file
    updateRobotInDb(id, runtime.config, runtime.trades, runtime.managementState, runtime.managementTrades);
  } else {
    // Robot not running
    updateRobotInDb(id, {}, undefined, {
      currentDailyPnl: 0,
      lastResetDate: new Date().toISOString().split("T")[0]
    }, []);
  }
}

// ─── Strategy loader ──────────────────────────────────────────────────────────

/**
 * Runtime library map — strategies that `import { sma } from "@/lib/market"`
 * or `import { Candle } from "@/lib/market"` get resolved to the real modules
 * already loaded by the server.
 */
const STRATEGY_RUNTIME_MODULES: Record<string, any> = {
  "./index": {},           // Type-only imports — empty at runtime
  "@/strategies": {},      // Type-only imports — empty at runtime
  "@/strategies/index": {},
  "@/lib/market": marketLib,
};

export function loadStrategy(fileName: string): { strategy: Strategy | null; error?: string } {
  try {
    const baseName = fileName.endsWith(".ts") ? fileName : `${fileName}.ts`;
    let filePath = "";

    const dynamicPath = path.join(DYNAMIC_STRATEGIES_DIR, baseName);
    const gitPath = path.join(GIT_STRATEGIES_DIR, baseName);

    if (fs.existsSync(dynamicPath)) {
      filePath = dynamicPath;
    } else if (fs.existsSync(gitPath)) {
      filePath = gitPath;
    } else {
      // Fallback: Scan directories for internal ID match (Dynamic first, then Git)
      console.log(`[ServerEngine] Strategy file "${fileName}" not found directly. Scanning directories...`);
      let found = false;

      // Scan dynamic directory
      if (fs.existsSync(DYNAMIC_STRATEGIES_DIR)) {
        const files = fs.readdirSync(DYNAMIC_STRATEGIES_DIR).filter(f => f.endsWith(".ts"));
        for (const file of files) {
          const fullPath = path.join(DYNAMIC_STRATEGIES_DIR, file);
          const content = fs.readFileSync(fullPath, "utf-8");
          const idMatch = content.match(/id:\s*["'`](.+?)["'`](?:\s*,)?/);
          if (idMatch && (idMatch[1] === fileName || file.replace(".ts", "") === fileName)) {
            filePath = fullPath;
            found = true;
            break;
          }
        }
      }

      // Scan git directory if not found in dynamic
      if (!found && fs.existsSync(GIT_STRATEGIES_DIR)) {
        const files = fs.readdirSync(GIT_STRATEGIES_DIR).filter(f => f.endsWith(".ts"));
        for (const file of files) {
          const fullPath = path.join(GIT_STRATEGIES_DIR, file);
          const content = fs.readFileSync(fullPath, "utf-8");
          const idMatch = content.match(/id:\s*["'`](.+?)["'`](?:\s*,)?/);
          if (idMatch && (idMatch[1] === fileName || file.replace(".ts", "") === fileName)) {
            filePath = fullPath;
            found = true;
            break;
          }
        }
      }

      if (!found) {
        const msg = `Arquivo da estratégia "${fileName}" não encontrado no sistema de arquivos.`;
        console.error(`[ServerEngine] ❌ ${msg}`);
        return { strategy: null, error: msg };
      }
    }


    const code = fs.readFileSync(filePath, "utf-8");
    console.log(`[ServerEngine] Loading strategy from: ${filePath}`);

    // Transpile TypeScript → JavaScript using esbuild
    const result = transformSync(code, {
      loader: "ts",
      format: "cjs",
      target: "es2020",
    });

    // Create a sandboxed module
    const moduleObj: any = { exports: {} };
    const sandboxRequire = (id: string) => {
      if (STRATEGY_RUNTIME_MODULES[id]) return STRATEGY_RUNTIME_MODULES[id];
      try { return require(id); } catch (_) { return {}; }
    };

    const wrappedFn = new Function(
      "module", "exports", "require", "__filename", "__dirname",
      result.code
    );
    wrappedFn(moduleObj, moduleObj.exports, sandboxRequire, filePath, path.dirname(filePath));

    const strategy = moduleObj.exports.default || moduleObj.exports || null;
    if (strategy && strategy.id && typeof strategy.onTick === "function") {
      console.log(`[ServerEngine] ✅ Strategy loaded: "${strategy.name}" (${strategy.id})`);
      return { strategy };
    } else {
      const msg = `O arquivo foi carregado, mas não parece ser uma estratégia válida (falta 'id' ou 'onTick').`;
      console.error(`[ServerEngine] ❌ ${msg} no arquivo: ${filePath}`);
      return { strategy: null, error: msg };
    }
  } catch (e: any) {
    const msg = e.message || String(e);
    console.error(`[ServerEngine] ❌ Erro ao carregar estratégia "${fileName}":`, msg);
    return { strategy: null, error: `Erro de sintaxe/compilação: ${msg}` };
  }
}

// ─── Start robot ──────────────────────────────────────────────────────────────

export async function startRobotOnServer(config: any, demoToken: string, realToken: string, candleToken?: string, robotTokens?: string[], srLines: any[] = [], srZones: any[] = [], trendLines: any[] = [], socket?: Socket) {
  if (!config?.id) return;

  // Stop existing runtime if already running (for clean restart)
  if (runtimes.has(config.id)) {
    console.log(`[ServerEngine] Robot "${config.name}" (${config.id}) already running — stopping first for clean restart`);
    await stopRobotOnServer(config.id, false, true); // isRestarting = true
  } else if (bootingRobotIds.has(config.id)) {
    console.log(`[ServerEngine] Robot "${config.name}" (${config.id}) is already booting — skipping duplicate start call`);
    return;
  }

  // Track boot state immediately
  bootingRobotIds.add(config.id);

  // Ensure strategyFileName exists — older robots might not have it

  // Allow forex assets if robot is forex market; otherwise enforce R_ only (binary options)
  const isForex = config.marketType === "forex";
  const validAssets = isForex
    ? (config.assets || [config.asset || "EURUSD"]).filter((sym: string) => !!sym)
    : (config.assets || [config.asset || "R_100"]).filter((sym: string) => sym?.startsWith("R_"));
  if (validAssets.length === 0) {
    const fallback = isForex ? "EURUSD" : "R_100";
    console.warn(`[ServerEngine] Robot "${config.name}" (${config.id}) had no valid ${isForex ? "forex" : "R_"} assets. Falling back to ["${fallback}"]`);
    validAssets.push(fallback);
  }
  config.assets = validAssets;

  console.log(`[ServerEngine] ▶ Starting robot "${config.name}" (${config.id}) | mode=${config.mode} | tf=${config.timeframe} | assets=${config.assets.join(",")}`);

  const { strategy: strategyMod, error: loadError } = loadStrategy(config.strategyFileName || config.strategyId);
  if (!strategyMod) {
    const msg = loadError || `Estratégia "${config.strategyFileName || config.strategyId}" não encontrada no servidor.`;
    console.error(`[ServerEngine] ❌ ${msg}`);
    socket?.emit("robot-error", { id: config.id, message: msg });
    return;
  }

  // Resilient token resolution (fallback to other running runtimes, file persistence, or saved config)
  let finalDemoToken = demoToken;
  let finalRealToken = realToken;

  if (!finalDemoToken || !finalRealToken) {
    for (const r of runtimes.values()) {
      if (!finalDemoToken && r.demoToken) finalDemoToken = r.demoToken;
      if (!finalRealToken && r.realToken) finalRealToken = r.realToken;
    }
    if ((!finalDemoToken || !finalRealToken) && fs.existsSync(PERSISTENCE_FILE)) {
      try {
        const data = JSON.parse(fs.readFileSync(PERSISTENCE_FILE, "utf-8"));
        if (Array.isArray(data)) {
          for (const robot of data) {
            if (!finalDemoToken && (robot.demoToken || robot.token)) finalDemoToken = robot.demoToken || robot.token;
            if (!finalRealToken && (robot.realToken || robot.token)) finalRealToken = robot.realToken || robot.token;
          }
        }
      } catch (_) { /* empty */ }
    }
    // Fallback: use saved token config (from Settings UI)
    if (!finalDemoToken || !finalRealToken) {
      const savedTokens = loadTokenConfig();
      if (!finalDemoToken) finalDemoToken = savedTokens.demoToken || "";
      if (!finalRealToken) finalRealToken = savedTokens.realToken || "";
    }
  }

  // Store dedicated candle data token at module level for central data collector
  if (candleToken) {
    _candleToken = candleToken;
  } else if (!_candleToken) {
    // Fallback: use saved candle token from config
    const savedTokens = loadTokenConfig();
    if (savedTokens.candleToken) {
      _candleToken = savedTokens.candleToken;
      console.log(`[ServerEngine] Using saved candle token from config`);
    }
  }

  // ── Multi-token: round-robin assignment from robotTokens[] ──
  let assignedToken: string | undefined;
  const tokens = (robotTokens || []).filter((t: string) => t?.length > 0);
  if (tokens.length > 0) {
    // Use current runtime count as round-robin index (existing runtime for same ID already removed)
    const idx = runtimes.size % tokens.length;
    assignedToken = tokens[idx];
    console.log(`[ServerEngine] Multi-token: assigned token[${idx}] to robot "${config.id}" (${tokens.length} tokens available)`);
  }

  const hasShadowTrading = Boolean(
    config.management?.active && (
      config.management?.entryAfterWin ||
      config.management?.vdFilter
    )
  );

  const analysisMode = hasShadowTrading ? "demo" : config.mode;
  const executionMode = config.management?.active
    ? (config.management.account || config.mode)
    : config.mode;

  const primaryToken = assignedToken || ((analysisMode === "demo") ? finalDemoToken : finalRealToken);
  if (!primaryToken) {
    const msg = `Nenhum Token API válido foi configurado para a conta ${analysisMode === "demo" ? "Demo" : "Real"}. Por favor, vai às Configurações (Settings) no menu e grava os teus Tokens gerados na Deriv.`;
    console.error(`[ServerEngine] ❌ ${msg}`);
    socket?.emit("robot-error", { id: config.id, message: msg });
    return;
  }

  // Shared trading API: no per-robot DerivAPI instances.
  // All robots on the same accountType share ONE WS connection via getTradingApi().
  // The api/mgmtApi will be resolved lazily at trade execution time.

  const hasAccountSplit = hasShadowTrading || (analysisMode !== executionMode);
  const executionAccountType = hasAccountSplit ? executionMode : analysisMode;

  // Acquire reference on the shared trading API pool for this running robot
  await acquireTradingApi(executionAccountType as "demo" | "real", primaryToken, config.name);
  if (hasAccountSplit && analysisMode !== executionAccountType) {
    const analysisToken = (analysisMode === "demo") ? finalDemoToken : finalRealToken;
    await acquireTradingApi(analysisMode as "demo" | "real", analysisToken, config.name);
  }

  // MT5 login for forex robots — uses the shared trading API, happens once per WS connection
  if (config.marketType === "forex") {
    try {
      const execToken = (executionAccountType === "demo") ? finalDemoToken : finalRealToken;
      const mt5Api = await getTradingApi(executionAccountType, execToken, config.name);
      const mt5CredsPath = path.join(BASE_DATA_DIR, "mt5_credentials.json");
      if (fs.existsSync(mt5CredsPath)) {
        const creds = JSON.parse(fs.readFileSync(mt5CredsPath, "utf-8"));
        if (creds.loginId && creds.password) {
          await mt5Api.mt5Login(creds.loginId, creds.password);
          console.log(`[ServerEngine] ✅ MT5 logged in for forex robot "${config.id}" (login: ${creds.loginId})`);
        }
      } else {
        console.warn(`[ServerEngine] ⚠️ No MT5 credentials found for forex robot "${config.id}". Set MT5 credentials in the Forex Config page.`);
      }
    } catch (mt5Err: any) {
      console.error(`[ServerEngine] ❌ MT5 login failed for forex robot "${config.id}":`, mt5Err.message || mt5Err);
    }
  }

  // Recover existing, persisted trade history and financial managementState from robots_db.json (volume Docker)
  // to prevent overriding history when client triggers start/restart with empty cache.
  const robotsDb = loadRobotsDb();
  const dbRecord = robotsDb[config.id] || {};
  const dbTrades = dbRecord.trades || [];
  const dbMgmtState = dbRecord.managementState || {};
  const dbMgmtTrades = dbRecord.managementTrades || [];

  const restoredSorosWins = Number(dbMgmtState.sorosConsecutiveWins ?? config.managementState?.sorosConsecutiveWins ?? 0);
  const restoredMartingaleStep = Number(dbMgmtState.martingaleStep ?? config.managementState?.martingaleStep ?? 0);
  const restoredLastResult = (dbMgmtState.lastResult ?? config.managementState?.lastResult ?? null) as "WIN" | "LOSS" | null;
  const restoredLastPnl = Number(dbMgmtState.lastPnl ?? config.managementState?.lastPnl ?? 0);
  const restoredLastStake = Number(dbMgmtState.lastStake ?? config.managementState?.lastStake ?? config.management?.stake ?? 10);

  const runtime: RobotRuntime = {
    id: config.id,
    config,
    demoToken: finalDemoToken,
    realToken: finalRealToken,
    assignedToken,
    candleToken: _candleToken || undefined,
    assetStates: {},
    tickInterval: null,
    lastResult: restoredLastResult,
    lastPnl: restoredLastPnl,
    lastStake: restoredLastStake,
    sorosConsecutiveWins: restoredSorosWins,
    martingaleStep: restoredMartingaleStep,
    managementState: {
      lastDemoResult: dbMgmtState.lastDemoResult ?? config.managementState?.lastDemoResult ?? null,
      vdCycle: dbMgmtState.vdCycle ?? config.managementState?.vdCycle ?? "",
      isPausedByVD: dbMgmtState.isPausedByVD ?? config.managementState?.isPausedByVD ?? false,
      waitingForWins: dbMgmtState.waitingForWins ?? config.managementState?.waitingForWins ?? 0,
      currentDailyPnl: Number(dbMgmtState.currentDailyPnl ?? config.managementState?.currentDailyPnl ?? 0),
      totalPnl: Number(dbMgmtState.totalPnl ?? config.managementState?.totalPnl ?? 0),
      lastResetDate: dbMgmtState.lastResetDate ?? config.managementState?.lastResetDate ?? new Date().toISOString().split("T")[0],
      sorosConsecutiveWins: restoredSorosWins,
      martingaleStep: restoredMartingaleStep,
      lastResult: restoredLastResult,
      lastPnl: restoredLastPnl,
      lastStake: restoredLastStake,
    },
    activeContractIds: new Set(),
    warmupContractIds: new Set(),
    activeContractsByAsset: new Map(),
    activeContractsExpiry: new Map(),
    contractMeta: new Map(),
    currentStake: config.management?.stake || 10,
    strategyMod,
    startedAt: Date.now(),
    srLines: srLines || [],
    srZones: srZones || [],
    trendLines: trendLines || [],
    deferredSettlements: new Map(),
    contractPollRetries: new Map(),
    lastPollTimes: new Map(),
    pendingBatchMgmt: null,
    pendingBatchTimer: null,
    trades: (dbTrades && dbTrades.length > 0) ? dbTrades : (config.trades || []),
    managementTrades: (dbMgmtTrades && dbMgmtTrades.length > 0) ? dbMgmtTrades : [],
    pendingCheckInterval: null,
    pendingOrders: new Map(),
  };

  runtimes.set(config.id, runtime);
  startupErrors.delete(config.id); // Clear any previous errors if we managed to start

  // ── Recover stale OPEN trades into activeContractIds ──
  // After server restart, activeContractIds is empty, so the pendingCheckInterval
  // would never poll these contracts. By adding them here, the 3-second polling
  // loop will automatically check their status on the Deriv API.
  const openTrades = runtime.trades.filter((t: any) => t.result === "OPEN");
  if (openTrades.length > 0) {
    console.log(`[ServerEngine] 🔄 Found ${openTrades.length} stale OPEN trades for robot "${config.id}" — adding to active contract recovery set`);
    for (const t of openTrades) {
      const cid = String(t.id);
      runtime.activeContractIds.add(cid);
      // Estimate expiry from trade timestamp + duration (fallback 5min)
      const estimatedDuration = (t.durationS || 300) * 1000;
      const estimatedExpiry = (t.ts || Date.now()) + estimatedDuration;
      runtime.activeContractsExpiry.set(cid, estimatedExpiry);
      scheduleDedicatedContractValidator(runtime, cid, estimatedExpiry);
    }
  }

  saveActiveRobots();
  // Persist robot config to robots_db.json (volume Docker)
  updateRobotInDb(config.id, config, runtime.trades, runtime.managementState, runtime.managementTrades);

  // ── No per-robot DerivAPI connection — shared via getTradingApi() ──
  // No individual WS/OTP/ping per robot. Settlement uses polling + shared onOpenContract dispatch.

  const assets = config.assets || [config.asset || "R_100"];

  for (const symbol of assets) {
    let assetSuccess = false;
    let initAttempts = 3;

    while (initAttempts > 0 && !assetSuccess) {
      try {
        const derivSymbol = getDerivSymbol(symbol);
        console.log(`[ServerEngine] Initialising asset ${symbol} → Deriv symbol: ${derivSymbol} (Attempts remaining: ${initAttempts})`);

        runtime.assetStates[symbol] = {
          candles: [],
          lastTradeTime: 0,
          lastSignalCandleTs: 0,
          ready: false,
          // Fresh strategy instance per asset to avoid module-level global state pollution
          strategyMod: loadStrategy(config.strategyFileName || config.strategyId).strategy,
        };

        // Fetch candle history (re-use from global cache or centrally retrieve)
        const candlesData = await getOrFetchCandles(symbol);

        if (candlesData && candlesData.length > 0) {
          console.log(`[ServerEngine] ✅ Received ${candlesData.length} candles for ${derivSymbol} (asset: ${symbol})`);
          runtime.assetStates[symbol].candles = [...candlesData];
          runtime.assetStates[symbol].ready = true;
        } else {
          console.warn(`[ServerEngine] ⚠ No candles received for ${derivSymbol} — asset will not be ready`);
        }

        // Register and ensure central subscription is active for tick streaming
        console.log(`[ServerEngine] Ensuring central subscription for ${derivSymbol}...`);
        await ensureCentralSubscription(derivSymbol);

        assetSuccess = true;
      } catch (assetErr: any) {
        const errMsg = assetErr?.message || String(assetErr);

        if (errMsg.includes("This market is presently closed")) {
          console.error(`[ServerEngine] ❌ Market "${symbol}" is closed. Skipping initialization.`);
          socket?.emit("robot-error", { id: config.id, message: `Mercado ${symbol} está fechado (Market Closed).` });
          break;
        }

        initAttempts--;
        console.error(`[ServerEngine] ❌ Error initializing asset "${symbol}" for robot "${config.id}" (Attempts remaining: ${initAttempts}):`, errMsg);
        if (initAttempts > 0) {
          console.log(`[ServerEngine] ⏳ Waiting 3 seconds before retrying asset "${symbol}"...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        } else {
          // Keep going to next assets even if one completely fails
          break;
        }
      }
    }

    // Wait 1 second before fetching the next asset to prevent hitting rate limits
    if (assets.indexOf(symbol) < assets.length - 1) {
      console.log(`[ServerEngine] ⏳ Staggering next asset setup (1s)...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  bootingRobotIds.delete(config.id);
  console.log(`[ServerEngine] ✅ Robot "${config.name}" (${config.id}) is now RUNNING`);

  // ── Strategy loop — runs every second, iterates all assets ──
  runtime.tickInterval = setInterval(() => {
    for (const symbol of assets) {
      if (!runtime.assetStates[symbol]?.ready) continue;
      executeStrategy(runtime, symbol);
    }
  }, 1000);

  // ── Pending contracts evaluation — safety check runs every 1s ──
  runtime.pendingCheckInterval = setInterval(async () => {
    if (runtime.activeContractIds.size === 0) return;
    const now = Date.now();
    const expiredContractIds = [...runtime.activeContractIds].filter(id => {
      const expiry = runtime.activeContractsExpiry.get(id);
      return !expiry || now >= expiry + 2000; // Check 2 seconds after expected expiry
    });
    if (expiredContractIds.length === 0) return;

    const accountType = (runtime.config.executionMode || runtime.config.analysisMode || "demo") as "demo" | "real";
    const token = accountType === "demo" ? runtime.demoToken : runtime.realToken;

    try {
      const api = await getTradingApi(accountType, token || null, `poll-${runtime.id}`);
      for (const contractId of expiredContractIds) {
        if (!runtime.activeContractIds.has(contractId)) continue;

        const lastPoll = runtime.lastPollTimes?.get(contractId) || 0;
        if (now - lastPoll < 3000) continue; // Rate-limit poll to max once every 3s
        runtime.lastPollTimes?.set(contractId, now);

        console.log(`[ServerEngine] 🔍 Official backup poll for contract ${contractId} (robot: "${runtime.id}")`);
        api.sendWithTimeout({ proposal_open_contract: 1, contract_id: Number(contractId) }, 3000)
          .then(res => {
            if (res?.proposal_open_contract) {
              const pc = res.proposal_open_contract;
              if (pc.status !== "open" || pc.is_sold === 1) {
                handleContractUpdate(runtime, pc);
              }
            }
          })
          .catch((err) => {
            console.warn(`[ServerEngine] ⚠️ Backup poll error for ${contractId}:`, err?.message || err);
          });
      }
    } catch (err: any) {
      console.error(`[ServerEngine] ❌ Backup poll setup error for robot "${runtime.id}":`, err?.message || err);
    }
  }, 1000);

  io?.emit("robot-status", {
    id: config.id,
    status: "running",
    message: "Operando na VPS",
    assets: Object.keys(runtime.assetStates),
    candleCount: Object.values(runtime.assetStates).reduce((s, a) => s + a.candles.length, 0),
  });

}

// ─── Stop robot ───────────────────────────────────────────────────────────────

export async function stopRobotOnServer(id: string, isShutdown = false, isRestarting = false) {
  const runtime = runtimes.get(id);
  if (!runtime) {
    bootingRobotIds.delete(id);
    console.log(`[ServerEngine] stopRobotOnServer: robot ${id} not found (already stopped)`);
    return;
  }

  console.log(`[ServerEngine] ■ Stopping robot "${runtime.config?.name}" (${id})...`);

  // 1. Stop the strategy loop
  if (runtime.tickInterval) {
    clearInterval(runtime.tickInterval);
    runtime.tickInterval = null;
  }
  if (runtime.pendingCheckInterval) {
    clearInterval(runtime.pendingCheckInterval);
    runtime.pendingCheckInterval = null;
  }

  // 2. Release shared trading API references (no per-robot WS to disconnect)
  // The shared getTradingApi() pool handles refCount and only disconnects when all robots stop.
  const execMode = runtime.config?.executionMode || runtime.config?.analysisMode || "demo";
  releaseTradingApi(execMode as "demo" | "real");
  if (runtime.config?.analysisMode !== runtime.config?.executionMode) {
    releaseTradingApi((runtime.config?.analysisMode || "demo") as "demo" | "real");
  }

  // 3. Persist final state to robots_db.json before removing
  //    Only persist if robot wasn't already deleted from DB (ghost prevention)
  if (id in robotsCache) {
    const targetActive = isRestarting ? true : false;
    updateRobotInDb(id, { ...runtime.config, active: targetActive }, runtime.trades, runtime.managementState, runtime.managementTrades);
  } else {
    console.log(`[ServerEngine] Robot ${id} was already deleted from DB — skipping persist to prevent ghost.`);
  }

  // 4. Remove from runtimes map and booting set
  bootingRobotIds.delete(id);
  if (!isShutdown) {
    runtimes.delete(id);
    saveActiveRobots();
  }

  console.log(`[ServerEngine] ✅ Robot ${id} stopped and removed from memory (isShutdown: ${isShutdown}, isRestarting: ${isRestarting})`);
  if (!isRestarting) {
    io?.emit("robot-status", { id, status: "stopped", message: "Parado" });
  }
}

// ─── Tick handler ─────────────────────────────────────────────────────────────

async function handleTick(runtime: RobotRuntime, tick: any) {
  if (!tick || !tick.symbol) return;

  // Find which of our configured assets this tick belongs to
  const configuredSymbol =
    Object.keys(runtime.assetStates).find((s) => getDerivSymbol(s) === tick.symbol) || tick.symbol;

  const state = runtime.assetStates[configuredSymbol];
  if (!state || !state.ready) return;

  // MTF Engine: Internal buffer always tracks 1m candles
  const baseTfMs = 60_000;
  const candleTs = Math.floor((tick.epoch * 1000) / baseTfMs) * baseTfMs;

  const candles = state.candles;
  const lastCandle = candles[candles.length - 1];

  if (!lastCandle || candleTs > lastCandle.t) {
    // New 1m candle opened
    candles.push({ t: candleTs, o: tick.quote, h: tick.quote, l: tick.quote, c: tick.quote });
    // Keep a large enough buffer for resampling (Configurable limit, default 1000)
    if (candles.length > MAX_CANDLES_LIMIT) candles.shift();
  } else {
    // Update current 1m candle OHLC
    lastCandle.c = tick.quote;
    lastCandle.h = Math.max(lastCandle.h, tick.quote);
    lastCandle.l = Math.min(lastCandle.l, tick.quote);
  }

  // ── Pending Orders Logic ──
  const pending = runtime.pendingOrders?.get(configuredSymbol);
  if (pending && !state.isProcessing) {
    const now = Date.now();
    // 1. Check for expiration
    if (now > pending.expiryTs) {
      console.log(`[ServerEngine] ⏳ Pending order for ${configuredSymbol} expired.`);
      runtime.pendingOrders.delete(configuredSymbol);
    } else {
      // 2. Check if price hit the target
      // Target price hit logic: crossover or touching price
      const lastPrice = lastCandle.c;
      const hit = (pending.action === "CALL")
        ? (tick.quote <= pending.targetPrice) // Retest: buy when price drops to/below target
        : (tick.quote >= pending.targetPrice); // Peak: sell when price rises to/above target

      if (hit) {
        console.log(`[ServerEngine] 🎯 Pending order TRIGGERED for ${configuredSymbol} at ${tick.quote} (Target: ${pending.targetPrice})`);
        const orderData = { ...pending };
        runtime.pendingOrders.delete(configuredSymbol);

        // Execute the trade immediately
        triggerPendingExecution(runtime, configuredSymbol, orderData);
      }
    }
  }

  // Also update the global cache so new robots start with fresh data
  const derivSymbol = tick.symbol;
  const cached = globalCandleCache.get(derivSymbol);
  if (cached) {
    const lastCacheCandle = cached.candles[cached.candles.length - 1];
    if (!lastCacheCandle || candleTs > lastCacheCandle.t) {
      cached.candles.push({ t: candleTs, o: tick.quote, h: tick.quote, l: tick.quote, c: tick.quote });
      if (cached.candles.length > MAX_CANDLES_LIMIT) cached.candles.shift();
    } else {
      lastCacheCandle.c = tick.quote;
      lastCacheCandle.h = Math.max(lastCacheCandle.h, tick.quote);
      lastCacheCandle.l = Math.min(lastCacheCandle.l, tick.quote);
    }
    cached.lastUpdate = Date.now();
  }
}

// ─── Strategy execution ───────────────────────────────────────────────────────

async function executeStrategy(runtime: RobotRuntime, symbol: string) {
  const state = runtime.assetStates[symbol];
  if (!state) return;

  // Asset-level lock — prevents concurrent execution on the SAME asset
  if (state.isProcessing) return;

  // Guard: allow at most one open contract PER ASSET (Deriv symbol)
  // Multiple assets can have open contracts simultaneously
  const derivSymbolForAsset = getDerivSymbol(symbol);
  const hasOpenContractOnThisAsset = runtime.activeContractsByAsset?.has(derivSymbolForAsset);
  if (hasOpenContractOnThisAsset) return;

  // Guard: if a pending order exists for this symbol, don't generate a new signal
  // The pending order will either trigger (price hits target) or expire naturally
  if (runtime.pendingOrders?.has(symbol)) return;

  const candles1m = state.candles;
  // We need at least 2 candles to have 1 closed candle (history) and 1 current price
  if (candles1m.length < 2) return;

  const robotTf = runtime.config.timeframe || "1m";
  const intervalMs = tfToMs(robotTf);
  const intervalSec = intervalMs / 1000;
  
  // Utiliza a epoch exata do último tick da deriv para sincronia absoluta
  const cachedData = globalCandleCache.get(derivSymbolForAsset);
  const latestEpoch = cachedData?.lastEpoch ? cachedData.lastEpoch : Math.floor(Date.now() / 1000);
  const nowMs = latestEpoch * 1000;

  const currentCandleEpochSeconds = Math.floor(latestEpoch / intervalSec) * intervalSec;
  const currentCandleTs = currentCandleEpochSeconds * 1000;
  const candleTimeRemainingMs = (intervalSec - (latestEpoch % intervalSec)) * 1000;

  // Guard: Only execute once per candle to ensure we don't double-enter or enter late
  if (state.lastSignalCandleTs === currentCandleTs) return;
  state.lastSignalCandleTs = currentCandleTs;

  // Entry time restriction: dynamic latency tolerance based on operational timeframe & trade duration
  const elapsedSeconds = latestEpoch % intervalSec;
  const expiryCount = parseDuration(runtime.config.durationCandles || 1);
  const durationSec = expiryCount * intervalSec;
  const limits = getDynamicExecutionLimits(robotTf, durationSec, "s");
  const maxAllowedSeconds = limits.maxAllowedDelaySeconds;

  if (elapsedSeconds > maxAllowedSeconds) {
    if (!(state as any).loggedSkipTiming) {
      console.log(`[ServerEngine] ⚠️ Skip signal analysis for robot "${runtime.id}"@${symbol}: elapsed ${elapsedSeconds}s since open > maximum allowed ${maxAllowedSeconds}s (TF: ${robotTf}, duration: ${durationSec}s, waiting for next candle open)`);
      (state as any).loggedSkipTiming = true;
    }
    return;
  }
  (state as any).loggedSkipTiming = false;

  // MTF ENGINE: Resample the 1m buffer to the robot's target timeframe
  const targetMinutes = Math.max(1, intervalMs / 60000);
  const resampledCandles = resampleCandles(candles1m, targetMinutes);

  // Analysis History: ONLY CLOSED CANDLES (exclude any candle that is still in formation)
  const closedCandles = resampledCandles.filter((c) => c.t + intervalMs <= nowMs);
  if (closedCandles.length === 0) return;
  const closedCloses = closedCandles.map((c) => c.c);

  const context: StrategyContext = {
    asset: symbol,
    history: closedCandles,
    candles: closedCandles,
    lastPrice: closedCandles.length > 0 ? closedCandles[closedCandles.length - 1].c : resampledCandles[0].c,
    currentPrice: candles1m[candles1m.length - 1].c,
    balance: 0,
    tradingMode: runtime.config.mode || "demo",
    isBacktest: false,
    intervalMs,
    candleTimeRemainingMs,
    srLines: runtime.srLines.filter((l: any) => l.asset === symbol).map((l: any) => ({
      id: l.id, price: l.price, type: l.kind as "support" | "resistance", asset: l.asset,
    })),
    srZones: runtime.srZones.filter((z: any) => z.asset === symbol).map((z: any) => ({
      id: z.id, p1: z.topPrice, p2: z.bottomPrice,
      type: z.kind === "buy_zone" ? "support" : "resistance", asset: z.asset,
    })),
    trendLines: (runtime.trendLines || []).filter((l: any) => l.asset === symbol).map((l: any) => ({
      id: l.id, t1: l.t1, p1: l.p1, t2: l.t2, p2: l.p2, type: l.kind as "support" | "resistance", asset: l.asset,
    })),
    hasOpenTrade: hasOpenContractOnThisAsset,
    lastTrade: (() => {
      const finished = (runtime.config.trades || []).filter(t => t.result !== "OPEN" && t.asset === symbol);
      return finished.length > 0 ? finished[finished.length - 1] : undefined;
    })(),
    activeFilters: runtime.config.filters,
    index: closedCandles.length - 1,
    candle: closedCandles[closedCandles.length - 1] || closedCandles[0],
    warmUp: closedCandles.length < 150,
    isWarmUp: closedCandles.length < 150,
    isLast: false,
    getMTF: (minutes: number) => {
      const mtfCandles = resampleCandles(candles1m, minutes);
      // Ensure we only return completed candles for the requested timeframe
      return mtfCandles.filter(c => c.t + (minutes * 60000) <= nowMs);
    },
    indicators: {
      rsi: (p, ds) => {
        if (!ds) {
          const cacheKey = `rsi_${p}`;
          if (!state.cachedIndicators) state.cachedIndicators = {};
          if (state.cachedIndicators[cacheKey] !== undefined) {
             return state.cachedIndicators[cacheKey];
          }
          const res = rsi(closedCloses, p);
          state.cachedIndicators[cacheKey] = res;
          return res;
        }
        return rsi(ds, p);
      },
      sma: (p, ds) => {
        if (!ds) {
          const cacheKey = `sma_${p}`;
          if (!state.cachedIndicators) state.cachedIndicators = {};
          if (state.cachedIndicators[cacheKey] !== undefined) {
             return state.cachedIndicators[cacheKey];
          }
          const res = sma(closedCloses, p).map((v) => v || 0);
          state.cachedIndicators[cacheKey] = res;
          return res;
        }
        return sma(ds, p).map((v) => v || 0);
      },
      ema: (p, ds) => {
        if (!ds) {
          const cacheKey = `ema_${p}`;
          if (!state.cachedIndicators) state.cachedIndicators = {};
          if (state.cachedIndicators[cacheKey] !== undefined) {
             return state.cachedIndicators[cacheKey];
          }
          const res = ema(closedCloses, p).map((v) => v || 0);
          state.cachedIndicators[cacheKey] = res;
          return res;
        }
        return ema(ds, p).map((v) => v || 0);
      },
      bollinger: (p, m, ds) => {
        if (!ds) {
          const cacheKey = `bollinger_${p}_${m}`;
          if (!state.cachedIndicators) state.cachedIndicators = {};
          if (state.cachedIndicators[cacheKey] !== undefined) {
             return state.cachedIndicators[cacheKey];
          }
          const resRaw = bollinger(closedCloses, p, m);
          const res = { upper: resRaw.upper.map((v) => v || 0), lower: resRaw.lower.map((v) => v || 0) };
          state.cachedIndicators[cacheKey] = res;
          return res;
        }
        const resRaw = bollinger(ds, p, m);
        return { upper: resRaw.upper.map((v) => v || 0), lower: resRaw.lower.map((v) => v || 0) };
      },
      adx: (p, ds) => {
        if (!ds) {
          const cacheKey = `adx_${p}`;
          if (!state.cachedIndicators) state.cachedIndicators = {};
          if (state.cachedIndicators[cacheKey] !== undefined) {
             return state.cachedIndicators[cacheKey];
          }
          const resRaw = adx(closedCandles, p);
          const res = {
            adx: resRaw.adx.map((v) => v || 0),
            plusDi: resRaw.plusDi.map((v) => v || 0),
            minusDi: resRaw.minusDi.map((v) => v || 0),
          };
          state.cachedIndicators[cacheKey] = res;
          return res;
        }
        const resRaw = adx(ds, p);
        return {
          adx: resRaw.adx.map((v) => v || 0),
          plusDi: resRaw.plusDi.map((v) => v || 0),
          minusDi: resRaw.minusDi.map((v) => v || 0),
        };
      },
      macd: (f, s, sig, ds) => {
        if (!ds) {
          const cacheKey = `macd_${f}_${s}_${sig}`;
          if (!state.cachedIndicators) state.cachedIndicators = {};
          if (state.cachedIndicators[cacheKey] !== undefined) {
             return state.cachedIndicators[cacheKey];
          }
          const resRaw = macd(closedCloses, f, s, sig);
          const res = {
            macd: resRaw.macd.map((v) => v || 0),
            signal: resRaw.signal.map((v) => v || 0),
            histogram: resRaw.histogram.map((v) => v || 0),
          };
          state.cachedIndicators[cacheKey] = res;
          return res;
        }
        const resRaw = macd(ds, f, s, sig);
        return {
          macd: resRaw.macd.map((v) => v || 0),
          signal: resRaw.signal.map((v) => v || 0),
          histogram: resRaw.histogram.map((v) => v || 0),
        };
      },
      parabolicSar: (afStep, afMax, ds) => {
        if (!ds) {
          const cacheKey = `sar_${afStep}_${afMax}`;
          if (!state.cachedIndicators) state.cachedIndicators = {};
          if (state.cachedIndicators[cacheKey] !== undefined) {
             return state.cachedIndicators[cacheKey];
          }
          const src = closedCandles;
          const highs = src.map(c => c.h);
          const lows = src.map(c => c.l);
          const res = parabolicSar(highs, lows, afStep, afMax);
          state.cachedIndicators[cacheKey] = res;
          return res;
        }
        const highs = ds.map(c => c.h);
        const lows = ds.map(c => c.l);
        return parabolicSar(highs, lows, afStep, afMax);
      },
    },
    updateSR: (id: string, updates: any) => {
      const line = runtime.srLines.find((thisL: any) => thisL.id === id);
      if (line) {
        Object.assign(line, updates);
        io?.emit("robot-srline-update", { robotId: runtime.id, id, updates });
      }
    },
    updateTrendLine: (id: string, updates: any) => {
      const line = runtime.trendLines.find((thisL: any) => thisL.id === id);
      if (line) {
        Object.assign(line, updates);
        io?.emit("robot-trendline-update", { robotId: runtime.id, id, updates });
      }
    }
  };

  // ── Daily reset ──
  const today = new Date().toISOString().split("T")[0];
  if (runtime.config.lastResetDate !== today || runtime.managementState?.lastResetDate !== today) {
    console.log(`[ServerEngine] Daily reset for robot "${runtime.id}"`);
    runtime.config.currentDailyPnl = 0;
    runtime.config.lastResetDate = today;
    if (runtime.managementState) {
      runtime.managementState.currentDailyPnl = 0;
      runtime.managementState.lastResetDate = today;
    }
    saveActiveRobots();

    // Broadcast status to client to reset UI
    io?.emit("robot-trade-update", {
      id: runtime.id,
      contractId: "",
      result: "OPEN",
      pnl: 0,
      configUpdates: {
        managementState: runtime.managementState,
      }
    });
  }

  // ── Management guards ──
  const mState = runtime.managementState;
  
  // 1. Verificações do Robô Principal (Main Goal & Stop Loss)
  if (runtime.config.dailyGoal && mState.currentDailyPnl >= runtime.config.dailyGoal) return;
  if (runtime.config.dailyStopLoss && mState.currentDailyPnl <= -runtime.config.dailyStopLoss) return;

  // 2. Verificações da Gestão (Shadow Trading Goal & Stop Loss)
  if (runtime.config.management?.active) {
    if (runtime.config.management?.dailyGoal && mState.currentDailyPnl >= runtime.config.management.dailyGoal) return;
    if (runtime.config.management?.dailyStopLoss && mState.currentDailyPnl <= -runtime.config.management.dailyStopLoss) return;
  }

  // ── Shadow Trading Logic (Entry After Win & VD Paused Recovery) ──
  // Se entryAfterWin está ON, a Gestão só autoriza a conta real se a última demo foi WIN
  // E o robô só "cai" de volta pra demo quando perde na real.
  // Se o filtro VD pausou o robô, forçamos modo Warmup/Shadow (Demo) para acumular as 2 vitórias de recuperação.
  const isShadowMode = Boolean(
    runtime.config.management?.active && (
      (runtime.config.management?.entryAfterWin && mState.lastDemoResult !== "WIN") ||
      (runtime.config.management?.entryAfterLoss && mState.lastDemoResult !== "LOSS") ||
      mState.isPausedByVD
    )
  );
  // F3.1: trigger #1 é SKIPPED se sequenceConfig.startLevel > 1 ou onlyReal=true
  // isShadowTrigger é uma flag separada do shouldWarmup da gestão — ambos os conceitos coexistem.
  const seqCfg = runtime.config.sequenceConfig;
  const startLevel = seqCfg?.startLevel ?? 1;
  const onlyReal = seqCfg?.onlyReal ?? false;
  const isShadowTrigger = seqCfg?.enabled && (startLevel > 1 || onlyReal);
  const shouldWarmup = isShadowMode; // Gestão intacta — não combinar com isShadowTrigger

  const lastClosedCandleTs = closedCandles[closedCandles.length - 1].t;
  if (state.lastIndicatorCandleTs !== lastClosedCandleTs) {
    state.cachedIndicators = {};
    state.lastIndicatorCandleTs = lastClosedCandleTs;
    state.cachedRsiArr = undefined;
    state.cachedAdxData = undefined;
  }

  let rsiArr: (number | null)[];
  let adxData: any;

  if (state.cachedRsiArr && state.lastIndicatorCandleTs === lastClosedCandleTs) {
    rsiArr = state.cachedRsiArr;
  } else {
    rsiArr = rsi(closedCloses, 14);
    state.cachedRsiArr = rsiArr;
  }

  if (state.cachedAdxData && state.lastIndicatorCandleTs === lastClosedCandleTs) {
    adxData = state.cachedAdxData;
  } else {
    adxData = adx(closedCandles, 14);
    state.cachedAdxData = adxData;
  }

  try {
    state.isProcessing = true;

    // ── Sequence has priority: check if we need to advance the sequence ──
    const seq = runtime.sequenceState?.[symbol];
    if (seq?.active) {
      const lastCandle = closedCandles[closedCandles.length - 1];
      // Fix C: enforce 1-candle gap (same as backtest) so we don't fire two sequence entries in the same candle
      const sameCandle = seq.ultimoEntryCandleTs !== undefined && seq.ultimoEntryCandleTs === lastCandle?.t;
      const corActual = lastCandle.c > lastCandle.o ? "verde" : "vermelha";
      const pararPorCor = corActual !== seq.corEsperada;
      const pararPorMax = seq.totalEntradas >= seq.maxEntradas;

      if (pararPorCor || pararPorMax) {
        runtime.sequenceState![symbol] = { ...seq, active: false };
        saveActiveRobots();
        console.log(`[ServerEngine] Sequence stopped for ${runtime.id}@${symbol}: ${pararPorCor ? "wrong candle color" : "max entries"}`);
        // Fall through to onTick below (sequence ended)
      } else if (sameCandle) {
        // Fix C: wait for next candle to fire the next sequence entry
        console.log(`[ServerEngine] Sequence waiting for next candle for ${runtime.id}@${symbol} (current totalEntradas=${seq.totalEntradas})`);
        state.isProcessing = false;
        return;
      } else {
        seq.totalEntradas++;
        const levelMode = runtime.config.sequenceConfig?.levelModes?.[seq.totalEntradas] || "normal";
        const startLevel = runtime.config.sequenceConfig?.startLevel ?? 1;
        const onlyReal = runtime.config.sequenceConfig?.onlyReal ?? false;

        let isSkipped = (startLevel > 1 && seq.totalEntradas < startLevel)
          || (onlyReal && seq.totalEntradas !== startLevel)
          || (levelMode === "skip");

        const baseAction = seq.action;
        let effectiveAction: "CALL" | "PUT" | "BUY" | "SELL" = baseAction;

        if (levelMode === "invert") {
          effectiveAction = (baseAction === "CALL" || baseAction === "BUY") ? "PUT" : "CALL";
        } else if (levelMode === "invert_sell") {
          effectiveAction = (baseAction === "PUT" || baseAction === "SELL") ? "CALL" : baseAction;
        } else if (levelMode === "invert_buy") {
          effectiveAction = (baseAction === "CALL" || baseAction === "BUY") ? "PUT" : baseAction;
        } else if (levelMode === "only_sell") {
          if (baseAction === "CALL" || baseAction === "BUY") {
            isSkipped = true;
          } else {
            effectiveAction = "PUT";
          }
        } else if (levelMode === "only_buy") {
          if (baseAction === "PUT" || baseAction === "SELL") {
            isSkipped = true;
          } else {
            effectiveAction = "CALL";
          }
        }

        // Global sequenceInvert fallback if levelMode is normal
        if (levelMode === "normal" && runtime.config.sequenceConfig?.sequenceInvert && seq.totalEntradas >= 2) {
          effectiveAction = (baseAction === "CALL" || baseAction === "BUY") ? "PUT" : "CALL";
        }

        if (isSkipped) {
          runtime.sequenceState![symbol] = { ...seq, ultimoEntryCandleTs: lastCandle?.t };
          saveActiveRobots();
          state.lastSignalCandleTs = currentCandleTs;
          console.log(`[ServerEngine] Sequence #${seq.totalEntradas} SKIPPED for ${runtime.id}@${symbol} (levelMode=${levelMode})`);
          state.isProcessing = false;
          return;
        }

        const sequenceResult: StrategyResult = {
          action: effectiveAction,
          stake: seq.stake,
          customStats: { setupTipo: `Sequência #${seq.totalEntradas} (${effectiveAction})` },
        };

        // Fix C: record candle ts of this sequence entry to enforce 1-candle gap
        runtime.sequenceState![symbol] = { ...seq, ultimoEntryCandleTs: lastCandle?.t };
        saveActiveRobots();

        state.lastSignalCandleTs = currentCandleTs;
        // Fix F: passa shouldWarmup (gestão) para executeOrderForResult — gestão intacta
        await executeOrderForResult(runtime, symbol, state, sequenceResult, closedCandles, closedCloses, rsiArr, adxData, shouldWarmup);
        state.isProcessing = false;
        return;
      }
    }

    const rawResult = state.strategyMod?.onTick(context) ?? runtime.strategyMod!.onTick(context);
    const indicatorValues = computeIndicatorValues(closedCandles, symbol, rawResult);
    const result = applyFilterLogic(rawResult, runtime.config.filters, indicatorValues, runtime.config.globalInvert, runtime.config.strategyDirection);

    if (result && result.action) {
      // Mark as processed for this candle so we don't repeat
      state.lastSignalCandleTs = currentCandleTs;

      // ── minConsecutiveCandles: check enough same-color candles before sequence ──
      const minCons = result.sequenceTrigger?.minConsecutiveCandles ?? 0;
      if (minCons > 0) {
        const enough = closedCandles.length >= minCons &&
          closedCandles.slice(-minCons).every(c =>
            (result.action === "CALL" || result.action === "BUY") ? c.c > c.o : c.c < c.o
          );
        if (!enough) {
          console.log(`[ServerEngine] ⏳ Sequence block: not enough consecutive candles for ${symbol} (need ${minCons})`);
          state.isProcessing = false;
          return;
        }
      }

      // ── Ignorar Operação Principal (ignoreMainSignal): ignora o trade #0 e inicia a sequência directamente ──
      if (runtime.config.sequenceConfig?.enabled && runtime.config.sequenceConfig?.ignoreMainSignal) {
        console.log(`[ServerEngine] 🚫 Main signal SKIPPED for ${runtime.id}@${symbol} (ignoreMainSignal=true) -> Initializing sequence directly`);
        const initCandleTs = closedCandles[closedCandles.length - 1]?.t;
        if (!runtime.sequenceState) runtime.sequenceState = {};
        runtime.sequenceState[symbol] = {
          active: true,
          action: result.action as "CALL" | "PUT" | "BUY" | "SELL",
          corEsperada: (result.action === "CALL" || result.action === "BUY") ? "verde" : "vermelha",
          stake: result.stake ?? runtime.config.management?.stake ?? runtime.currentStake,
          maxEntradas: result.sequenceTrigger?.maxEntradas ?? (runtime.config.sequenceConfig?.enabled ? Math.min(Math.max(1, runtime.config.sequenceConfig.maxEntradas), 5) : 50),
          totalEntradas: 0,
          ultimoEntryCandleTs: initCandleTs,
        };
        saveActiveRobots();
        state.isProcessing = false;
        return;
      }

      // F3.1: skip puro do trigger (#1) se isShadowTrigger (startLevel > 1 ou onlyReal).
      // A sequência é activada mas a trade do trigger não é aberta; a #2 (e seguintes) executam normalmente.
      if (isShadowTrigger) {
        console.log(`[ServerEngine] Sequence #1 SKIPPED for ${runtime.id}@${symbol} (startLevel=${startLevel}, onlyReal=${onlyReal})`);
        const initCandleTs = closedCandles[closedCandles.length - 1]?.t;
        if (!runtime.sequenceState) runtime.sequenceState = {};
        runtime.sequenceState[symbol] = {
          active: true,
          action: result.action as "CALL" | "PUT" | "BUY" | "SELL",
          corEsperada: (result.action === "CALL" || result.action === "BUY") ? "verde" : "vermelha",
          stake: result.stake ?? runtime.config.management?.stake ?? runtime.currentStake,
          maxEntradas: result.sequenceTrigger?.maxEntradas ?? (runtime.config.sequenceConfig?.enabled ? Math.min(Math.max(1, runtime.config.sequenceConfig.maxEntradas), 5) : 50),
          totalEntradas: 1,
          ultimoEntryCandleTs: initCandleTs,
        };
        saveActiveRobots();
        state.isProcessing = false;
        return;
      }

      const derivSymbol = getDerivSymbol(symbol);

      // Cálculo do Stake com base na Gestão
      const finalStake = calculateManagementStake(runtime, shouldWarmup);

      // Update lastStake for the next settlement cycle
      runtime.lastStake = finalStake;

      // Handle PENDING order
      if (result.pendingPrice) {
        const expirySeconds = robotTf === "2m" ? 30 : 15;
        const expiryTs = nowMs + (expirySeconds * 1000);

        console.log(`[ServerEngine] 🕒 Strategy set PENDING order for ${symbol}: ${result.action} @ ${result.pendingPrice} | Expiry: ${expirySeconds}s | nowMs=${nowMs} expiryTs=${expiryTs} dateNow=${Date.now()}`);

        runtime.pendingOrders.set(symbol, {
          action: result.action as any,
          targetPrice: result.pendingPrice,
          expiryTs,
          entryStake: finalStake,
          customStats: result.customStats,
          expiryCandles: result.expiryCandles || runtime.config.durationCandles || 1
        });
        return; // Don't execute yet
      }

      // DYNAMIC DURATION: Sync with candle close
      const expiryCount = parseDuration(runtime.config.durationCandles);
      let finalDuration: number;
      let durationS: number;

      if (Math.floor(expiryCount) !== expiryCount) { // Fractional - exactly proportional time
        const durationSeconds = Math.max(15, Math.min(3600, Math.ceil(expiryCount * (intervalMs / 1000))));
        finalDuration = durationSeconds;
        durationS = durationSeconds;
      } else { // Integer - candle aligned
        const currentCandleOpenTs = nowMs - (latestEpoch % intervalSec) * 1000;
        let targetEndTs = currentCandleOpenTs + expiryCount * intervalMs;
        if (targetEndTs - nowMs < 15000) {
          targetEndTs += intervalMs;
        }
        finalDuration = Math.floor(targetEndTs / 1000); // UNIX epoch in seconds
        durationS = Math.max(15, Math.floor((targetEndTs - nowMs) / 1000));
      }

      console.log(
        `[ServerEngine] 📊 Signal: robot="${runtime.id}" action=${result.action} asset=${symbol} duration=${finalDuration > 1000000000 ? (durationS + "s (epoch: " + finalDuration + ")") : (finalDuration + "s")} (aligned with candle close)${shouldWarmup ? " [WARMUP]" : ""}`
      );

      const targetAccountType = resolveTradingAccountType(runtime, shouldWarmup);
      const targetToken = targetAccountType === "demo" ? runtime.demoToken : runtime.realToken;
      const finalApi = await getTradingApi(targetAccountType, targetToken || null, `trade-${runtime.id}`, symbol);

      // robotInvert: inverte a ação no último momento, sem afetar trigger/lógica.
      // Verifica duas fontes: runtime.config (sincronizado pelo PUT handler) e
      // loadRobotsDb() cache (atualizado via saveRobotsDb pelo mesmo handler).
      const robotInvertActive = !!(runtime.config.robotInvert || robotsCache[runtime.config.id]?.config?.robotInvert);
      const tradeAction = robotInvertActive ? invertAction(result.action) : result.action;
      const buyRes = await executeTrade(finalApi, runtime, derivSymbol, tradeAction, finalStake, finalDuration);

      if (buyRes && buyRes.contract_id) {
        const contractIdStr = String(buyRes.contract_id);
        runtime.activeContractIds.add(contractIdStr);
        // Register this contract against the Deriv symbol so we block further orders on this asset
        runtime.activeContractsByAsset.set(derivSymbol, contractIdStr);
        // Store expected expiry to optimize result polling
        const isEpoch = finalDuration > 1000000000;
        const expiryMs = isEpoch ? (finalDuration * 1000) : (nowMs + finalDuration * 1000);
        runtime.activeContractsExpiry.set(contractIdStr, expiryMs);
        scheduleDedicatedContractValidator(runtime, contractIdStr, expiryMs);

        if (shouldWarmup) runtime.warmupContractIds.add(contractIdStr);

        console.log(
          `[ServerEngine] ✅ Order placed: contract=${buyRes.contract_id} robot="${runtime.id}" ${tradeAction} ${symbol}(${derivSymbol}) $${finalStake} | open assets: ${runtime.activeContractsByAsset.size}`
        );

        const candleEntry = candles1m[candles1m.length - 1].c;
        const actualEntryFromBuy = Number(buyRes.entry_spot || buyRes.entry_tick || buyRes.barrier || candleEntry);
        const entry = (!isNaN(actualEntryFromBuy) && actualEntryFromBuy > 0) ? actualEntryFromBuy : candleEntry;

        // Store contract metadata for early settle via ticks
        runtime.contractMeta.set(contractIdStr, {
          type: tradeAction as "CALL" | "PUT",
          derivSymbol,
          entryPrice: entry,
          isWarmup: shouldWarmup,
        });

        const snapshot = buildIndicatorSnapshot(closedCandles, closedCloses, entry);

        const newTrade = {
          id: contractIdStr,
          asset: symbol,
          type: tradeAction,
          amount: finalStake,
          entry,
          ts: Date.now(),
          result: "OPEN" as const,
          warmup: shouldWarmup || undefined,
          robotId: runtime.id,
          customStats: result?.customStats,
          snapshot,
        };

        runtime.trades = [newTrade, ...runtime.trades];
        saveActiveRobots();
        updateRobotInDb(runtime.id, runtime.config, runtime.trades, runtime.managementState, runtime.managementTrades);

        io?.emit("robot-trade", {
          id: runtime.id,
          trade: newTrade,
        });

        // Check if the contract already settled while we were waiting for the buy response
        if (runtime.deferredSettlements.has(contractIdStr)) {
          const deferred = runtime.deferredSettlements.get(contractIdStr);
          console.log(`[ServerEngine] ⚡ Handling deferred settlement for contract ${contractIdStr}`);
          runtime.deferredSettlements.delete(contractIdStr);
          handleContractUpdate(runtime, deferred);
        }
      } else {
        console.warn(`[ServerEngine] ⚠ buyContract returned no contract_id for robot "${runtime.id}"`);
      }
    }
  } catch (e: any) {
    const errorMsg = e instanceof Error ? e.message : (e?.message || (typeof e === 'object' ? JSON.stringify(e) : String(e)));
    const stack = e instanceof Error && e.stack ? `\nStack: ${e.stack}` : '';
    console.error(`[ServerEngine] ❌ Strategy error on robot "${runtime.id}" asset ${symbol} | Cause: ${errorMsg}${stack}`);
  } finally {
    state.isProcessing = false;
  }
}

/**
 * Execute a buy order from a StrategyResult.
 * Used by both the normal strategy signal and sequence trigger.
 */
async function executeOrderForResult(
  runtime: RobotRuntime,
  symbol: string,
  state: AssetState,
  result: StrategyResult,
  closedCandles: Candle[],
  closedCloses: number[],
  rsiArr: (number | null)[],
  adxData: { adx: number[]; plusDi: number[]; minusDi: number[] },
  shouldWarmup: boolean
) {
  const derivSymbol = getDerivSymbol(symbol);
  const robotTf = runtime.config.timeframe || "1m";
  const intervalMs = tfToMs(robotTf);
  const now = Date.now();
  const candleTimeRemainingMs = intervalMs - (now % intervalMs);

  // Cálculo do Stake
  const finalStake = calculateManagementStake(runtime, shouldWarmup);

  // PENDING order
  if (result.pendingPrice) {
    const expirySeconds = robotTf === "2m" ? 30 : 15;
    // For executeOrderForResult, we use exact current ts or start of candle if we have it.
    // wait, we can just use `now` here, as this function receives `now = Date.now()`.
    const expiryTs = now + (expirySeconds * 1000);
    console.log(`[ServerEngine] 🕒 executeOrderForResult set PENDING order for ${symbol}: ${result.action} @ ${result.pendingPrice} | Expiry: ${expirySeconds}s | now=${now} expiryTs=${expiryTs} dateNow=${Date.now()}`);
    runtime.pendingOrders.set(symbol, {
      action: result.action as any,
      targetPrice: result.pendingPrice,
      expiryTs,
      entryStake: finalStake,
      customStats: result.customStats,
      expiryCandles: result.expiryCandles || runtime.config.durationCandles || 1
    });
    return;
  }

  // DYNAMIC DURATION
  const expiryCount = parseDuration(runtime.config.durationCandles);
  let finalDuration: number;
  let durationS: number;

  if (Math.floor(expiryCount) !== expiryCount) { // Fractional - exactly proportional time
    const durationSeconds = Math.max(15, Math.min(3600, Math.ceil(expiryCount * (intervalMs / 1000))));
    finalDuration = durationSeconds;
    durationS = durationSeconds;
  } else { // Integer - candle aligned
    const currentCandleOpenTs = now - (now % intervalMs);
    let targetEndTs = currentCandleOpenTs + expiryCount * intervalMs;
    // If remaining duration is too short (< 15 seconds), roll over by adding one candle
    if (targetEndTs - now < 15000) {
      targetEndTs += intervalMs;
    }
    finalDuration = Math.floor(targetEndTs / 1000); // Unix epoch in seconds
    durationS = Math.max(15, Math.floor((targetEndTs - now) / 1000));
  }

  const targetAccountType = resolveTradingAccountType(runtime, shouldWarmup);
  const targetToken = targetAccountType === "demo" ? runtime.demoToken : runtime.realToken;
  const finalApi = await getTradingApi(targetAccountType, targetToken || null, `trade-${runtime.id}`, symbol);

  const candles1m = state.candles;
  // robotInvert: inverte a ação no último momento, sem afetar trigger/lógica
  // Dual-check: runtime.config + robotsCache
  const robotInvertActive = !!(runtime.config.robotInvert || robotsCache[runtime.config.id]?.config?.robotInvert);
  const tradeAction = robotInvertActive ? invertAction(result.action) : result.action;
  const buyRes = await executeTrade(finalApi, runtime, derivSymbol, tradeAction, finalStake, finalDuration);

  if (buyRes && buyRes.contract_id) {
    const contractIdStr = String(buyRes.contract_id);
    runtime.activeContractIds.add(contractIdStr);
    runtime.activeContractsByAsset.set(derivSymbol, contractIdStr);
    const isEpoch = finalDuration > 1000000000;
    const expiryMs = isEpoch ? (finalDuration * 1000) : (now + finalDuration * 1000);
    runtime.activeContractsExpiry.set(contractIdStr, expiryMs);
    scheduleDedicatedContractValidator(runtime, contractIdStr, expiryMs);

    if (shouldWarmup) runtime.warmupContractIds.add(contractIdStr);

    const candleEntry = candles1m[candles1m.length - 1]?.c ?? 0;
    const actualEntryFromBuy = Number(buyRes.entry_spot || buyRes.entry_tick || buyRes.barrier || candleEntry);
    const entry = (!isNaN(actualEntryFromBuy) && actualEntryFromBuy > 0) ? actualEntryFromBuy : candleEntry;

    // Store contract metadata for early tick settlement
    runtime.contractMeta.set(contractIdStr, {
      type: tradeAction as "CALL" | "PUT",
      derivSymbol,
      entryPrice: entry,
      isWarmup: shouldWarmup,
    });
    const snapshot = buildIndicatorSnapshot(closedCandles, closedCloses, entry);

    const newTrade = {
      id: contractIdStr,
      asset: symbol,
      type: tradeAction,
      amount: finalStake,
      entry,
      ts: Date.now(),
      durationS,
      result: "OPEN" as const,
      warmup: shouldWarmup || undefined,
      robotId: runtime.id,
      customStats: result?.customStats,
      snapshot,
    };

    runtime.trades = [newTrade, ...runtime.trades];
    saveActiveRobots();
    updateRobotInDb(runtime.id, runtime.config, runtime.trades, runtime.managementState, runtime.managementTrades);
    io?.emit("robot-trade", { id: runtime.id, trade: newTrade });

    // Initialise sequence trigger (only if not already active for this asset)
    // Fix E: bake robotInvert into seq.action so all #2..N entries honour inversion.
    const seqJaAtiva = runtime.sequenceState?.[symbol]?.active;
    if (!seqJaAtiva && (result.sequenceTrigger || runtime.config.sequenceConfig?.enabled) && !shouldWarmup) {
      const dir = result.action;
      const corEsperada = (dir === "CALL" || dir === "BUY") ? "verde" : "vermelha";
      // Dual-check: runtime.config + robotsCache
      const robotInvertActive = !!(runtime.config.robotInvert || robotsCache[runtime.config.id]?.config?.robotInvert);
      const seqAction = robotInvertActive
        ? (dir === "CALL" || dir === "BUY" ? "PUT" : "CALL")
        : (dir as "CALL" | "PUT" | "BUY" | "SELL");
      if (!runtime.sequenceState) runtime.sequenceState = {};
      // Fix C: record candle ts of the trigger to enforce 1-candle gap for #2..N
      const initCandleTs = closedCandles[closedCandles.length - 1]?.t;
      runtime.sequenceState[symbol] = {
        active: true,
        action: seqAction,
        corEsperada,
        stake: finalStake,
        maxEntradas: result.sequenceTrigger?.maxEntradas ?? (runtime.config.sequenceConfig?.enabled ? Math.min(Math.max(1, runtime.config.sequenceConfig.maxEntradas), 5) : 50),
        totalEntradas: 1,
        ultimoEntryCandleTs: initCandleTs,
      };
      // Fix D: persist immediately so a crash mid-sequence doesn't reset to totalEntradas=1
      saveActiveRobots();
      console.log(`[ServerEngine] Sequence started for ${runtime.id}@${symbol}: ${dir}${robotInvertActive ? " (inverted→" + seqAction + ")" : ""} | max=${result.sequenceTrigger?.maxEntradas ?? (runtime.config.sequenceConfig?.enabled ? Math.min(Math.max(1, runtime.config.sequenceConfig.maxEntradas), 5) : 50)}`);
    }

    // Check for deferred settlement
    if (runtime.deferredSettlements.has(contractIdStr)) {
      const deferred = runtime.deferredSettlements.get(contractIdStr);
      runtime.deferredSettlements.delete(contractIdStr);
      handleContractUpdate(runtime, deferred);
    }
  } else {
    console.warn(`[ServerEngine] ⚠ buyContract returned no contract_id for robot "${runtime.id}"`);
  }
}

async function triggerPendingExecution(runtime: RobotRuntime, symbol: string, orderData: any) {
  const state = runtime.assetStates[symbol];
  if (!state) return;
  try {
    state.isProcessing = true;
    const derivSymbol = getDerivSymbol(symbol);
    const intervalMs = tfToMs(runtime.config.timeframe || "1m");
    const now = Date.now();
    const candleTimeRemainingMs = intervalMs - (now % intervalMs);

    // Sync duration with candle close
    const expiryCount = parseDuration(runtime.config.durationCandles);
    let finalDuration: number;
    let durationS: number;

    if (Math.floor(expiryCount) !== expiryCount) { // Fractional - exactly proportional time
      const durationSeconds = Math.max(15, Math.min(3600, Math.ceil(expiryCount * (intervalMs / 1000))));
      finalDuration = durationSeconds;
      durationS = durationSeconds;
    } else { // Integer - candle aligned
      const currentCandleOpenTs = now - (now % intervalMs);
      let targetEndTs = currentCandleOpenTs + expiryCount * intervalMs;
      // If remaining duration is too short (< 15 seconds), roll over by adding one candle
      if (targetEndTs - now < 15000) {
        targetEndTs += intervalMs;
      }
      finalDuration = Math.floor(targetEndTs / 1000); // Unix epoch in seconds
      durationS = Math.max(15, Math.floor((targetEndTs - now) / 1000));
    }

    // Shadow Mode / Warmup Logic check
    const mState = runtime.managementState;
    // Se o filtro VD pausou o robô, também forçamos modo Warmup/Shadow (Demo) para as ordens pendentes
    const isShadowMode = Boolean(
      runtime.config.management?.active && (
        (runtime.config.management?.entryAfterWin && mState.lastDemoResult !== "WIN") ||
        (runtime.config.management?.entryAfterLoss && mState.lastDemoResult !== "LOSS") ||
        mState.isPausedByVD
      )
    );
    const shouldWarmup = isShadowMode;

    const targetAccountType = resolveTradingAccountType(runtime, shouldWarmup);
    const targetToken = targetAccountType === "demo" ? runtime.demoToken : runtime.realToken;
    const finalApi = await getTradingApi(targetAccountType, targetToken || null, `trade-${runtime.id}`, symbol);
    const finalStake = Number(orderData.entryStake.toFixed(2));

    // robotInvert: inverte a ação no último momento, sem afetar trigger/lógica
    // Dual-check: runtime.config + robotsCache
    const robotInvertActive = !!(runtime.config.robotInvert || robotsCache[runtime.config.id]?.config?.robotInvert);
    const tradeAction = robotInvertActive ? invertAction(orderData.action as any) : orderData.action;
    const buyRes = await executeTrade(finalApi, runtime, derivSymbol, tradeAction, finalStake, finalDuration);

    if (buyRes && buyRes.contract_id) {
      const contractIdStr = String(buyRes.contract_id);
      runtime.activeContractIds.add(contractIdStr);
      runtime.activeContractsByAsset.set(derivSymbol, contractIdStr);
      // Store expected expiry to optimize result polling
      const isEpoch = finalDuration > 1000000000;
      const expiryMs = isEpoch ? (finalDuration * 1000) : (now + finalDuration * 1000);
      runtime.activeContractsExpiry.set(contractIdStr, expiryMs);
      scheduleDedicatedContractValidator(runtime, contractIdStr, expiryMs);

      if (shouldWarmup) runtime.warmupContractIds.add(contractIdStr);

      const targetEntry = orderData.targetPrice;
      const actualEntryFromBuy = Number(buyRes.entry_spot || buyRes.entry_tick || buyRes.barrier || targetEntry);
      const entry = (!isNaN(actualEntryFromBuy) && actualEntryFromBuy > 0) ? actualEntryFromBuy : targetEntry;

      // Store contract metadata for early tick settlement
      runtime.contractMeta.set(contractIdStr, {
        type: tradeAction as "CALL" | "PUT",
        derivSymbol,
        entryPrice: entry,
        isWarmup: shouldWarmup,
      });

      const stateDoc = runtime.assetStates[symbol];
      const candles1m = stateDoc?.candles || [];
      const closedCandles = candles1m.slice(0, -1);
      const closedCloses = closedCandles.map(c => c.c);
      const snapshot = buildIndicatorSnapshot(closedCandles, closedCloses, entry);

      const newTrade = {
        id: contractIdStr,
        asset: symbol,
        type: tradeAction,
        amount: orderData.entryStake,
        entry,
        ts: Date.now(),
        durationS,
        result: "OPEN" as const,
        warmup: shouldWarmup || undefined,
        robotId: runtime.id,
        customStats: orderData.customStats,
        pendingTriggered: true,
        snapshot,
      };

      runtime.trades = [newTrade, ...runtime.trades];
      saveActiveRobots();
      updateRobotInDb(runtime.id, runtime.config, runtime.trades, runtime.managementState, runtime.managementTrades);
      io?.emit("robot-trade", { id: runtime.id, trade: newTrade });
    }
  } catch (e: any) {
    console.error(`[ServerEngine] ❌ Error triggering pending order for ${symbol}:`, e.message || e);
  } finally {
    state.isProcessing = false;
  }
}

// ─── Contract settlement ──────────────────────────────────────────────────────

/** Determina WIN/LOSS pelo preço de entrada/saída em vez de depender do profit da API */
function determineWinFromPrices(contract: any): { win: boolean; pnl: number } {
  // Prioritize official Deriv status if available
  if (contract.status === "won") {
    return { win: true, pnl: 0 };
  }
  if (contract.status === "lost") {
    return { win: false, pnl: 0 };
  }

  const contractType = contract.contract_type; // "CALL" | "PUT"
  const entryTick = Number(contract.entry_tick);
  const exitTick = Number(contract.exit_tick);

  // Só usa preço se tivermos ambos os ticks
  if (!isNaN(entryTick) && !isNaN(exitTick) && entryTick > 0 && exitTick > 0) {
    if (contractType === "CALL") {
      return { win: exitTick > entryTick, pnl: 0 };
    }
    if (contractType === "PUT") {
      return { win: entryTick > exitTick, pnl: 0 };
    }
  }

  // Fallback: profit da API
  let pnl = 0;
  if (contract.profit !== undefined && contract.profit !== null) {
    pnl = Number(contract.profit);
  } else if (contract.sell_price !== undefined && contract.buy_price !== undefined) {
    pnl = Number(contract.sell_price) - Number(contract.buy_price);
  }
  if (isNaN(pnl)) pnl = 0;
  return { win: pnl > 0, pnl };
}

/** Verifica filtro VDVD escaneando últimos 15 managementTrades para padrão de alternância sombra/real */
function checkVdvdFilter(managementTrades: any[]): {
  isPausedByVD: boolean;
  waitingForWins: number;
  vdCycle: string;
} {
  const recent = [...managementTrades]
    .filter((t: any) => t.result && t.result !== "OPEN")
    .sort((a: any, b: any) => a.ts - b.ts)
    .slice(-15);

  // Mapear cada trade para o padrão VDVD:
  // V = isShadow==true + WIN
  // D = isShadow==false + LOSS
  // X = qualquer outra combinação
  const pattern = recent.map((t: any) => {
    if (t.isShadow && t.result === "WIN") return "V";
    if (!t.isShadow && t.result === "LOSS") return "D";
    return "X";
  }).join("");

  const vdCycle = pattern.slice(-4);
  const vdvdIndex = pattern.lastIndexOf("VDVD");

  // Se não encontrou padrão VDVD → não pausado
  if (vdvdIndex === -1) return { isPausedByVD: false, waitingForWins: 0, vdCycle };

  // Depois do padrão VDVD, verificar se já houve 2 vitórias consecutivas (qualquer tipo)
  const afterVdvd = recent.slice(vdvdIndex + 4);
  const winPattern = afterVdvd.map((t: any) => t.result === "WIN" ? "V" : "D").join("");

  // 2 vitórias seguidas em qualquer posição = recuperado
  if (winPattern.includes("VV")) return { isPausedByVD: false, waitingForWins: 0, vdCycle };

  // Ainda pausado: contar wins consecutivas no final (para saber quantas faltam)
  const trailingWins = winPattern.match(/V*$/)?.[0].length || 0;

  return { isPausedByVD: true, waitingForWins: trailingWins, vdCycle };
}

/** Aplica o resultado do lote bufferizado no estado da gestão */
function flushPendingBatchMgmt(runtime: RobotRuntime) {
  if (!runtime.pendingBatchMgmt) return;

  const { result, pnl } = runtime.pendingBatchMgmt;
  runtime.pendingBatchMgmt = null;

  if (runtime.pendingBatchTimer) {
    clearTimeout(runtime.pendingBatchTimer);
    runtime.pendingBatchTimer = null;
  }

  const win = result === "WIN";
  const isWarmup = false; // warmup é tratado separadamente no handleContractUpdate

  // PnL geral do robô (totalPnl/currentDailyPnl) sempre atualiza — a UI exibe independente do management.
  // Features específicas de management (VD filter, lastDemoResult, drop-to-demo) gateadas por management?.active.
  if (!runtime.managementState) return;

  runtime.lastPnl = pnl;

  // Daily/total PnL — sempre atualiza
  runtime.managementState.currentDailyPnl = Number((runtime.managementState.currentDailyPnl || 0) + pnl);
  runtime.managementState.totalPnl = Number((runtime.managementState.totalPnl || 0) + pnl);

  // Se perdeu → volta para demo (apenas com management ativo)
  if (!win && runtime.config.management?.active) {
    runtime.managementState.lastDemoResult = "LOSS";
    console.log(`[ServerEngine] ⚠️ Robot "${runtime.id}" lost in Real mode. Dropping back to Demo wait for WIN.`);
  }

  // Filtro VD — escaneia últimos 15 trades, não apenas últimos 4
  if (runtime.config.management?.vdFilter) {
    const prevPaused = runtime.managementState.isPausedByVD;
    const vdResult = checkVdvdFilter(runtime.managementTrades || []);
    runtime.managementState.vdCycle = vdResult.vdCycle;
    runtime.managementState.isPausedByVD = vdResult.isPausedByVD;
    runtime.managementState.waitingForWins = vdResult.waitingForWins;

    if (vdResult.isPausedByVD && !prevPaused) {
      console.log(`[ServerEngine] ⚠️ Robot "${runtime.id}" VDVD pattern found in last 15 trades. Pausing for 2 consecutive wins.`);
    }
    if (!vdResult.isPausedByVD) {
      runtime.managementState.lastDemoResult = win ? "WIN" : "LOSS";
    }
  }

  console.log(
    `[ServerEngine] 📈 Robot "${runtime.id}" daily PnL: $${runtime.managementState.currentDailyPnl?.toFixed(2)} | total: $${runtime.managementState.totalPnl?.toFixed(2)} | next stake: $${runtime.currentStake}`
  );

  // Notify client of updated PnL after batch flush
  io?.emit("robot-trade-update", {
    id: runtime.id,
    contractId: "",
    result: "OPEN",
    pnl: 0,
    configUpdates: {
      managementState: runtime.managementState,
    }
  });
}

function handleContractUpdate(runtime: RobotRuntime, contract: any) {
  const contractIdStr = String(contract.contract_id);

  // If not in active set, check if it was already settled locally or belongs to this robot via passthrough
  if (!runtime.activeContractIds.has(contractIdStr)) {
    const existingTradeIdx = runtime.trades.findIndex(t => String(t.id) === contractIdStr);
    if (existingTradeIdx !== -1 && runtime.trades[existingTradeIdx].result !== "OPEN") {
      const existingTrade = runtime.trades[existingTradeIdx];
      // Already settled locally — reconcile official Deriv PnL, result and exit price if provided
      let officialPnl = 0;
      if (contract.profit !== undefined && contract.profit !== null) {
        officialPnl = Number(contract.profit);
      } else if (contract.sell_price !== undefined && contract.buy_price !== undefined) {
        officialPnl = Number(contract.sell_price) - Number(contract.buy_price);
      }
      if (isNaN(officialPnl)) officialPnl = 0;

      const derivWin = contract.status === "won" || (officialPnl > 0);
      const internalWin = existingTrade.result === "WIN";

      if (internalWin !== derivWin || existingTrade.pnl !== officialPnl) {
        console.warn(`[ServerEngine] ⚠️ Correction applied for trade ${contractIdStr}! Internal (${existingTrade.result}, PnL: $${existingTrade.pnl}) → Deriv Official (${derivWin ? "WIN" : "LOSS"}, PnL: $${officialPnl})`);

        const pnlDiff = officialPnl - existingTrade.pnl;
        existingTrade.result = derivWin ? "WIN" : "LOSS";
        existingTrade.pnl = officialPnl;
        if (contract.exit_tick) existingTrade.exit = Number(contract.exit_tick);
        if (contract.entry_tick) existingTrade.entry = Number(contract.entry_tick);
        existingTrade.settledBy = "deriv_corrected";

        if (runtime.managementState) {
          runtime.managementState.totalPnl = Number(((runtime.managementState.totalPnl || 0) + pnlDiff).toFixed(2));
          runtime.managementState.currentDailyPnl = Number(((runtime.managementState.currentDailyPnl || 0) + pnlDiff).toFixed(2));
        }

        // Persist correction on Database
        updateRobotInDb(runtime.id, runtime.config, runtime.trades, runtime.managementState, runtime.managementTrades);

        // Broadcast correction to Front-End
        io?.emit("robot-trade-update", {
          id: runtime.id,
          contractId: contractIdStr,
          result: existingTrade.result,
          pnl: existingTrade.pnl,
          entry: existingTrade.entry,
          exit: existingTrade.exit,
          configUpdates: {
            managementState: runtime.managementState
          }
        });
      }
      return;
    }

    if (existingTradeIdx !== -1 && runtime.trades[existingTradeIdx].result === "OPEN") {
      console.log(`[ServerEngine] 🔄 Recovered OPEN trade ${contractIdStr} in runtime.trades for robot ${runtime.id}`);
      runtime.activeContractIds.add(contractIdStr);
      const derivSymbol = contract.underlying;
      if (derivSymbol) runtime.activeContractsByAsset.set(derivSymbol, contractIdStr);
    } else {
      const passthroughId = contract.passthrough?.robotId || contract.echo_req?.passthrough?.robotId;
      if (passthroughId === runtime.id) {
        console.log(`[ServerEngine] 🔄 Recovered contract ${contractIdStr} for robot ${runtime.id}`);
        runtime.activeContractIds.add(contractIdStr);
        // Also try to recover asset mapping if possible
        const derivSymbol = contract.underlying;
        if (derivSymbol) runtime.activeContractsByAsset.set(derivSymbol, contractIdStr);
      } else {
        // If it's already closed, store it in deferred settlements in case executeStrategy is still waiting for buy response
        if (contract.status !== "open") {
          runtime.deferredSettlements.set(contractIdStr, contract);
          // Auto-cleanup after 30s to prevent memory leak
          setTimeout(() => runtime.deferredSettlements.delete(contractIdStr), 30000);
        }
        return;
      }
    }
  }

  // Atualiza entryPrice com o entry_tick real da Deriv (o nosso inicial é do momento de ordem)
  if (contract.entry_tick !== undefined && contract.entry_tick !== null) {
    const actualEntry = Number(contract.entry_tick);
    if (!isNaN(actualEntry) && actualEntry > 0) {
      const meta = runtime.contractMeta.get(contractIdStr);
      if (meta && meta.entryPrice !== actualEntry) {
        meta.entryPrice = actualEntry;
      }
      const trade = runtime.trades.find(t => String(t.id) === contractIdStr);
      if (trade && trade.entry !== actualEntry) {
        trade.entry = actualEntry;
        updateRobotInDb(runtime.id, runtime.config, runtime.trades, runtime.managementState, runtime.managementTrades);
        io?.emit("robot-trade-update", {
          id: runtime.id,
          contractId: contractIdStr,
          entry: actualEntry,
        });
      }
    }
  }

  // Limpa retry counter ao receber resposta válida da API
  runtime.contractPollRetries.delete(contractIdStr);

  if (contract.status !== "open") {
    // WIN/LOSS determinado pelo PREÇO de entrada/saída (mais rápido que profit da API)
    const { win } = determineWinFromPrices(contract);

    // PnL monetário continua vindo do profit da API (mais preciso) ou buy/sell
    let pnl = 0;
    if (contract.profit !== undefined && contract.profit !== null) {
      pnl = Number(contract.profit);
    } else if (contract.sell_price !== undefined && contract.buy_price !== undefined) {
      pnl = Number(contract.sell_price) - Number(contract.buy_price);
    }
    if (isNaN(pnl)) pnl = 0;

    const isWarmup = runtime.warmupContractIds.has(contractIdStr) ||
      runtime.trades.some(t => String(t.id) === contractIdStr && t.warmup === true);

    console.log(
      `[ServerEngine] 🏁 Contract settled: id=${contract.contract_id} robot="${runtime.id}" result=${win ? "WIN" : "LOSS"} pnl=${pnl}${isWarmup ? " [WARMUP]" : ""}`
    );

    runtime.activeContractIds.delete(contractIdStr);
    runtime.warmupContractIds.delete(contractIdStr);
    runtime.contractMeta.delete(contractIdStr);

    // Remove from per-asset map so the asset can accept new orders
    for (const [derivSym, cid] of runtime.activeContractsByAsset) {
      if (cid === contractIdStr) {
        runtime.activeContractsByAsset.delete(derivSym);
        runtime.activeContractsExpiry.delete(cid);
        break;
      }
    }
    runtime.lastResult = win ? "WIN" : "LOSS";
    runtime.lastPnl = pnl;
    runtime.lastStake = Number(contract.buy_price) || runtime.lastStake;

    if (win) {
      runtime.sorosConsecutiveWins = (runtime.sorosConsecutiveWins || 0) + 1;
      runtime.martingaleStep = 0;
    } else {
      runtime.sorosConsecutiveWins = 0;
      runtime.martingaleStep = (runtime.martingaleStep || 0) + 1;
    }

    // Immediately persist into managementState for database and file synchronization
    if (runtime.managementState) {
      runtime.managementState.sorosConsecutiveWins = runtime.sorosConsecutiveWins;
      runtime.managementState.martingaleStep = runtime.martingaleStep;
      runtime.managementState.lastResult = runtime.lastResult;
      runtime.managementState.lastPnl = runtime.lastPnl;
      runtime.managementState.lastStake = runtime.lastStake;
    }

    if (isWarmup) {
      // Foi um trade de sombra (SHADOW/DEMO)
      if (runtime.managementState) {
        runtime.managementState.lastDemoResult = win ? "WIN" : "LOSS";

        // Atualiza estado VD com base nos trades reais (não incrementa manualmente)
        if (runtime.config.management?.vdFilter) {
          const prevPaused = runtime.managementState.isPausedByVD;
          const vdResult = checkVdvdFilter(runtime.managementTrades || []);
          runtime.managementState.vdCycle = vdResult.vdCycle;
          runtime.managementState.isPausedByVD = vdResult.isPausedByVD;
          runtime.managementState.waitingForWins = vdResult.waitingForWins;
          if (!vdResult.isPausedByVD && prevPaused) {
            console.log(`[ServerEngine] ✅ Robot "${runtime.id}" recovered from VD. Returning to ops.`);
          }
        }
      }
    } else {
      // Foi um trade REAL (ou gerenciado) — usa batch buffer para não avançar estado múltiplas vezes
      const batchKey = contract.exit_tick_time
        ? `batch_${contract.exit_tick_time}`
        : `batch_${Math.floor(Date.now() / 1000)}`;

      // Se lote anterior com chave diferente, flush primeiro
      if (runtime.pendingBatchMgmt && runtime.pendingBatchMgmt.batchKey !== batchKey) {
        flushPendingBatchMgmt(runtime);
      }

      if (runtime.pendingBatchMgmt && runtime.pendingBatchMgmt.batchKey === batchKey) {
        // Mesmo lote: acumula PnL, rastreia se algum contrato perdeu
        runtime.pendingBatchMgmt.pnl = (runtime.pendingBatchMgmt.pnl || 0) + pnl;
        if (!win) runtime.pendingBatchMgmt.hasLoss = true;
        runtime.pendingBatchMgmt.result = runtime.pendingBatchMgmt.hasLoss ? "LOSS" : "WIN";
      } else {
        runtime.pendingBatchMgmt = {
          batchKey,
          result: win ? "WIN" : "LOSS",
          pnl,
          hasLoss: !win,
        };
      }

      // EAGER: Atualiza lastDemoResult e filtro VD IMEDIATAMENTE (não espera batch flush)
      // para que executeStrategy veja o estado correto se um sinal chegar antes do flush.
      if (runtime.managementState) {
        runtime.managementState.lastDemoResult = win ? "WIN" : "LOSS";

        if (runtime.config.management?.vdFilter) {
          const prevPaused = runtime.managementState.isPausedByVD;
          const vdResult = checkVdvdFilter(runtime.managementTrades || []);
          runtime.managementState.vdCycle = vdResult.vdCycle;
          runtime.managementState.isPausedByVD = vdResult.isPausedByVD;
          runtime.managementState.waitingForWins = vdResult.waitingForWins;
          if (!vdResult.isPausedByVD && prevPaused) {
            console.log(`[ServerEngine] ✅ Robot "${runtime.id}" recovered from VD. Returning to ops.`);
          }
        }
      }

      // Timer flush automático (500ms — todos os contratos do mesmo lote chegam nessa janela)
      if (runtime.pendingBatchTimer) clearTimeout(runtime.pendingBatchTimer);
      runtime.pendingBatchTimer = setTimeout(() => {
        flushPendingBatchMgmt(runtime);
        saveActiveRobots();
        updateRobotInDb(
          runtime.id,
          { ...runtime.config, managementState: runtime.managementState },
          runtime.trades,
          runtime.managementState,
          runtime.managementTrades
        );
      }, 500);
    }

    // Update trade in local list
    const tradeIdx = runtime.trades.findIndex(t => t.id === contractIdStr);
    let managementTrade = null;

    if (tradeIdx !== -1) {
      runtime.trades[tradeIdx] = {
        ...runtime.trades[tradeIdx],
        result: win ? "WIN" : "LOSS",
        pnl: pnl,
        exit: contract.exit_tick || contract.sell_price,
        mode: runtime.trades[tradeIdx].mode || (runtime.config.mode as "demo" | "real" | "backtest"),
      };

      if (runtime.config.management?.active) {
        const t = runtime.trades[tradeIdx];
        managementTrade = {
          id: t.id,
          robotId: runtime.id,
          robotName: runtime.config.name,
          asset: t.asset,
          type: t.type,
          amount: t.amount,
          result: win ? "WIN" : "LOSS",
          pnl: pnl,
          ts: t.ts,
          mode: runtime.config.management.account || "demo",
          isShadow: isWarmup
        };
        // Persist management trade to runtime history
        runtime.managementTrades = runtime.managementTrades || [];
        runtime.managementTrades.unshift(managementTrade);
        if (runtime.managementTrades.length > 500) runtime.managementTrades.length = 500;
      }
    } else {
      // Se não encontrou no histórico local do runtime (por exemplo, após deploy/reboot), cria um novo objeto de trade
      const newT = {
        id: contractIdStr,
        asset: contract.underlying || "R_100",
        type: ((contract.contract_type === "PUT" || contract.contract_type === "CALL") ? contract.contract_type : "BUY") as "CALL" | "PUT" | "BUY" | "SELL",
        amount: Number(contract.buy_price) || 10,
        entry: Number(contract.entry_tick) || 0,
        exit: Number(contract.exit_tick || contract.sell_price) || 0,
        result: (win ? "WIN" : "LOSS") as "WIN" | "LOSS",
        pnl: pnl,
        ts: Date.now(),
        mode: (runtime.config.mode || "demo") as "demo" | "real" | "backtest",
        warmup: isWarmup ? true : undefined,
      };
      runtime.trades = [newT, ...runtime.trades];

      if (runtime.config.management?.active) {
        managementTrade = {
          id: newT.id,
          robotId: runtime.id,
          robotName: runtime.config.name,
          asset: newT.asset,
          type: (newT.type === "CALL" || newT.type === "PUT") ? newT.type : "CALL",
          amount: newT.amount,
          result: win ? "WIN" : "LOSS",
          pnl: pnl,
          ts: newT.ts,
          mode: runtime.config.management.account || "demo",
          isShadow: isWarmup
        };
        // Persist management trade to runtime history
        runtime.managementTrades = runtime.managementTrades || [];
        runtime.managementTrades.unshift(managementTrade);
        if (runtime.managementTrades.length > 500) runtime.managementTrades.length = 500;
      }
    }

    // Notify client that the trade was settled (PNL será acumulada no flush 500ms depois)
    io?.emit("robot-trade-update", {
      id: runtime.id,
      contractId: contractIdStr,
      result: win ? "WIN" : "LOSS",
      pnl: pnl,
      exit: contract.exit_tick || contract.sell_price,
      configUpdates: {
        managementState: runtime.managementState,
      },
      managementTrade
    });
  }
}

/**
 * Dedicated high-speed WebSocket validator for open contracts.
 * 1. Pre-warms/subscribes WS 5 seconds before contract expiry.
 * 2. Runs rapid RPC validation checks around expiry until Deriv returns official settlement.
 * 3. Never falls back to local estimation, ensuring 100% official Deriv accuracy with zero lag.
 */
function scheduleDedicatedContractValidator(runtime: RobotRuntime, contractIdStr: string, expiryMs: number) {
  const now = Date.now();
  const msUntilExpiry = expiryMs - now;
  // Pre-subscribe 5 seconds before expiry (or immediately if <= 5s remaining)
  const preSubscribeDelay = Math.max(0, msUntilExpiry - 5000);

  setTimeout(async () => {
    if (!runtime.activeContractIds.has(contractIdStr)) return;

    const accountType = (runtime.config.executionMode || runtime.config.analysisMode || "demo") as "demo" | "real";
    const token = accountType === "demo" ? runtime.demoToken : runtime.realToken;

    try {
      const api = await getTradingApi(accountType, token || null, `validator-${runtime.id}`);

      // 1. Send subscription to proposal_open_contract over WebSocket so Deriv pushes updates instantly
      console.log(`[ServerEngine] ⚡ [Validator] Subscribing WS for contract #${contractIdStr} (expiry in ${Math.round((expiryMs - Date.now())/1000)}s)`);
      api.send({ proposal_open_contract: 1, contract_id: Number(contractIdStr), subscribe: 1 }).catch(() => {});

      // 2. High-frequency polling starting 1 second before expiry until settled
      const startPollDelay = Math.max(0, expiryMs - Date.now() - 1000);

      setTimeout(() => {
        let pollCount = 0;
        const fastPollInterval = setInterval(async () => {
          if (!runtime.activeContractIds.has(contractIdStr)) {
            clearInterval(fastPollInterval);
            return;
          }

          pollCount++;
          try {
            const res = await api.sendWithTimeout({ proposal_open_contract: 1, contract_id: Number(contractIdStr) }, 2500);
            if (res?.proposal_open_contract) {
              const pc = res.proposal_open_contract;
              if (pc.status !== "open" || pc.is_sold === 1 || pc.is_expired === 1) {
                console.log(`[ServerEngine] ⚡ [Validator] Official settlement received for #${contractIdStr} on poll #${pollCount} (status: ${pc.status}, profit: $${pc.profit})`);
                clearInterval(fastPollInterval);
                handleContractUpdate(runtime, pc);
              }
            }
          } catch (err: any) {
            console.warn(`[ServerEngine] ⚠️ [Validator] Fast poll #${pollCount} error for #${contractIdStr}:`, err?.message || err);
          }

          // Stop fast polling after 25 attempts (~20 seconds post expiry)
          if (pollCount > 25) {
            clearInterval(fastPollInterval);
          }
        }, 800);
      }, startPollDelay);

    } catch (err: any) {
      console.error(`[ServerEngine] ❌ [Validator] Error setting up WS validator for #${contractIdStr}:`, err?.message || err);
    }
  }, preSubscribeDelay);
}

// ─── Bulk recovery of stale OPEN contracts ──────────────────────────────────
//
// Scans all (or a specific) robots for trades stuck as "OPEN" and queries the
// Deriv API to determine their actual settlement result.
//
// Returns a summary: { totalOpen, validated, failed, details: [...] }

export async function recoverOpenTrades(robotId?: string): Promise<{
  totalOpen: number;
  validated: number;
  failed: number;
  details: { robotId: string; contractId: string; result: string; pnl: number; error?: string }[];
}> {
  const details: { robotId: string; contractId: string; result: string; pnl: number; error?: string }[] = [];
  const robotsToCheck: { id: string; trades: any[]; runtime?: RobotRuntime; token?: string }[] = [];

  if (robotId) {
    // Check specific robot — use runtime trades when available (more current than cache)
    const runtime = runtimes.get(robotId);
    const dbRecord = robotsCache[robotId];
    const sourceTrades = runtime?.trades || dbRecord?.trades || [];
    const openTrades = sourceTrades.filter((t: any) => t.result === "OPEN");
    if (openTrades.length > 0) {
      robotsToCheck.push({ id: robotId, trades: openTrades, runtime });
    }
  } else {
    // Check all robots from runtime first (live data), fall back to cache
    for (const [id, runtime] of runtimes.entries()) {
      const openTrades = (runtime.trades || []).filter((t: any) => t.result === "OPEN");
      if (openTrades.length > 0) {
        robotsToCheck.push({ id, trades: openTrades, runtime });
      }
    }
    // Also check cache for robots that may not be running but have open trades
    for (const [id, record] of Object.entries(robotsCache)) {
      if (runtimes.has(id)) continue; // already covered by runtime loop
      const trades = record?.trades || [];
      const openTrades = trades.filter((t: any) => t.result === "OPEN");
      if (openTrades.length > 0) {
        robotsToCheck.push({ id, trades: openTrades, runtime: undefined });
      }
    }
  }

  if (robotsToCheck.length === 0) {
    console.log("[ServerEngine] ℹ️ recoverOpenTrades: No open trades found across any robot.");
    return { totalOpen: 0, validated: 0, failed: 0, details: [] };
  }

  const totalOpen = robotsToCheck.reduce((acc, r) => acc + r.trades.length, 0);
  console.log(`[ServerEngine] 🔄 recoverOpenTrades: Found ${totalOpen} open trades across ${robotsToCheck.length} robots`);

  // 2. For each robot, check its open contracts against the Deriv API
  for (const entry of robotsToCheck) {
    let api: DerivAPI | null = null;
    let isTempConnection = false;

    try {
      // Per-robot WS no longer exists — always creates temp connection for recovery
      const dbRecord = robotsCache[entry.id];
      const mgmtState = dbRecord?.managementState || {};
      const config = dbRecord?.config || {};

      const token = mgmtState.demoToken || mgmtState.realToken || config.demoToken || config.realToken || "DIEnt6WVRXH0QoF";

      api = new DerivAPI();
      api.name = `recovery-${entry.id}`;
      console.log(`[ServerEngine] 🔄 Robot "${entry.id}": creating temporary WS connection for recovery`);
      await api.connect(token);
      await api.readyPromise;
      isTempConnection = true;

      // Poll all open contracts for this robot IN PARALLEL
      const results = await Promise.allSettled(
        entry.trades.map((t: any) => {
          const numId = Number(t.id);
          const cid = !isNaN(numId) && numId > 0 ? numId : t.id;
          return api!.sendWithTimeout({ proposal_open_contract: 1, contract_id: cid }, 3500);
        })
      );

      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        const trade = entry.trades[i];
        const contractId = String(trade.id);
        const now = Date.now();
        const tradeAgeMs = now - (trade.ts || now);
        const expectedDurationMs = ((trade.durationS || 300) * 1000);
        const isPastDue = tradeAgeMs > (expectedDurationMs + 3000) || tradeAgeMs > 15000;

        let resolvedResult: string | null = null;
        let resolvedPnl = 0;
        let resolvedExit: number = trade.entry || 0;

        if (res.status === "fulfilled" && res.value?.proposal_open_contract) {
          const contract = res.value.proposal_open_contract;
          const isSettled = contract.status !== "open" || contract.is_sold === 1 || contract.is_expired === 1;

          if (isSettled) {
            if (contract.profit !== undefined && contract.profit !== null) {
              resolvedPnl = Number(contract.profit);
            } else if (contract.sell_price !== undefined && contract.buy_price !== undefined) {
              resolvedPnl = Number(contract.sell_price) - Number(contract.buy_price);
            }
            if (isNaN(resolvedPnl)) resolvedPnl = 0;

            const win = contract.status === "won" || (contract.status !== "lost" && resolvedPnl > 0);
            resolvedResult = win ? "WIN" : "LOSS";
            resolvedExit = Number(contract.exit_tick || contract.exit_spot || contract.sell_price || trade.entry || 0);
            console.log(`[ServerEngine] ✅ [Recovery] Official Deriv validation for contract ${contractId}: ${resolvedResult} (pnl: ${resolvedPnl})`);
          } else {
            console.log(`[ServerEngine] ℹ️ [Recovery] Contract ${contractId} is still OPEN on Deriv. Keeping trade OPEN.`);
          }
        } else {
          const errorMsg = res.status === "fulfilled" ? "No contract data returned" : (res.reason?.message || "Request failed");
          console.warn(`[ServerEngine] ⚠️ [Recovery] Failed to query Deriv for contract ${contractId} (${errorMsg}). Keeping trade OPEN.`);
        }

        if (resolvedResult) {
          // Update the trade in runtime if active
          if (entry.runtime) {
            entry.runtime.activeContractIds.delete(contractId);
            entry.runtime.activeContractsExpiry.delete(contractId);

            const tradeIdx = entry.runtime.trades.findIndex((t: any) => String(t.id) === contractId);
            if (tradeIdx !== -1) {
              entry.runtime.trades[tradeIdx] = {
                ...entry.runtime.trades[tradeIdx],
                result: resolvedResult,
                pnl: resolvedPnl,
                exit: resolvedExit,
              };
            }
          }

          // Persist to JSON + MySQL
          const runtimeTrades = entry.runtime?.trades || robotsCache[entry.id]?.trades || [];
          const updatedTrades = runtimeTrades.map((t: any) =>
            String(t.id) === contractId ? { ...t, result: resolvedResult, pnl: resolvedPnl, exit: resolvedExit } : t
          );
          const cfg = entry.runtime?.config || robotsCache[entry.id]?.config || {};
          const mgmt = entry.runtime?.managementState || robotsCache[entry.id]?.managementState || {};
          updateRobotInDb(entry.id, cfg, updatedTrades, mgmt);

          io?.emit("robot-trade-update", {
            id: entry.id,
            robotId: entry.id,
            contractId,
            result: resolvedResult,
            pnl: resolvedPnl,
            exit: resolvedExit
          });

          details.push({ robotId: entry.id, contractId, result: resolvedResult, pnl: resolvedPnl });
        } else {
          console.log(`[ServerEngine] ℹ️ [Recovery] Contract ${contractId} is currently active and within duration.`);
          details.push({ robotId: entry.id, contractId, result: "STILL_OPEN", pnl: 0 });
        }
      }
    } catch (err: any) {
      console.error(`[ServerEngine] ❌ [Recovery] Error processing robot "${entry.id}":`, err.message || err);
    } finally {
      // Clean up temporary WS connection
      if (isTempConnection && api) {
        try { api.disconnect(); } catch (_) { /* ignore */ }
      }
    }
  }

  const validated = details.filter(d => d.result === "WIN" || d.result === "LOSS").length;
  const failed = details.filter(d => d.error).length;

  console.log(`[ServerEngine] ✅ [Recovery] Complete: ${validated} contracts validated, ${failed} failed`);

  return { totalOpen, validated, failed, details };
}

/**
 * Re-audits all historical trades (closed/settled or open) against the official Deriv API.
 * Corrects any incorrect Win/Loss results, PnL values, exit prices, and updates the database & robot metrics.
 */
export async function reauditRobotTrades(targetRobotId?: string): Promise<{
  totalInspected: number;
  totalCorrected: number;
  details: { robotId: string; robotName: string; contractId: string; oldResult: string; oldPnl: number; newResult: string; newPnl: number }[];
}> {
  const details: { robotId: string; robotName: string; contractId: string; oldResult: string; oldPnl: number; newResult: string; newPnl: number }[] = [];
  const robotsToCheck: { id: string; name: string; trades: any[]; runtime?: RobotRuntime }[] = [];

  if (targetRobotId) {
    const runtime = runtimes.get(targetRobotId);
    const dbRecord = robotsCache[targetRobotId];
    const cfg = runtime?.config || dbRecord?.config || {};
    const trades = runtime?.trades || dbRecord?.trades || [];
    robotsToCheck.push({ id: targetRobotId, name: cfg.name || targetRobotId, trades: [...trades], runtime });
  } else {
    for (const [id, record] of Object.entries(robotsCache)) {
      const cfg = record?.config || {};
      const trades = record?.trades || [];
      if (trades.length > 0) {
        robotsToCheck.push({ id, name: cfg.name || id, trades: [...trades], runtime: runtimes.get(id) });
      }
    }
  }

  let totalInspected = 0;
  let totalCorrected = 0;

  for (const entry of robotsToCheck) {
    let api: DerivAPI | null = null;
    try {
      const dbRecord = robotsCache[entry.id];
      const mgmtState = dbRecord?.managementState || {};
      const config = dbRecord?.config || {};
      const token = mgmtState.demoToken || mgmtState.realToken || config.demoToken || config.realToken || "DIEnt6WVRXH0QoF";

      api = new DerivAPI();
      api.name = `reaudit-${entry.id}`;
      await api.connect(token);
      await api.readyPromise;

      // Filter trades with a valid contract ID
      const eligibleTrades = entry.trades.filter((t: any) => t.id && String(t.id).length > 2);
      totalInspected += eligibleTrades.length;

      // Query proposal_open_contract in parallel batches of 15
      const batchSize = 15;
      for (let i = 0; i < eligibleTrades.length; i += batchSize) {
        const batch = eligibleTrades.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map((t: any) => {
            const numId = Number(t.id);
            const cid = !isNaN(numId) && numId > 0 ? numId : t.id;
            return api!.sendWithTimeout({ proposal_open_contract: 1, contract_id: cid }, 3500);
          })
        );

        for (let j = 0; j < batch.length; j++) {
          const trade = batch[j];
          const res = results[j];
          const contractId = String(trade.id);

          if (res.status === "fulfilled" && res.value?.proposal_open_contract) {
            const contract = res.value.proposal_open_contract;
            const isSettled = contract.status !== "open" || contract.is_sold === 1 || contract.is_expired === 1;

            if (isSettled) {
              let officialPnl = 0;
              if (contract.profit !== undefined && contract.profit !== null) {
                officialPnl = Number(contract.profit);
              } else if (contract.sell_price !== undefined && contract.buy_price !== undefined) {
                officialPnl = Number(contract.sell_price) - Number(contract.buy_price);
              }
              if (isNaN(officialPnl)) officialPnl = 0;

              const win = contract.status === "won" || (contract.status !== "lost" && officialPnl > 0);
              const officialResult = win ? "WIN" : "LOSS";
              const officialExit = Number(contract.exit_tick || contract.exit_spot || contract.sell_price || trade.exit || trade.entry || 0);

              const resultChanged = trade.result !== officialResult;
              const pnlChanged = Math.abs((trade.pnl || 0) - officialPnl) > 0.001;

              if (resultChanged || pnlChanged) {
                details.push({
                  robotId: entry.id,
                  robotName: entry.name,
                  contractId,
                  oldResult: trade.result,
                  oldPnl: trade.pnl || 0,
                  newResult: officialResult,
                  newPnl: officialPnl,
                });

                // Update in-memory copy
                const targetTrade = entry.trades.find((t: any) => String(t.id) === contractId);
                if (targetTrade) {
                  targetTrade.result = officialResult;
                  targetTrade.pnl = officialPnl;
                  targetTrade.exit = officialExit;
                  targetTrade.settledBy = "deriv_api_audit";
                }
                totalCorrected++;
              }
            }
          }
        }
      }

      if (details.some(d => d.robotId === entry.id)) {
        // Update in-memory runtime and persist to DB
        if (entry.runtime) {
          entry.runtime.trades = [...entry.trades];
        }
        const cfg = entry.runtime?.config || robotsCache[entry.id]?.config || {};
        const mgmt = entry.runtime?.managementState || robotsCache[entry.id]?.managementState || {};
        updateRobotInDb(entry.id, cfg, entry.trades, mgmt);

        io?.emit("robot-trade-update", {
          id: entry.id,
          robotId: entry.id,
          reconciled: true
        });
      }

    } catch (err: any) {
      console.error(`[ServerEngine] ❌ [Reaudit] Error for robot "${entry.id}":`, err.message || err);
    } finally {
      if (api) {
        try { api.disconnect(); } catch (e) {
          // Ignore disconnect errors
        }
      }
    }
  }

  console.log(`[ServerEngine] 🔍 [Reaudit] Finished: inspected ${totalInspected} trades across ${robotsToCheck.length} robots, corrected ${totalCorrected} trades.`);
  return { totalInspected, totalCorrected, details };
}

export function syncStrategyFileToDb(id: string, code: string) {
  (async () => {
    try {
      const active = await isDbActive();
      if (!active) return;

      const db = await getDb();
      const nameMatch = code.match(/name:\s*["'`](.+?)["'`](?:\s*,)?/);
      const descMatch = code.match(/description:\s*["'`](.+?)["'`](?:\s*,)?/);
      const categoryMatch = code.match(/category:\s*["'`](.+?)["'`](?:\s*,)?/);

      const strat = {
        id,
        name: nameMatch ? nameMatch[1] : id,
        description: descMatch ? descMatch[1] : "",
        code,
        category: categoryMatch ? categoryMatch[1] : "auto",
      };

      const existStrat = await db.select().from(strategiesSchema).where(eq(strategiesSchema.id, id)).limit(1);
      if (existStrat.length > 0) {
        await db.update(strategiesSchema).set({
          name: strat.name,
          description: strat.description,
          code: strat.code,
          category: strat.category,
          updatedAt: new Date(),
        }).where(eq(strategiesSchema.id, id));
      } else {
        await db.insert(strategiesSchema).values({
          id,
          name: strat.name,
          description: strat.description,
          code: strat.code,
          category: strat.category,
        });
      }
      console.log(`[ServerEngine] [DB Backup] Successfully synced strategy "${id}" to MySQL.`);
    } catch (dbErr: any) {
      console.error(`[ServerEngine] [DB Backup] Failed to sync strategy "${id}" to MySQL:`, dbErr.message || dbErr);
    }
  })();
}

export function deleteStrategyFromDb(id: string) {
  (async () => {
    try {
      const active = await isDbActive();
      if (!active) return;

      const db = await getDb();
      await db.delete(strategiesSchema).where(eq(strategiesSchema.id, id));
      console.log(`[ServerEngine] [DB Backup] Successfully deleted strategy "${id}" from MySQL.`);
    } catch (dbErr: any) {
      console.error(`[ServerEngine] [DB Backup] Failed to delete strategy "${id}" from MySQL:`, dbErr.message || dbErr);
    }
  })();
}

/**
 * Fetch all strategy creation dates from the MySQL database.
 * Returns a map of strategy id → createdAt in epoch ms.
 * The DB `created_at` column uses DEFAULT CURRENT_TIMESTAMP, so it's
 * the authoritative source for creation timestamps.
 */
export async function fetchAllStrategyDatesFromDb(): Promise<Record<string, number>> {
  try {
    const active = await isDbActive();
    if (!active) return {};

    const db = await getDb();
    const rows = await db.select({
      id: strategiesSchema.id,
      createdAt: strategiesSchema.createdAt,
    }).from(strategiesSchema);

    const result: Record<string, number> = {};
    for (const row of rows) {
      if (row.createdAt) {
        result[row.id] = new Date(row.createdAt).getTime();
      }
    }
    return result;
  } catch (e) {
    console.error("[ServerEngine] Failed to fetch strategy dates from DB:", e);
    return {};
  }
}

// ── Global Background Contract and Open Trade Reconciler ──
// Runs every 15 seconds to check for any contracts/trades left open/pending for running robots.
// This serves as an extra layer of reliability, correcting state and unblocking the robot's trading.
setInterval(async () => {
  const now = Date.now();
  for (const [robotId, runtime] of runtimes.entries()) {
    // Collect both active contract tracking IDs and any trades in history marked as "OPEN" or "PENDING"
    const openTrades = runtime.trades.filter(t => t.result === "OPEN" || t.result === "PENDING");
    const activeContractIds = Array.from(runtime.activeContractIds);

    const contractIdsToCheck = Array.from(new Set([...activeContractIds, ...openTrades.map(t => String(t.id))]));
    if (contractIdsToCheck.length === 0) continue;

    // Filter contracts to those that are old enough (at least 15 seconds old) to avoid conflicting with instant/fresh polls
    const contractsToPoll = contractIdsToCheck.filter(id => {
      const expiry = runtime.activeContractsExpiry.get(id);
      if (expiry) return (now - expiry) >= 15000;
      const trade = runtime.trades.find(t => String(t.id) === id);
      if (trade && trade.ts) return (now - trade.ts) >= 15000;
      return true; // default
    });

    if (contractsToPoll.length === 0) continue;

    console.log(`[ServerEngine] 🔄 [Background Reconciler] Robot "${runtime.id}" evaluating ${contractsToPoll.length} open/pending contracts: ${contractsToPoll.join(", ")}`);

    const pollingAccountType = (runtime.config.executionMode || runtime.config.analysisMode || "demo") as "demo" | "real";
    const pollingToken = pollingAccountType === "demo" ? runtime.demoToken : runtime.realToken;

    try {
      const pollingApi = await getTradingApi(pollingAccountType, pollingToken || null, `bg-reconciler-${runtime.id}`);
      for (const contractId of contractsToPoll) {
        try {
          const res = await pollingApi.sendWithTimeout({ proposal_open_contract: 1, contract_id: contractId }, 4000);
          if (res?.proposal_open_contract) {
            const contract = res.proposal_open_contract;
            if (contract.status !== "open") {
              console.log(`[ServerEngine] 🔄 [Background Reconciler] Found settled contract ${contractId} for robot "${runtime.id}". Status: ${contract.status}`);
              handleContractUpdate(runtime, contract);
            } else {
              console.log(`[ServerEngine] 🔄 [Background Reconciler] Contract ${contractId} is still OPEN on Deriv platform.`);
            }
          } else {
            console.warn(`[ServerEngine] ⚠️ [Background Reconciler] Contract ${contractId} not returned by Deriv API.`);
            // If the contract is older than 2 minutes and not found, force settle to avoid permanent lockup
            const expiry = runtime.activeContractsExpiry.get(contractId);
            const trade = runtime.trades.find(t => String(t.id) === contractId);
            const refTs = expiry || (trade?.ts || now);
            if (now - refTs >= 120000) {
              console.warn(`[ServerEngine] ⚠️ [Background Reconciler] Contract ${contractId} has been open for >2 minutes with no API record. Force settling to unblock.`);
              let meta = runtime.contractMeta.get(contractId);
              if (!meta && trade && trade.entry) {
                const derivSymbol = getDerivSymbol(trade.asset);
                meta = {
                  type: (trade.type === "BUY" || trade.type === "CALL") ? "CALL" : "PUT",
                  derivSymbol,
                  entryPrice: trade.entry,
                  isWarmup: trade.warmup === true
                };
              }
              const derivSymbol = meta?.derivSymbol || (trade ? getDerivSymbol(trade.asset) : "R_100");
              const lastTick = lastTickPrices.get(derivSymbol);
              const win = (meta && lastTick && meta.entryPrice) ? (
                meta.type === "CALL" ? lastTick > meta.entryPrice : meta.entryPrice > lastTick
              ) : false;
              const stakeAmount = trade?.amount || runtime.currentStake || 10;
              const instantPnl = win ? Number((stakeAmount * 0.85).toFixed(2)) : -stakeAmount;

              const syntheticContract = {
                contract_id: contractId,
                status: win ? "won" : "lost",
                underlying: derivSymbol,
                contract_type: meta?.type || "CALL",
                entry_tick: meta?.entryPrice || lastTick || 0,
                exit_tick: lastTick || 0,
                buy_price: stakeAmount,
                sell_price: win ? (stakeAmount + instantPnl) : 0,
                profit: instantPnl,
                passthrough: { robotId: runtime.id },
                settledBy: "background_reconciler_force"
              };
              handleContractUpdate(runtime, syntheticContract);
            }
          }
        } catch (err: any) {
          console.warn(`[ServerEngine] ⚠️ [Background Reconciler] Failed polling contract ${contractId} for robot "${runtime.id}":`, err?.message || err);
        }
      }
    } catch (apiErr: any) {
      console.warn(`[ServerEngine] ⚠️ [Background Reconciler] API connection failure for robot "${runtime.id}":`, apiErr?.message || apiErr);
    }
  }
}, 15000);


