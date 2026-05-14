export const migrations = [
  {
    version: 1,
    up: `
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY
      );

      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        operation_type TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 5,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        retry_count INTEGER DEFAULT 0,
        last_attempt_at TEXT,
        status TEXT DEFAULT 'pending',
        dedupe_key TEXT UNIQUE
      );
      CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
      CREATE INDEX IF NOT EXISTS idx_sync_queue_priority ON sync_queue(priority);

      CREATE TABLE IF NOT EXISTS adherence_logs (
        id TEXT PRIMARY KEY,
        medicine_id TEXT NOT NULL,
        slot TEXT,
        status TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        is_deleted INTEGER DEFAULT 0,
        synced_delete INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_adherence_logs_med_date ON adherence_logs(medicine_id, timestamp);
    `
  }
];
