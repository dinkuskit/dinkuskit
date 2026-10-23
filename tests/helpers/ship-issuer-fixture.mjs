import Database from 'better-sqlite3';
import { readFile, readdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createLocalTestKeys } from '../../src/account/jwt.ts';
import { hashKey, issueStorePass, newStoreKey } from '../../src/account/store-passes.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
export const SITE = '7d0c3f0e-5d8b-4f43-9e43-2f9ad2c1a001';
export const OTHER_SITE = '7d0c3f0e-5d8b-4f43-9e43-2f9ad2c1a002';

export async function fixture() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  for (const file of (await readdir(new URL('../../migrations/merchant/', import.meta.url))).filter(n => n.endsWith('.sql')).sort()) {
    sqlite.exec(await readFile(new URL(`../../migrations/merchant/${file}`, import.meta.url), 'utf8'));
  }
  const db = { prepare(sql) {
    const stmt = sqlite.prepare(sql); let args = [];
    const q = { bind(...values) { args = values; return q; }, async first() { return stmt.get(...args) ?? null; }, async all() { return { success: true, results: stmt.all(...args) }; }, async run() { return { success: true, meta: { changes: stmt.run(...args).changes } }; }, execute() { return { success: true, meta: { changes: stmt.run(...args).changes } }; } };
    return q;
  }, async batch(queries) { return sqlite.transaction(() => queries.map(q => q.execute()))(); } };
  const users = ['alice', 'admin', 'clerk', 'staff', 'bob'];
  for (const user of users) {
    sqlite.prepare('INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?, ?, ?, 1, 1, 1)').run(user, user, `${user}@example.test`);
    sqlite.prepare('INSERT INTO dinkuskit_account (user_id,subject,created_at,updated_at) VALUES (?, ?, 1, 1)').run(user, `personal-${user}`);
  }
  for (const [org, owner] of [['a', 'alice'], ['b', 'bob']]) {
    sqlite.prepare("INSERT INTO dinkuskit_organization (organization_id,name,status,owner_user_id,authority_subject,admission_status,created_by_user_id,created_at,updated_at) VALUES (?, ?, 'active', ?, ?, 'admitted', ?, 1, 1)").run(org, org, owner, `org-${org}`, owner);
    sqlite.prepare("INSERT INTO dinkuskit_membership VALUES (?, ?, 'owner', 'active', '[]', 1, 1)").run(org, owner);
    sqlite.prepare('INSERT INTO dinkuskit_user_selection VALUES (?, ?, 1)').run(owner, org);
  }
  sqlite.prepare("INSERT INTO dinkuskit_membership VALUES ('a', 'admin', 'administrator', 'active', '[\"membership:manage\"]', 1, 1)").run();
  sqlite.prepare("INSERT INTO dinkuskit_membership VALUES ('a', 'clerk', 'member', 'active', '[\"ship:labels\"]', 1, 1)").run();
  sqlite.prepare("INSERT INTO dinkuskit_membership VALUES ('a', 'staff', 'member', 'active', '[\"site:view\"]', 1, 1)").run();
  sqlite.prepare("INSERT INTO dinkuskit_store_identity VALUES (?, 'https://store-a.example.test', 'org-a', 1)").run(SITE);
  sqlite.prepare("INSERT INTO dinkuskit_store_identity VALUES (?, 'https://store-b.example.test', 'org-b', 1)").run(OTHER_SITE);
  sqlite.prepare("INSERT INTO dinkuskit_service_grant (site_id, service, revoked, granted_at) VALUES (?, 'ship', 0, 1)").run(SITE);
  const session = (user, expiresAtMs = Date.now() + 7 * DAY_MS) => {
    const id = `session-${user}-${randomBytes(4).toString('hex')}`;
    sqlite.prepare('INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, new Date(expiresAtMs).toISOString(), randomBytes(16).toString('hex'), new Date().toISOString(), new Date().toISOString(), user);
    return { userId: user, sessionId: id };
  };
  const keys = await createLocalTestKeys();
  return { sqlite, db, session, keys, privateJwkJson: JSON.stringify(keys.privateJwk), close() { sqlite.close(); } };
}

/** A plugin's own key, as Connect would save it (store-connect-080): only its hash is kept. */
export async function pluginKey(f, siteId, plugin, user = 'alice') {
  const key = newStoreKey();
  f.sqlite.prepare('INSERT OR REPLACE INTO dinkuskit_plugin_key (site_id, plugin, key_hash, created_by_user_id, created_at) VALUES (?, ?, ?, ?, 1)').run(siteId, plugin, await hashKey(key), user);
  return key;
}

/** Synthetic local issuer producer for cross-repository contract proof. Never logs credentials. */
export async function mintSandboxPass(generation = 'test-generation-1') {
  const f = await fixture();
  try {
    const registration = { siteId: SITE, generation };
    f.sqlite.prepare("INSERT INTO dinkuskit_commerce_settings (site_id,shipping_mode,shipping_minor,shipping_revision,live,updated_by_user_id,updated_at) VALUES (?, 'free', 0, 1, 0, 'alice', 1)").run(SITE);
    const key = await pluginKey(f, SITE, 'commerce');
    const response = await issueStorePass({ db: f.db, authorization: `Bearer ${key}`, body: { site_id: SITE, scope: 'ship:orders', audience: 'dinkus-ship-sandbox', generation }, registration, privateJwkJson: f.privateJwkJson });
    if (response.status !== 200) throw new Error('synthetic_issuer_failed');
    const body = await response.json();
    return { token: body.access_token, publicJwk: f.keys.publicJwk, siteId: SITE, generation };
  } finally { f.close(); }
}

/**
 * Synthetic production Ship passes from the real issuer, for proof that Ship's admin
 * routes take them: a ship:admin and a ship:orders pass for SITE, a ship:admin pass for
 * OTHER_SITE (another business), and a ship:admin pass for SITE issued ten minutes ago,
 * so already expired. In-process only; never log or persist the tokens.
 */
export async function mintShipAdminPasses() {
  const f = await fixture();
  try {
    f.sqlite.prepare("INSERT INTO dinkuskit_service_grant (site_id, service, revoked, granted_at) VALUES (?, 'ship', 0, 1)").run(OTHER_SITE);
    const key = await pluginKey(f, SITE, 'ship'), ordersKey = await pluginKey(f, SITE, 'commerce');
    const otherKey = await pluginKey(f, OTHER_SITE, 'ship', 'bob');
    const mint = async (storeKey, siteId, scope) => {
      const response = await issueStorePass({ db: f.db, authorization: `Bearer ${storeKey}`, body: { site_id: siteId, scope, audience: 'dinkus-ship' }, privateJwkJson: f.privateJwkJson });
      if (response.status !== 200) throw new Error('synthetic_issuer_failed');
      return (await response.json()).access_token;
    };
    const admin = await mint(key, SITE, 'ship:admin');
    const orders = await mint(ordersKey, SITE, 'ship:orders');
    const otherAdmin = await mint(otherKey, OTHER_SITE, 'ship:admin');
    const now = Date.now;
    Date.now = () => now() - 10 * 60 * 1000;
    let expiredAdmin;
    try { expiredAdmin = await mint(key, SITE, 'ship:admin'); } finally { Date.now = now; }
    return { publicJwk: f.keys.publicJwk, siteId: SITE, otherSiteId: OTHER_SITE, admin, orders, otherAdmin, expiredAdmin };
  } finally { f.close(); }
}
