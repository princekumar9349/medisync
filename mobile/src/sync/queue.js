import { getDb } from '../storage/db';

/**
 * Sync Queue priority:
 * 1: Adherence Logs (Mark Taken/Skipped)
 * 2: Escalation Acknowledgements
 * 3: Caregiver Events
 * 4: Analytics
 * 5: Cosmetic
 */

export async function enqueueSyncAction({ operation_type, priority = 5, payload, dedupe_key }) {
  const db = await getDb();
  const id = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9);
  const created_at = new Date().toISOString();
  const payload_json = JSON.stringify(payload);

  if (dedupe_key) {
    // Check if a pending action with this dedupe_key already exists
    const existing = await db.getFirstAsync(
      'SELECT id FROM sync_queue WHERE dedupe_key = ? AND status = ?',
      [dedupe_key, 'pending']
    );

    if (existing) {
      // Update payload of the existing dedupe key
      await db.runAsync(
        'UPDATE sync_queue SET payload_json = ?, created_at = ? WHERE dedupe_key = ? AND status = ?',
        [payload_json, created_at, dedupe_key, 'pending']
      );
      return existing.id;
    }
  }

  await db.runAsync(
    `INSERT INTO sync_queue 
      (id, operation_type, priority, payload_json, created_at, status, dedupe_key) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, operation_type, priority, payload_json, created_at, 'pending', dedupe_key || null]
  );

  return id;
}

export async function markActionStatus(id, status, incrementRetry = false) {
  const db = await getDb();
  if (incrementRetry) {
    await db.runAsync(
      `UPDATE sync_queue 
       SET status = ?, last_attempt_at = ?, retry_count = retry_count + 1 
       WHERE id = ?`,
      [status, new Date().toISOString(), id]
    );
  } else {
    await db.runAsync(
      `UPDATE sync_queue SET status = ? WHERE id = ?`,
      [status, id]
    );
  }
}

export async function getPendingActions() {
  const db = await getDb();
  // Order by priority (1 is highest), then created_at
  return await db.getAllAsync(
    `SELECT * FROM sync_queue 
     WHERE status = 'pending' 
     ORDER BY priority ASC, created_at ASC`
  );
}

export async function removeCompletedActions() {
  const db = await getDb();
  await db.runAsync(`DELETE FROM sync_queue WHERE status = 'completed'`);
}
