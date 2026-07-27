import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useStore } from "./store";

/**
 * Hook that connects to the server's socket.io and listens for real-time
 * robot events (trade updates, status changes, etc.)
 */
export function useRobotSocket(enabled: boolean = true) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const socket = io({ path: "/ws", transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[Socket] Connected to server");
    });

    // New trade created
    socket.on("robot-trade", (data: { id: string; trade: any }) => {
      useStore.getState().updateRobotTrade(data.id, data.trade.id, data.trade);
    });

    // Trade result updated (WIN/LOSS)
    socket.on("robot-trade-update", (data: { id: string; contractId: string; result: string; pnl: number }) => {
      useStore.getState().updateRobotTrade(data.id, data.contractId, {
        result: data.result,
        pnl: data.pnl,
      });
    });

    // Robot started/stopped
    socket.on("robot-status", (data: { id: string; status: string }) => {
      if (data.status === "running" || data.status === "started") {
        useStore.setState((s) => ({
          robots: s.robots.map((r) =>
            r.id === data.id ? { ...r, active: true } : r
          ),
        }));
      } else if (data.status === "stopped" || data.status === "error") {
        useStore.setState((s) => ({
          robots: s.robots.map((r) =>
            r.id === data.id ? { ...r, active: false } : r
          ),
        }));
      }
    });

    socket.on("disconnect", () => {
      console.log("[Socket] Disconnected from server");
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [enabled]);

  return socketRef;
}
