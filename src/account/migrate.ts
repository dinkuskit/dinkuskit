import { CURRENT_MERCHANT_SCHEMA_VERSION } from './config.ts';
import { SQL_0001 as sql0001, SQL_0002 as sql0002, SQL_0003 as sql0003 } from './migration-sql.ts';

type Migration = { version: number; name: string; sql: string };

export const MERCHANT_MIGRATIONS: readonly Migration[] = [
  { version: 1, name: '0001_better_auth.sql', sql: sql0001 },
  { version: 2, name: '0002_dinkuskit.sql', sql: sql0002 },
  { version: 3, name: '0003_store_connect.sql', sql: sql0003 },
];

const LEDGER_DDL = 'CREATE TABLE IF NOT EXISTS dinkuskit_schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)';

function statements(sql: string): string[] {
  return sql
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map(part => part.trim())
    .filter(Boolean);
}

async function tableExists(db: D1Database, name: string): Promise<boolean> {
  const row = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
  ).bind(name).first<{ name: string }>();
  return Boolean(row?.name);
}

async function recordedMerchantSchemaVersion(db: D1Database): Promise<number | null> {
  if (!(await tableExists(db, 'dinkuskit_schema_migrations'))) return null;
  const row = await db.prepare('SELECT MAX(version) AS v FROM dinkuskit_schema_migrations').first<{ v: number | null }>();
  return row?.v ?? null;
}

async function detectedAppliedMerchantSchemaVersion(db: D1Database): Promise<number> {
  if (await tableExists(db, 'dinkuskit_store_connection')) return 3;
  if (await tableExists(db, 'dinkuskit_account')) return 2;
  if (await tableExists(db, 'user')) return 1;
  return 0;
}

export async function currentMerchantSchemaVersion(db: D1Database): Promise<number> {
  return await recordedMerchantSchemaVersion(db) ?? await detectedAppliedMerchantSchemaVersion(db);
}

async function applySql(db: D1Database, sql: string): Promise<void> {
  const parts = statements(sql);
  if (parts.length === 0) return;
  await db.batch(parts.map(part => db.prepare(part)));
}

async function recordAppliedMerchantVersions(db: D1Database, upTo: number, now: number): Promise<void> {
  if (upTo < 1) return;
  await db.prepare(LEDGER_DDL).run();
  await db.batch(
    MERCHANT_MIGRATIONS.filter(migration => migration.version <= upTo).map(migration =>
      db.prepare(
        'INSERT OR IGNORE INTO dinkuskit_schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
      ).bind(migration.version, migration.name, now),
    ),
  );
}

export async function applyPendingMerchantMigrations(db: D1Database): Promise<{ from: number; to: number }> {
  const from = await currentMerchantSchemaVersion(db);
  const now = Math.floor(Date.now() / 1000);
  if (from < CURRENT_MERCHANT_SCHEMA_VERSION) {
    for (const migration of MERCHANT_MIGRATIONS) {
      if (migration.version <= from) continue;
      await applySql(db, migration.sql);
    }
  }
  const to = Math.max(from, await currentMerchantSchemaVersion(db));
  await recordAppliedMerchantVersions(db, to, now);
  return { from, to: await currentMerchantSchemaVersion(db) };
}
