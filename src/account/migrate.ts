import { CURRENT_MERCHANT_SCHEMA_VERSION } from './config.ts';
import { SQL_0001 as sql0001, SQL_0002 as sql0002, SQL_0003 as sql0003 } from './migration-sql.ts';

type Migration = { version: number; name: string; sql: string };

export const MERCHANT_MIGRATIONS: readonly Migration[] = [
  { version: 1, name: '0001_better_auth.sql', sql: sql0001 },
  { version: 2, name: '0002_dinkuskit.sql', sql: sql0002 },
  { version: 3, name: '0003_store_connect.sql', sql: sql0003 },
];

function statements(sql: string): string[] {
  return sql
    .split(';')
    .map(part => part.replace(/--[^\n]*/g, '').trim())
    .filter(Boolean);
}

async function tableExists(db: D1Database, name: string): Promise<boolean> {
  const row = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
  ).bind(name).first<{ name: string }>();
  return Boolean(row?.name);
}

export async function currentMerchantSchemaVersion(db: D1Database): Promise<number> {
  if (await tableExists(db, 'dinkuskit_schema_migrations')) {
    const row = await db.prepare('SELECT MAX(version) AS v FROM dinkuskit_schema_migrations').first<{ v: number | null }>();
    return row?.v ?? 0;
  }
  if (await tableExists(db, 'dinkuskit_account')) return 2;
  return 0;
}

async function applySql(db: D1Database, sql: string): Promise<void> {
  const parts = statements(sql);
  if (parts.length === 0) return;
  await db.batch(parts.map(part => db.prepare(part)));
}

export async function applyPendingMerchantMigrations(db: D1Database): Promise<{ from: number; to: number }> {
  const from = await currentMerchantSchemaVersion(db);
  if (from >= CURRENT_MERCHANT_SCHEMA_VERSION) return { from, to: from };
  const now = Math.floor(Date.now() / 1000);
  for (const migration of MERCHANT_MIGRATIONS) {
    if (migration.version <= from) continue;
    if (migration.version === 3 && !(await tableExists(db, 'dinkuskit_schema_migrations'))) {
      const connectionStatements = statements(migration.sql).filter(part => !part.includes('dinkuskit_schema_migrations'));
      if (connectionStatements.length) await db.batch(connectionStatements.map(part => db.prepare(part)));
      await db.prepare(
        'CREATE TABLE IF NOT EXISTS dinkuskit_schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)',
      ).run();
    } else {
      await applySql(db, migration.sql);
    }
    if (await tableExists(db, 'dinkuskit_schema_migrations')) {
      await db.prepare(
        'INSERT OR IGNORE INTO dinkuskit_schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
      ).bind(migration.version, migration.name, now).run();
    }
  }
  if (from === 2 && await tableExists(db, 'dinkuskit_schema_migrations')) {
    await db.batch([
      db.prepare('INSERT OR IGNORE INTO dinkuskit_schema_migrations (version, name, applied_at) VALUES (1, ?, ?)').bind('0001_better_auth.sql', now),
      db.prepare('INSERT OR IGNORE INTO dinkuskit_schema_migrations (version, name, applied_at) VALUES (2, ?, ?)').bind('0002_dinkuskit.sql', now),
    ]);
  }
  return { from, to: await currentMerchantSchemaVersion(db) };
}
