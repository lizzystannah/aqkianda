import { io, Socket } from "socket.io-client";
import { useStore, type RobotConfig } from "./store";
import { toast } from "sonner";

let socket: Socket | null = null;
let _unsubscribe: (() => void) | null = null;

// Track what the server currently thinks is running
const serverRuntimes = new Map<string, any>();

// Track robots that are currently being started (pending confirmation from server)
// This prevents duplicate start-robot emissions while waiting for robot-status response
const pendingStart = new Set<string>();

// Flag to prevent client-induced start/stop commands on page refresh before receipt of true server state
let hasReceivedInitialStatuses = false;
let hasSyncedWithServerDb = false;

/**
 * Sync robots config from server (robots_db.json on volume Docker).
 * Server is the source of truth for trades and managementState.
 */
export async function syncRobotsFromServer() {
  try {
    const res = await fetch("/api/robots/config");
    if (!res.ok) {
      console.warn("[RobotClient] syncRobotsFromServer: server returned", res.status);
      return;
    }
    const data = await res.json();
    if (!data?.robots || typeof data.robots !== "object") return;

    const db = data.robots;
    const store = useStore.getState();
    const currentRobots = store.robots || [];

    console.log(`[RobotClient] syncRobotsFromServer: loaded ${Object.keys(db).length} robots from server`);

    const mergedRobots = currentRobots.map((r) => {
      const serverData = db[r.id];
      if (!serverData) return r;

      // Cleanse configurations of trades and managementState to avoid nesting overwrites
      const rawConfig = serverData.config || {};
      const { trades: _unused1, managementState: _unused2, ...cleanConfig } = rawConfig;

      // Usa o active da config como fonte de verdade — não o runtime do servidor
      const active = cleanConfig.active === true;

      // Client runtime state wins for trades and managementState (fresher than persisted data)
      return {
        ...r,
        ...cleanConfig,
        active,
        trades: r.trades && r.trades.length > 0 ? r.trades : (serverData.trades || []),
        managementState: {
          ...(serverData.managementState || {}),
          ...(r.managementState || {}),
        },
      };
    });

    // Also add robots that exist on server but not in client (e.g., after clearing browser cache)
    for (const [robotId, serverData] of Object.entries(db) as [string, any][]) {
      if (!mergedRobots.find((r) => r.id === robotId)) {
        console.log(`[RobotClient] syncRobotsFromServer: restoring robot "${serverData.config?.name || robotId}" from server`);
        // Cleanse configuration elements
        const rawConfig = serverData.config || {};
        const { trades: _unused3, managementState: _unused4, ...cleanConfig } = rawConfig;

        // Usa o active da config como fonte de verdade — não o runtime do servidor
        const active = cleanConfig.active === true;

        mergedRobots.push({
          ...cleanConfig,
          id: robotId,
          trades: serverData.trades || [],
          managementState: serverData.managementState || {},
          active,
        });
      }
    }

    useStore.setState({ robots: mergedRobots });

    // Collect managementTrades from all robots and hydrate managementHistory
    const allMgmtTrades: any[] = [];
    for (const [, serverData] of Object.entries(db) as [string, any][]) {
      if (serverData.managementTrades && Array.isArray(serverData.managementTrades)) {
        allMgmtTrades.push(...serverData.managementTrades);
      }
    }
    if (allMgmtTrades.length > 0) {
      allMgmtTrades.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      useStore.setState({ managementHistory: allMgmtTrades.slice(0, 500) });
      console.log(`[RobotClient] Loaded ${allMgmtTrades.length} management trades from server`);
    }

    hasSyncedWithServerDb = true;
  } catch (err) {
    console.warn("[RobotClient] syncRobotsFromServer failed (server may be offline):", err);
  }
}

/**
 * Push robot config to server (config only — server preserves trades/managementState).
 */
export async function pushRobotConfigToServer(robot: any) {
  try {
    const { trades, managementState, managementTrades, ...cleanConfig } = robot;
    const res = await fetch("/api/robots/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        robots: {
          [robot.id]: {
            config: cleanConfig,
          }
        }
      }),
    });
    if (!res.ok) {
      console.warn("[RobotClient] pushRobotConfigToServer: server returned", res.status);
    }
  } catch (err) {
    console.warn("[RobotClient] pushRobotConfigToServer failed:", err);
  }
}

