/**
 * Strategy Loader — Runtime dynamic strategy loading.
 *
 * Problem:
 *   Strategies created via the UI are saved as .ts files on disk via the API,
 *   but `import.meta.glob` (Vite) only sees files that existed at BUILD TIME.
 *   New strategies are invisible to the frontend until a dev server restart
 *   or production rebuild.
 *
 * Solution:
 *   This module provides a runtime strategy loader that:
 *   1. First tries the bundled strategies (import.meta.glob — fast, no network)
 *   2. Falls back to fetching the .ts source from the server API, then
 *      transpiles and evaluates it in-browser using a lightweight JS evaluator.
 *
 * This ensures that newly created strategies can be used IMMEDIATELY for:
 *   - Backtesting (runFullBacktest)
 *   - Semi-auto / Auto signal generation (Trading.tsx)
 *   - Robot creation
 */

import type { Strategy, StrategyContext, StrategyResult } from "@/strategies";
import { rsi, sma, ema, bollinger, adx, macd, getPattern, type Candle } from "@/lib/market";
import * as marketLib from "@/lib/market";

// ─── In-memory cache for dynamically loaded strategies ───────────────────────
const dynamicStrategyCache = new Map<string, { strategy: Strategy; loadedAt: number }>();

// Cache TTL: 60 seconds — after this we re-fetch from server to pick up edits
const CACHE_TTL_MS = 60_000;

// ─── Bundled strategy lookup (build-time) ────────────────────────────────────

function findBundledStrategy(strategyId: string): Strategy | null {
  // We no longer use import.meta.glob("@/strategies/*.ts", { eager: true }) 
  // here because if a user uploads a strategy with a syntax error, it would
  // crash the entire Vite dev server and stop all operations.
  // We rely entirely on the server fallback and dynamic cache.
  return null;
}

// ─── Runtime strategy transpiler ─────────────────────────────────────────────

/**
 * Minimal TypeScript → JavaScript transpiler for strategy code.
 * Strips type annotations, imports, and `export default` to produce
 * executable JS that returns a strategy object.
 */
