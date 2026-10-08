// Generated only into ignored loopback fixture builds, never production.
import production from '__PRODUCTION_MAIN__';

const response = (body) => Response.json(body, { headers: { 'cache-control': 'private, no-store' } });

async function state(env) {
  const [migrations, seed, media, setting, plugin, artifacts, accounts, organizations, memberships, selections, grants, bindings] = await Promise.all([
    env.DB.prepare('SELECT name FROM _emdash_migrations ORDER BY name').all(),
    env.DB.prepare('SELECT value FROM options WHERE name = ?').bind('emdash:seed_complete').first(),
    env.DB.prepare('SELECT id, storage_key, content_hash, status FROM media WHERE id = ?').bind('cms-upgrade-media').first(),
    env.DB.prepare('SELECT value FROM options WHERE name = ?').bind('cms-upgrade-setting').first(),
    env.DB.prepare('SELECT plugin_id, version, status, data FROM _plugin_state WHERE plugin_id = ?').bind('dinkuskit-upgrade-fixture').first(),
    env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('_emdash_redirect_state','_emdash_redirect_artifacts','_emdash_redirect_generation_artifacts') ORDER BY name").all(),
    env.MERCHANT_DB.prepare('SELECT user_id, subject, disabled FROM dinkuskit_account ORDER BY user_id').all(),
    env.MERCHANT_DB.prepare('SELECT organization_id, owner_user_id, authority_subject, status FROM dinkuskit_organization ORDER BY organization_id').all(),
    env.MERCHANT_DB.prepare('SELECT organization_id, user_id, role, status, permissions FROM dinkuskit_membership ORDER BY organization_id, user_id').all(),
    env.MERCHANT_DB.prepare('SELECT user_id, organization_id FROM dinkuskit_user_selection ORDER BY user_id').all(),
    env.MERCHANT_DB.prepare('SELECT account_subject, site_id, attested, granted_at FROM dinkuskit_site_grant ORDER BY site_id').all(),
    env.MERCHANT_DB.prepare('SELECT site_id, account_subject, site_origin, service, revoked FROM dinkuskit_site_binding ORDER BY site_id').all(),
  ]);
  return {
    migrations: migrations.results.map(row => row.name),
    preserved: { seed_complete: seed?.value, media, setting, plugin, accounts: accounts.results,
      organizations: organizations.results, memberships: memberships.results,
      selections: selections.results, grants: grants.results, bindings: bindings.results },
    artifacts: artifacts.results.map(row => row.name),
  };
}

async function prepare(env) {
  await env.DB.batch([
    env.DB.prepare('INSERT INTO media (id, filename, mime_type, size, width, height, alt, caption, storage_key, content_hash, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind('cms-upgrade-media', 'upgrade-proof.png', 'image/png', 12, 1, 1, 'Synthetic upgrade reference', '', 'cms-upgrade-media/proof.png', 'synthetic-content-hash', 'ready'),
    env.DB.prepare('INSERT INTO options (name, value) VALUES (?, ?)')
      .bind('cms-upgrade-setting', JSON.stringify({ media_id: 'cms-upgrade-media', value: 'preserved-setting' })),
    env.DB.prepare('INSERT INTO _plugin_state (plugin_id, version, status, data) VALUES (?, ?, ?, ?)')
      .bind('dinkuskit-upgrade-fixture', '1.0.1-fixture', 'active', JSON.stringify({ media_id: 'cms-upgrade-media', value: 'preserved-plugin-state' })),
  ]);
  await env.MERCHANT_DB.batch([
    env.MERCHANT_DB.prepare('INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)')
      .bind('upgrade-owner', 'Synthetic owner', 'upgrade-owner@fixture.invalid', 1, 1, 1),
    env.MERCHANT_DB.prepare('INSERT INTO dinkuskit_account (user_id, subject, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .bind('upgrade-owner', 'upgrade-person', 1, 1),
    env.MERCHANT_DB.prepare('INSERT INTO dinkuskit_organization (organization_id, name, owner_user_id, authority_subject, admission_status, created_by_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind('upgrade-org', 'Synthetic upgrade organization', 'upgrade-owner', 'upgrade-authority', 'admitted', 'upgrade-owner', 1, 1),
    env.MERCHANT_DB.prepare('INSERT INTO dinkuskit_membership (organization_id, user_id, role, permissions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind('upgrade-org', 'upgrade-owner', 'owner', '["membership:manage","inventory:admin"]', 1, 1),
    env.MERCHANT_DB.prepare('INSERT INTO dinkuskit_user_selection (user_id, organization_id, updated_at) VALUES (?, ?, ?)')
      .bind('upgrade-owner', 'upgrade-org', 1),
    env.MERCHANT_DB.prepare('INSERT INTO dinkuskit_site_grant (account_subject, site_id, attested, granted_at) VALUES (?, ?, ?, ?)')
      .bind('upgrade-authority', 'upgrade-site', 1, 1),
    env.MERCHANT_DB.prepare('INSERT INTO dinkuskit_site_binding (site_id, site_origin, account_subject, service, granted_at) VALUES (?, ?, ?, ?, ?)')
      .bind('upgrade-site', 'https://upgrade-site.example.test', 'upgrade-authority', 'inventory', 1),
  ]);
}

export default {
  ...production,
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/__upgrade/prepare' && env.UPGRADE_BASELINE === '1.0.1') {
      await prepare(env);
      return response(await state(env));
    }
    if (request.method === 'GET' && url.pathname === '/__upgrade/state') return response(await state(env));
    return production.fetch(request, env, ctx);
  },
};
