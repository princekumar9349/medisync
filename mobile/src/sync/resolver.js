/**
 * Deterministic Conflict Resolution Logic
 * 
 * Rules:
 * 1. Hardware IoT timestamp > Manual App Tap (if within X seconds).
 * 2. Latest confirmed server event wins.
 * 3. Duplicate pending mutations auto-collapse (handled by queue.js dedupe_key).
 */

export function resolveAdherenceConflict(localLog, serverLog) {
  // If server log doesn't exist, local wins
  if (!serverLog) return localLog;

  // If local log has an IoT authoritative timestamp, it wins if the difference is < 5 mins
  if (localLog.source === 'iot' && serverLog.source !== 'iot') {
    const localTime = new Date(localLog.timestamp).getTime();
    const serverTime = new Date(serverLog.timestamp).getTime();
    if (Math.abs(localTime - serverTime) < 5 * 60 * 1000) {
      return localLog;
    }
  }

  // Server authoritative time wins by default
  return serverLog;
}