/**
 * Delete robot from server volume (complete removal of all data).
 */
export async function deleteRobotFromServer(robotId: string) {
  try {
    const res = await fetch(`/api/robots/config/${robotId}`, { method: "DELETE" });
    if (!res.ok) {
      console.warn("[RobotClient] deleteRobotFromServer: server returned", res.status);
      return false;
    }
    console.log(`[RobotClient] deleteRobotFromServer: robot "${robotId}" deleted from volume`);
    return true;
  } catch (err) {
    console.warn("[RobotClient] deleteRobotFromServer failed:", err);
    return false;
  }
}

export function resetRobotOnServer(id: string) {
  if (socket?.connected) {
    socket.emit("reset-pnl", { id });
  }
}

export function resetRobotDailyOnServer(id: string) {
  if (socket?.connected) {
    socket.emit("reset-daily-pnl", { id });
  }
}

export function resetManagementOnServer(id: string) {
  if (socket?.connected) {
    socket.emit("reset-management", { id });
  }
}

function robotFingerprint(r: RobotConfig): string {
  return [
    r.active,
    r.mode,
    r.timeframe,
    r.strategyId,
    (r.assets ?? []).slice().sort().join(","),
    r.stakingMode,
    r.stake,
    r.durationCandles,
    r.dailyGoal,
    r.dailyStopLoss,
    r.payout,
    r.sorosMaxStake,
    r.entryAfterWin,
    r.entryAfterLoss,
    r.vdvFilter,
    r.globalInvert,
    JSON.stringify(r.management || {}),
    JSON.stringify(r.filters || {})
  ].join("|");
}
const _fingerprints = new Map<string, string>();

// Debounce timer for syncRobotEngine to avoid rapid-fire calls
let _syncTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSyncRobotEngine(delayMs = 100) {
  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => {
    _syncTimer = null;
    syncRobotEngine();
  }, delayMs);
}

export function syncRobotEngine() {
  if (!socket || !socket.connected) {
    console.log("[RobotClient] syncRobotEngine called but socket not connected — skipping");
    return;
  }

  if (!hasReceivedInitialStatuses || !hasSyncedWithServerDb) {
    console.log("[RobotClient] syncRobotEngine called before receiving initial server context — skipping to protect server execution");
    return;
  }

  const store = useStore.getState();
  const robots = store.robots || [];
  const robotIds = new Set(robots.map((r) => r.id));

  // ── Start / restart robots that are active ──
  for (const robot of robots) {
    const fp = robotFingerprint(robot);
    const prevFp = _fingerprints.get(robot.id);
    const isRunningOnServer = serverRuntimes.has(robot.id);
    const isPending = pendingStart.has(robot.id);

    // Create a lightweight config by removing trades to avoid WebSocket "transport error" due to payload size
    const { trades, ...cleanConfig } = robot;

    if (robot.active) {
      if (!isRunningOnServer && !isPending) {
        // Not running and not pending — start it
        console.log(`[RobotClient] Starting robot "${robot.name}" (${robot.id}) on server`);
        _fingerprints.set(robot.id, fp);
        pendingStart.add(robot.id);
        socket.emit("start-robot", {
          config: cleanConfig,
          demoToken: store.demoToken,
          realToken: store.realToken,
          candleToken: store.candleToken,
          robotTokens: store.robotTokens,
          srLines: store.srLines,
          srZones: store.srZones
        });
      } else if (isRunningOnServer && !isPending && prevFp !== undefined && prevFp !== fp) {
        // Config changed — restart on server
        console.log(`[RobotClient] Config changed for "${robot.name}" — restarting on server`);
        _fingerprints.set(robot.id, fp);
        pendingStart.add(robot.id);
        socket.emit("start-robot", {
          config: cleanConfig,
          demoToken: store.demoToken,
          realToken: store.realToken,
          candleToken: store.candleToken,
          robotTokens: store.robotTokens,
          srLines: store.srLines,
          srZones: store.srZones
        });
      } else {
        _fingerprints.set(robot.id, fp);
      }
    } else {
      // Robot is inactive — stop on server if running
      if (isRunningOnServer) {
        console.log(`[RobotClient] Stopping inactive robot "${robot.name}" (${robot.id}) on server`);
        socket.emit("stop-robot", { id: robot.id });
        serverRuntimes.delete(robot.id);
      }
      pendingStart.delete(robot.id);
      _fingerprints.delete(robot.id);
    }
  }

  // ── Stop robots on server that no longer exist in the store ──
  for (const [id] of serverRuntimes) {
    if (!robotIds.has(id)) {
      console.log(`[RobotClient] Robot ${id} no longer exists in store — sending stop-robot to server`);
      socket.emit("stop-robot", { id });
      serverRuntimes.delete(id);
      pendingStart.delete(id);
      _fingerprints.delete(id);
    }
  }
}