function transpileStrategyCode(tsCode: string): string {
  let code = tsCode;

  // Remove import statements (they reference types / modules already available)
  code = code.replace(/^import\s+.*?;\s*$/gm, "");

  // Remove TypeScript type annotations from function parameters
  // e.g. (context: StrategyContext): StrategyResult | null => ...
  // becomes (context) => ...
  code = code.replace(/:\s*StrategyContext/g, "");
  code = code.replace(/:\s*StrategyResult\s*\|\s*null/g, "");
  code = code.replace(/:\s*Strategy\b/g, "");

  // Remove type assertions (as const, as any, etc.)
  code = code.replace(/\bas\s+(const|any|never|"[^"]*"|'[^']*'|[A-Za-z_][\w]*(\s*\|\s*[A-Za-z_][\w]*)*)\b/g, "");

  // Remove `export default <identifier>;` at the end
  code = code.replace(/export\s+default\s+(\w+)\s*;\s*$/m, "return $1;");

  // Handle `export default { ... }` pattern
  code = code.replace(/export\s+default\s+/g, "return ");

  // Remove remaining type annotations (simple cases)
  // Handle patterns like `: number[]`, `: { key: string }[]`, `: Record<string, any>`
  // Be careful not to remove object property values
  code = code.replace(/(?<=\([\w\s,]*\w)\s*:\s*(?:number|string|boolean|any|void|never|null|undefined)(?:\[\])*/g, "");

  return code;
}

/**
 * Evaluate transpiled strategy code in a sandboxed scope.
 */
function evaluateStrategyCode(jsCode: string): { strategy: Strategy | null; error?: string } {
  try {
    const moduleObj: any = { exports: {} };
    const sandboxRequire = (id: string) => {
      if (id === "@/lib/market" || id === "@/lib/indicators") return marketLib;
      if (id === "./index") return {}; // Types only
      return {};
    };

    const fn = new Function("module", "exports", "require", jsCode);
    fn(moduleObj, moduleObj.exports, sandboxRequire);

    const result = moduleObj.exports.default || moduleObj.exports;

    if (result && result.id && typeof result.onTick === "function") {
      return { strategy: result as Strategy };
    }

    return { strategy: null, error: "O script foi compilado, mas não retornou um objeto de estratégia válido (falta 'id' ou 'onTick')." };
  } catch (e: any) {
    console.error("[StrategyLoader] Evaluation error:", e);
    return { strategy: null, error: `Erro na execução do script: ${e.message || String(e)}` };
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Load a strategy by ID. Tries bundled first, then falls back to server API.
 *
 * @param strategyId - The strategy ID to load
 * @param forceRefresh - If true, bypass cache and re-fetch from server
 * @returns The strategy object, or null if not found
 */
export async function loadStrategyById(
  strategyId: string,
  forceRefresh = false
): Promise<Strategy | null> {
  // 1. Try bundled strategies first (instant, no network)
  const bundled = findBundledStrategy(strategyId);
  if (bundled) {
    return bundled;
  }

  // 2. Check in-memory cache
  if (!forceRefresh) {
    const cached = dynamicStrategyCache.get(strategyId);
    if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
      return cached.strategy;
    }
  }

  // 3. Fetch from server API
  console.log(`[StrategyLoader] Strategy "${strategyId}" not in bundle — fetching from server...`);
  try {
    const res = await fetch(`/api/strategies/${encodeURIComponent(strategyId)}`);
    if (!res.ok) {
      console.warn(`[StrategyLoader] Server returned ${res.status} for strategy "${strategyId}"`);
      return null;
    }

    const data = await res.json();
    if (!data.code) {
      console.warn(`[StrategyLoader] No code returned for strategy "${strategyId}"`);
      return null;
    }

    // 4. Use server-side compilation for robust TS support
    try {
      const compileRes = await fetch("/api/strategies/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: data.code })
      });

      if (!compileRes.ok) {
        const errData = await compileRes.json();
        throw new Error(errData.error || "Erro de compilação no servidor.");
      }

      const { js } = await compileRes.json();
      const { strategy, error } = evaluateStrategyCode(js);

      if (strategy) {
        console.log(`[StrategyLoader] ✅ Dynamically loaded strategy "${strategy.name}" (${strategy.id})`);
        dynamicStrategyCache.set(strategyId, { strategy, loadedAt: Date.now() });
        return strategy;
      }

      if (error) {
        // We attach the error to a dummy strategy object so the UI can display it
        return { id: strategyId, name: strategyId, description: error, error: true } as any;
      }

      return null;
    } catch (compileErr: any) {
      console.error(`[StrategyLoader] Compilation/Evaluation failed for "${strategyId}":`, compileErr);
      return { id: strategyId, name: strategyId, description: compileErr.message, error: true } as any;
    }
  } catch (err) {
    console.error(`[StrategyLoader] Failed to fetch strategy "${strategyId}" from server:`, err);
    return null;
  }
}

/**
 * Synchronous strategy lookup — only checks bundled + cache.
 * Use this in hot paths where async is not desirable (e.g. 1s tick loops).
 *
 * Call `preloadStrategy()` first to ensure the strategy is cached.
 */
export function findStrategySynchronous(strategyId: string): Strategy | null {
  // 1. Bundled
  const bundled = findBundledStrategy(strategyId);
  if (bundled) return bundled;

  // 2. Cache
  const cached = dynamicStrategyCache.get(strategyId);
  if (cached) return cached.strategy;

  return null;
}

/**
 * Pre-load a strategy into the cache. Call this BEFORE entering a hot loop
 * that needs `findStrategySynchronous`.
 */
export async function preloadStrategy(strategyId: string): Promise<boolean> {
  const strat = await loadStrategyById(strategyId);
  return strat !== null;
}

/**
 * Invalidate a cached strategy (e.g. after editing it).
 */
export function invalidateStrategyCache(strategyId?: string) {
  if (strategyId) {
    dynamicStrategyCache.delete(strategyId);
  } else {
    dynamicStrategyCache.clear();
  }
}

/**
 * Get all cached dynamic strategies (for debugging).
 */
export function getCachedStrategies(): string[] {
  return Array.from(dynamicStrategyCache.keys());
}
