import * as SQLite from 'expo-sqlite';
import { migrations } from './migrations';

let dbInstance = null;

export async function getDb() {
  if (dbInstance) return dbInstance;
  dbInstance = await SQLite.openDatabaseAsync('medisync.db');
  await runMigrations(dbInstance);
  return dbInstance;
}

async function runMigrations(db) {
  await db.execAsync('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);');
  
  const result = await db.getFirstAsync('SELECT MAX(version) as currentVersion FROM schema_version');
  const currentVersion = result?.currentVersion || 0;

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      console.log(`[DB] Running migration v${migration.version}...`);
      await db.execAsync(migration.up);
      await db.runAsync('INSERT INTO schema_version (version) VALUES (?)', [migration.version]);
    }
  }
}
