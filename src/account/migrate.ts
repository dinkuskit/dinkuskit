import { CURRENT_MERCHANT_SCHEMA_VERSION } from './config.ts';
import { SQL_0001 as sql0001, SQL_0002 as sql0002, SQL_0003 as sql0003, SQL_0004 as sql0004, SQL_0005 as sql0005 } from './migration-sql.ts';

type Migration = { version: number; name: string; sql: string };

export const MERCHANT_MIGRATIONS: readonly Migration[] = [
  { version: 1, name: '0001_better_auth.sql', sql: sql0001 },
  { version: 2, name: '0002_dinkuskit.sql', sql: sql0002 },
  { version: 3, name: '0003_store_connect.sql', sql: sql0003 },
  { version: 4, name: '0004_account_foundation.sql', sql: sql0004 },
  { version: 5, name: '0005_operator_authorization.sql', sql: sql0005 },
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

async function columnExists(db: D1Database, table: string, column: string): Promise<boolean> {
  const rows = await db.prepare(`PRAGMA table_info("${table.replaceAll('"', '""')}")`).all<{ name: string }>();
  return (rows.results ?? []).some(row => row.name === column);
}

async function recordedMerchantSchemaVersion(db: D1Database): Promise<number | null> {
  if (!(await tableExists(db, 'dinkuskit_schema_migrations'))) return null;
  const row = await db.prepare('SELECT MAX(version) AS v FROM dinkuskit_schema_migrations').first<{ v: number | null }>();
  return row?.v ?? null;
}

async function detectedAppliedMerchantSchemaVersion(db: D1Database): Promise<number> {
  if (await tableExists(db, 'dinkuskit_operator_grant')) return 5;
  if (
    await tableExists(db, 'dinkuskit_organization')
    && await columnExists(db, 'dinkuskit_store_connection', 'organization_id')
  ) return 4;
  if (await tableExists(db, 'dinkuskit_store_connection')) return 3;
  if (await tableExists(db, 'dinkuskit_account')) return 2;
  if (await tableExists(db, 'user')) return 1;
  return 0;
}

export async function currentMerchantSchemaVersion(db: D1Database): Promise<number> {
  const recorded = await recordedMerchantSchemaVersion(db) ?? 0;
  const detected = await detectedAppliedMerchantSchemaVersion(db);
  if (recorded >= 4 && detected < 4) return 3;
  return Math.max(recorded, detected);
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
      const sql = migration.version === 4 && await columnExists(db, 'dinkuskit_store_connection', 'organization_id')
        ? migration.sql.replace(/ALTER TABLE dinkuskit_store_connection ADD COLUMN organization_id TEXT;\s*/i, '')
        : migration.sql;
      await applySql(db, sql);
    }
  }
  const to = Math.max(from, await currentMerchantSchemaVersion(db));
  await recordAppliedMerchantVersions(db, to, now);
  return { from, to: await currentMerchantSchemaVersion(db) };
}