export function initRobotEngine() {
  if (_unsubscribe) return; // already initialized

  console.log("[RobotClient] Initialising robot client engine...");
  syncRobotsFromServer();

  socket = io(window.location.origin, {
    reconnectionDelay: 1500,
    reconnectionAttempts: Infinity,
  });

  socket.on("connect", () => {
    console.log(`[RobotClient] Connected to server (socket: ${socket?.id})`);
    // Expor socket para componentes React poderem emitir eventos em tempo real
    (window as any).__socket = socket;
    // Clear pending state on reconnect — server has fresh state
    pendingStart.clear();
    hasReceivedInitialStatuses = false;
    // Small delay to let server send robot-statuses first
    setTimeout(() => {
      if (hasReceivedInitialStatuses && hasSyncedWithServerDb) {
        syncRobotEngine();
      }
    }, 200);
  });

  socket.on("disconnect", (reason) => {
    console.warn(`[RobotClient] Disconnected from server: ${reason}`);
    // Clear server state — we don't know what's running anymore
    serverRuntimes.clear();
    pendingStart.clear();
    hasReceivedInitialStatuses = false;
  });

  socket.on("reconnect", (attempt) => {
    console.log(`[RobotClient] Reconnected after ${attempt} attempt(s)`);
  });

  socket.on("robot-statuses", (statuses: any[]) => {
    console.log(`[RobotClient] Received robot-statuses: ${statuses.length} running on server`);
    serverRuntimes.clear();
    pendingStart.clear();
    hasReceivedInitialStatuses = true; // Mark that we possess the authoritative server state
    
    // Store server runtime status documents
    for (const st of statuses) {
      serverRuntimes.set(st.id, st);
    }

    const store = useStore.getState();
    const runningIds = new Set(statuses.map(st => st.id));

    // Update in-memory robots active status with server truths
    const updatedRobots = store.robots.map((robot) => {
      const isRunning = runningIds.has(robot.id);
      const st = serverRuntimes.get(robot.id);

      if (isRunning) {
        _fingerprints.set(robot.id, robotFingerprint({ ...robot, active: true }));
        return {
          ...robot,
          // Preserva o estado active definido pelo usuário/config — não sobrepõe com o runtime do servidor
          trades: st.trades || robot.trades || [],
          managementState: st.managementState || robot.managementState || {},
        };
      } else {
        _fingerprints.set(robot.id, robotFingerprint({ ...robot, active: false }));
        return robot;
      }
    });

    useStore.setState({ robots: updatedRobots });

    // Sync after receiving server state — with debounce to avoid rapid calls
    scheduleSyncRobotEngine(150);
  });

  socket.on("robot-status", (data: { id: string; status: string; message: string }) => {
    console.log(`[RobotClient] robot-status: ${data.id} → ${data.status} (${data.message})`);
    const isRunning = data.status === "running";
    if (isRunning) {
      serverRuntimes.set(data.id, data);
      pendingStart.delete(data.id);
    } else {
      serverRuntimes.delete(data.id);
      pendingStart.delete(data.id);
    }

    // Update active property locally in the store to keep UI in sync without emitting another HTTP PUT back to server
    const store = useStore.getState();
    const robot = store.robots.find(r => r.id === data.id);
    if (robot && robot.active !== isRunning) {
      _fingerprints.set(robot.id, robotFingerprint({ ...robot, active: isRunning }));
      useStore.setState({
        robots: store.robots.map(r => r.id === data.id ? { ...r, active: isRunning } : r)
      });
    }
  });

  socket.on("robot-error", (data: { id: string; message: string }) => {
    console.error(`[RobotClient] robot-error for ${data.id}: ${data.message}`);
    // FIX: Remove from serverRuntimes and pendingStart so we don't loop
    serverRuntimes.delete(data.id);
    pendingStart.delete(data.id);
    _fingerprints.delete(data.id);
    
    // Deactivate the robot in the store and alert the user
    try {
      const storeState = useStore.getState();
      const rb = storeState.robots.find(r => r.id === data.id);
      if (rb) {
        storeState.updateRobot(data.id, { active: false });
        toast.error(`Robô "${rb.name}" parado: ${data.message}`);
      } else {
        toast.error(`Erro: ${data.message}`);
      }
    } catch (err) {
      console.error("[RobotClient] failed to handle robot-error in store:", err);
    }
  });

  socket.on("server-latency", (data: { id: string; ms: number }) => {
    useStore.getState().setServerLatency(data.ms);
  });

  socket.on("robot-trade", (data: { id: string; trade: any }) => {
    console.log(`[RobotClient] robot-trade: robot=${data.id} asset=${data.trade?.asset} type=${data.trade?.type} amount=${data.trade?.amount}`);
    useStore.getState().addRobotTrade(data.id, data.trade);
  });

  socket.on(
    "robot-trade-update",
    (data: {
      id: string;
      contractId: string;
      result: string;
      pnl: number;
      exit?: number;
      configUpdates?: any;
      managementTrade?: any;
    }) => {
      const store = useStore.getState();
      const robot = store.robots.find((r) => r.id === data.id);
      if (!robot) {
        console.warn(`[RobotClient] robot-trade-update: robot ${data.id} not found in store`);
        return;
      }

      console.log(
        `[RobotClient] robot-trade-update: robot=${data.id} contract=${data.contractId} result=${data.result} pnl=${data.pnl}`
      );

      store.updateRobotTrade(data.id, data.contractId, {
        result: data.result as any,
        pnl: data.pnl,
        exit: data.exit,
      });

      // Apply server-computed config updates (daily pnl, vdv, warmup state)
      if (data.configUpdates) {
        store.updateRobot(data.id, data.configUpdates);
      }

      if (data.managementTrade) {
        store.addManagementTrade(data.managementTrade);
      }
    }
  );

  socket.on("robot-balance", (data: { id: string; balance: number }) => {
    console.log(`[RobotClient] robot-balance: robot=${data.id} balance=${data.balance}`);
  });

  // ── Watch store for robot & SR changes ──
  _unsubscribe = useStore.subscribe((state, prevState) => {
    // 1. Sync lines if they changed
    if (state.srLines !== prevState.srLines || state.srZones !== prevState.srZones) {
      if (socket && socket.connected) {
        for (const [id] of serverRuntimes) {
          socket.emit("sync-lines", {
            id,
            srLines: state.srLines,
            srZones: state.srZones
          });
        }
      }
    }

    // 2. Sync robots
    const prevRobots = prevState.robots || [];
    const nextRobots = state.robots || [];

    if (prevRobots === nextRobots) return;

    // Fast path: length changed (robot added or removed)
    if (prevRobots.length !== nextRobots.length) {
      console.log(
        `[RobotClient] Robot count changed: ${prevRobots.length} → ${nextRobots.length} — syncing`
      );
      scheduleSyncRobotEngine(50);
      return;
    }

    // Check if any operational field changed
    const operationalChange = nextRobots.some((r) => {
      const prev = prevRobots.find((p) => p.id === r.id);
      if (!prev) return true;
      return robotFingerprint(r) !== robotFingerprint(prev);
    });

    if (operationalChange) {
      scheduleSyncRobotEngine(50);
    }
  });

  console.log("[RobotClient] Initialised — watching for robot changes.");
}

export function destroyRobotEngine() {
  console.log("[RobotClient] Destroying robot client engine...");
  if (_syncTimer) {
    clearTimeout(_syncTimer);
    _syncTimer = null;
  }
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  serverRuntimes.clear();
  pendingStart.clear();
  _fingerprints.clear();
  hasReceivedInitialStatuses = false;
}

export function getRobotRuntime(robotId: string): {
  connected: boolean;
  candleCount: number;
  ready: boolean;
  assetCount: number;
} | null {
  const st = serverRuntimes.get(robotId);
  if (st) {
    return {
      connected: true,
      candleCount: st.candleCount || 0,
      ready: true,
      assetCount: st.assets?.length || 1,
    };
  }
  return null;
}
