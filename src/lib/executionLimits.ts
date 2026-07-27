/**
 * Dynamic Execution Limits & Timeouts
 * 
 * Computes dynamic entry latency tolerances (max allowed seconds after candle open)
 * and proposal timeouts/windows based on operational timeframe and duration.
 */

export interface ExecutionLimits {
  /** Maximum allowed seconds after candle open to enter trade (latency tolerance) */
  maxAllowedDelaySeconds: number;
  /** Proposal WebSocket request timeout in milliseconds */
  proposalTimeoutMs: number;
  /** Maximum total elapsed milliseconds allowed from proposal fetch to buy completion */
  proposalMaxWindowMs: number;
  /** Maximum operational scale in minutes max(timeframe, duration) */
  maxOperationalMinutes: number;
}

export function parseDurationToSeconds(duration: number | string, durationUnit = "s", timeframe = "1m"): number {
  if (typeof duration === "string") {
    const parsed = parseFloat(duration);
    if (!isNaN(parsed)) duration = parsed;
    else duration = 1;
  }
  
  if (duration > 1000000000) {
    // Target epoch timestamp
    return Math.max(1, Math.floor(duration - Date.now() / 1000));
  }

  const u = (durationUnit || "s").toLowerCase();
  if (u === "m") return duration * 60;
  if (u === "h") return duration * 3600;
  if (u === "d") return duration * 86400;
  if (u === "s") return duration;

  // If unit is unspecified or "c" (candles), convert using timeframe
  let tfSec = 60;
  const tf = (timeframe || "1m").toLowerCase();
  if (tf.endsWith("s")) tfSec = parseInt(tf) || 60;
  else if (tf.endsWith("m")) tfSec = (parseInt(tf) || 1) * 60;
  else if (tf.endsWith("h")) tfSec = (parseInt(tf) || 1) * 3600;

  return duration * tfSec;
}

export function parseTimeframeToMinutes(timeframe: string = "1m"): number {
  const tf = (timeframe || "1m").toLowerCase().trim();
  if (tf.endsWith("s")) {
    const s = parseInt(tf) || 60;
    return s / 60;
  }
  if (tf.endsWith("m")) {
    return parseInt(tf) || 1;
  }
  if (tf.endsWith("h")) {
    return (parseInt(tf) || 1) * 60;
  }
  if (tf.endsWith("d")) {
    return (parseInt(tf) || 1) * 1440;
  }
  const parsed = parseInt(tf);
  return isNaN(parsed) ? 1 : parsed;
}

export function getDynamicExecutionLimits(
  timeframe: string = "1m",
  durationSecOrEpoch: number = 60,
  durationUnit: string = "s"
): ExecutionLimits {
  const tfMinutes = parseTimeframeToMinutes(timeframe);
  const durSeconds = parseDurationToSeconds(durationSecOrEpoch, durationUnit, timeframe);
  const durMinutes = durSeconds / 60;

  // Operational scale is the maximum of the candle timeframe and the trade duration
  const maxOperationalMinutes = Math.max(tfMinutes, durMinutes);

  let maxAllowedDelaySeconds = 2;
  let proposalTimeoutMs = 3000;
  let proposalMaxWindowMs = 5000;

  if (maxOperationalMinutes <= 1) {
    // 1m TF / 1m Duration
    maxAllowedDelaySeconds = 2;
    proposalTimeoutMs = 3000;
    proposalMaxWindowMs = 5000;
  } else if (maxOperationalMinutes <= 2) {
    // 2m TF or 2m Duration
    maxAllowedDelaySeconds = 4;
    proposalTimeoutMs = 4000;
    proposalMaxWindowMs = 8000;
  } else if (maxOperationalMinutes <= 3) {
    // 3m TF or 3m Duration
    maxAllowedDelaySeconds = 5;
    proposalTimeoutMs = 5000;
    proposalMaxWindowMs = 9000;
  } else if (maxOperationalMinutes <= 5) {
    // 5m TF or 5m Duration
    maxAllowedDelaySeconds = 6;
    proposalTimeoutMs = 6000;
    proposalMaxWindowMs = 11000;
  } else if (maxOperationalMinutes <= 10) {
    // 10m TF or 10m Duration
    maxAllowedDelaySeconds = 10;
    proposalTimeoutMs = 8000;
    proposalMaxWindowMs = 15000;
  } else if (maxOperationalMinutes <= 15) {
    // 15m TF or 15m Duration
    maxAllowedDelaySeconds = 12;
    proposalTimeoutMs = 10000;
    proposalMaxWindowMs = 18000;
  } else if (maxOperationalMinutes <= 30) {
    // 30m TF or 30m Duration
    maxAllowedDelaySeconds = 15;
    proposalTimeoutMs = 12000;
    proposalMaxWindowMs = 22000;
  } else {
    // 1h+ TF or 1h+ Duration
    maxAllowedDelaySeconds = 20;
    proposalTimeoutMs = 15000;
    proposalMaxWindowMs = 28000;
  }

  return {
    maxAllowedDelaySeconds,
    proposalTimeoutMs,
    proposalMaxWindowMs,
    maxOperationalMinutes,
  };
}
