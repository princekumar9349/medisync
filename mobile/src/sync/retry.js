import { getPendingActions, markActionStatus, removeCompletedActions } from './queue';
import { apiMarkDoseTaken, apiMarkDoseSkipped } from '../services/api';
import { DeviceEventEmitter } from 'react-native';

const MAX_STALE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

let isSyncing = false;

/**
 * Process all pending queued actions with exponential backoff logic.
 * Uses a mutex (isSyncing) to prevent duplicate flushes.
 */
export async function flushSyncQueue() {
  if (isSyncing) return;
  isSyncing = true;
  DeviceEventEmitter.emit('sync_status', 'syncing');

  try {
    const pending = await getPendingActions();
    if (pending.length === 0) {
      DeviceEventEmitter.emit('sync_status', 'synced');
      return;
    }

    const now = Date.now();

    for (const action of pending) {
      // 1. Expire stale actions (older than 3 days)
      if (now - new Date(action.created_at).getTime() > MAX_STALE_MS) {
        await markActionStatus(action.id, 'completed');
        continue;
      }

      // 2. Exponential backoff check
      if (action.retry_count > 0 && action.last_attempt_at) {
        const backoffMs = Math.min(1000 * Math.pow(2, action.retry_count), 60 * 60 * 1000); // Max 1 hour
        if (now - new Date(action.last_attempt_at).getTime() < backoffMs) {
          continue; // Wait longer before retrying
        }
      }

      // 3. Process Payload
      try {
        const payload = JSON.parse(action.payload_json);

        if (action.operation_type === 'MARK_TAKEN') {
          await apiMarkDoseTaken(payload.medicine_id, payload.slot || '', action.created_at);
        } else if (action.operation_type === 'MARK_SKIPPED') {
          await apiMarkDoseSkipped(payload.medicine_id, payload.slot || '', action.created_at);
        }

        // Success
        await markActionStatus(action.id, 'completed');
      } catch (error) {
        console.warn(`[Sync] Failed to process action ${action.id}:`, error.message);
        const status = error.response?.status;
        
        if (status && status >= 400 && status < 500) {
          // Bad request (e.g., already marked or invalid), drop it
          await markActionStatus(action.id, 'completed');
        } else {
          // Network error or 5xx, increment retry
          await markActionStatus(action.id, 'pending', true);
        }
      }
    }

    // Cleanup successful actions
    await removeCompletedActions();
    DeviceEventEmitter.emit('sync_status', 'synced');

  } catch (err) {
    console.error('[Sync] Flush failed:', err);
    DeviceEventEmitter.emit('sync_status', 'offline');
  } finally {
    isSyncing = false;
  }
}
