import { AsyncLocalStorage } from 'node:async_hooks';
import production from './entry.mjs';
import { fetchStoreProofReceipt } from './proof-fetch.mjs';
import { inventoryOverviewRuntime } from './inventory-overview-transport.mjs';

const ALS = Symbol.for('dinkuskit.merchant.transports.als');

function transportStorage() {
  if (!globalThis[ALS]) globalThis[ALS] = new AsyncLocalStorage();
  return globalThis[ALS];
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
  });
}

function emailDeliveryFromCapture(kv) {
  return {
    async deliver({ email, url, intent }) {
      await kv.put(email, JSON.stringify({ intent, url }));
      return { delivered: 'test-sink' };
    },
  };
}

function simulationFetch(kv, db) {
  return async ({ connectionId, siteOrigin }) => {
    const raw = await kv.get(connectionId);
    if (!raw) return { ok: false, reason: 'simulation_receipt_missing', transport: 'simulation' };
    const stored = JSON.parse(raw);
    if (stored.delay_ms) await new Promise(resolve => setTimeout(resolve, Number(stored.delay_ms)));
    if (stored.expire_after_delay && db) {
      await db.prepare('UPDATE dinkuskit_store_connection SET expires_at = 1 WHERE connection_id = ?').bind(connectionId).run();
    }
    if (stored.revoke_owner_after_delay && db) {
      await db.prepare(`UPDATE dinkuskit_membership SET status = 'removed' WHERE role = 'owner' AND organization_id = (
        SELECT o.organization_id FROM dinkuskit_organization o JOIN dinkuskit_store_connection c ON c.account_subject = o.authority_subject WHERE c.connection_id = ?
      )`).bind(connectionId).run();
    }
    const { delay_ms: _delay, expire_after_delay: _expire, revoke_owner_after_delay: _revoke, ...receipt } = stored;
    if (receipt.site_origin !== siteOrigin) return { ok: false, reason: 'simulation_origin_mismatch', transport: 'simulation' };
    return { ok: true, receipt, transport: 'simulation' };
  };
}

function testTransports(env) {
  const mail = env.MERCHANT_MAIL_CAPTURE;
  const proof = env.MERCHANT_PROOF_SIMULATION;
  return {
    inventoryOverview: inventoryOverviewRuntime(env),
    operatorDirectory: operatorDirectoryRuntime(env),
    emailDelivery: mail ? emailDeliveryFromCapture(mail) : undefined,
    proofFetch: proof ? simulationFetch(proof, env.MERCHANT_DB) : undefined,
  };
}

function operatorDirectoryRuntime(env) {
  let calls = 0;
  return {
    async authorize({ userId, resource }) {
      const fixture = JSON.parse(await env.MERCHANT_INVENTORY_OVERVIEW.get('operator-directory') ?? '{}');
      const grant = (fixture.grants ?? []).find(item => item.userId === userId
        && item.resourceType === resource.type
        && item.resourceId === resource.id);
      if (!grant) return false;
      if (++calls === (fixture.change_at_call ?? 1) && fixture.change_during_read) {
        await new Promise(resolve => setTimeout(resolve, Number(fixture.delay_ms ?? 10)));
        const change = fixture.change_during_read;
        if (change === 'disable_login') await env.MERCHANT_DB.prepare('UPDATE dinkuskit_account SET disabled = 1 WHERE user_id = ?').bind(userId).run();
        if (change === 'revoke_grant') await env.MERCHANT_INVENTORY_OVERVIEW.put('operator-directory', JSON.stringify({ ...fixture, grants: [] }));
        if (change === 'change_subject') await env.MERCHANT_DB.prepare('UPDATE dinkuskit_account SET subject = ? WHERE user_id = ?').bind('synthetic-changed-subject', userId).run();
        if (change === 'remove_member') await env.MERCHANT_DB.prepare(`UPDATE dinkuskit_membership SET status = 'removed' WHERE user_id = ?`).bind(userId).run();
      }
      const current = JSON.parse(await env.MERCHANT_INVENTORY_OVERVIEW.get('operator-directory') ?? '{}');
      return (current.grants ?? []).some(item => item.userId === userId && item.resourceType === resource.type && item.resourceId === resource.id);
    },
  };
}

async function takeCapturedMail(env, email) {
  const raw = email ? await env.MERCHANT_MAIL_CAPTURE?.get(email) : null;
  if (!raw) return null;
  await env.MERCHANT_MAIL_CAPTURE.delete(email);
  return JSON.parse(raw);
}

function tokenFromCaptured(captured) {
  try {
    return new URL(captured.url).searchParams.get('token');
  } catch {
    return null;
  }
}

async function proofRoutes(request, env, ctx) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/__proof/')) return null;

  if (request.method === 'GET' && url.pathname === '/__proof/browser') {
    return new Response(`<!doctype html><html><head><title>Test Mailbox</title></head><body>
<div style="padding:1rem;font-family:sans-serif;border:2px dashed #ca8a04;background:#fefce8;color:#713f12;">
  <p><strong>[Test only / no external email]</strong></p>
  <p>Local synthetic test mailbox sink. Enter merchant email to follow captured magic link and return to safe callback without exposing the token.</p>
  <form method="post" action="/__proof/browser/complete">
    <label>Email <input type="email" name="email" required maxlength="200"></label>
    <button type="submit">Continue to safe callback</button>
  </form>
</div>
</body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store' } });
  }

  if (request.method === 'POST' && url.pathname === '/__proof/browser/complete') {
    const form = await request.formData();
    const email = String(form.get('email') ?? '').trim().toLowerCase();
    const captured = await takeCapturedMail(env, email);
    const token = captured ? tokenFromCaptured(captured) : null;
    if (!token) {
      return new Response(null, { status: 303, headers: { location: '/account/sign-in?error=missing_mail', 'cache-control': 'private, no-store' } });
    }
    let verifyPath = `/api/auth/magic-link/verify?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent('/account')}`;
    try {
      const parsedCaptured = new URL(captured.url);
      const targetCallback = parsedCaptured.searchParams.get('callbackURL');
      if (targetCallback) {
        verifyPath = `${parsedCaptured.pathname}?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent(targetCallback)}`;
      }
    } catch {}
    const rewritten = new Request(new URL(verifyPath, request.url), {
      method: 'GET',
      headers: { origin: new URL(request.url).origin, cookie: request.headers.get('cookie') ?? '' },
      redirect: 'manual',
    });
    const verified = await production.fetch(rewritten, env, ctx);
    const headers = new Headers();
    headers.set('location', verified.headers.get('location') || '/account');
    headers.set('cache-control', 'private, no-store');
    for (const cookie of verified.headers.getSetCookie?.() ?? []) headers.append('set-cookie', cookie);
    return new Response(null, { status: 303, headers });
  }

  if (request.method === 'POST' && url.pathname === '/__proof/mail/take') {
    const body = await request.json();
    const captured = await takeCapturedMail(env, body.email);
    if (!captured) return json(404, { error: 'not_found' });
    return json(200, { intent: captured.intent, hasToken: Boolean(tokenFromCaptured(captured)) });
  }

  if (url.pathname === '/__proof/inventory-overview') {
    if (request.method === 'GET') return json(200, JSON.parse(await env.MERCHANT_INVENTORY_OVERVIEW.get('observed') ?? '{}'));
    const fixture = await request.json();
    await env.MERCHANT_INVENTORY_OVERVIEW.put('fixture', JSON.stringify(fixture));
    if (fixture.seed_bindings) {
      const org = await env.MERCHANT_DB.prepare('SELECT authority_subject FROM dinkuskit_organization WHERE organization_id = ?').bind(fixture.organizationId).first();
      if (!org) return json(400, { error: 'synthetic_org_missing' });
      for (const [siteId, origin, revoked] of [['site-north', 'https://north.example.test', 0], ['site-south', 'https://south.example.test', 1]]) {
        await env.MERCHANT_DB.prepare(`INSERT OR REPLACE INTO dinkuskit_site_binding (site_id,site_origin,account_subject,service,revoked,granted_at) VALUES (?, ?, ?, 'inventory', ?, 1)`).bind(siteId, origin, org.authority_subject, revoked).run();
      }
    }
    return json(200, { syntheticOnly: true });
  }

  if (url.pathname === '/__proof/operator-directory' && request.method === 'POST') {
    const fixture = await request.json();
    if (fixture.detach_user) {
      await env.MERCHANT_DB.prepare('DELETE FROM dinkuskit_user_selection WHERE user_id = ?').bind(fixture.detach_user).run();
      await env.MERCHANT_DB.prepare('DELETE FROM dinkuskit_membership WHERE user_id = ?').bind(fixture.detach_user).run();
    }
    for (const item of fixture.organization_names ?? []) {
      await env.MERCHANT_DB.prepare('UPDATE dinkuskit_organization SET name = ? WHERE organization_id = ?').bind(item.name, item.organizationId).run();
    }
    await env.MERCHANT_INVENTORY_OVERVIEW.put('operator-directory', JSON.stringify(fixture));
    return json(200, { syntheticOnly: true });
  }

  if (url.pathname === '/__proof/foundation') {
    const email = url.searchParams.get('email') ?? '';
    if (request.method === 'GET') {
      const profile = await env.MERCHANT_DB.prepare('SELECT p.* FROM dinkuskit_signup_profile p WHERE email = ?').bind(email).first();
      const user = await env.MERCHANT_DB.prepare('SELECT id FROM "user" WHERE email = ?').bind(email).first();
      const stats = await env.MERCHANT_DB.prepare(`SELECT
        (SELECT COUNT(*) FROM dinkuskit_admission WHERE slot_number IS NOT NULL) AS slots,
        (SELECT COUNT(*) FROM dinkuskit_organization WHERE admission_status = 'admitted') AS admitted,
        (SELECT COUNT(*) FROM dinkuskit_organization o WHERE admission_status = 'admitted' AND NOT EXISTS (
          SELECT 1 FROM dinkuskit_admission a WHERE a.first_organization_id = o.organization_id AND a.slot_number IS NOT NULL)) AS unallocated`).first();
      return json(200, { profile, userId: user?.id ?? null, stats });
    }
    const body = await request.json();
    if (body.action === 'expire_signup') await env.MERCHANT_DB.prepare('UPDATE dinkuskit_signup_attempt SET expires_at = 1').run();
    else if (body.action === 'remove_member') await env.MERCHANT_DB.prepare(`UPDATE dinkuskit_membership SET status = 'removed'
      WHERE organization_id = ? AND user_id = (SELECT id FROM "user" WHERE email = ?) AND role <> 'owner'`).bind(body.organizationId, body.email).run();
    else if (body.action === 'seed_last_slot') {
      const t = Math.floor(Date.now() / 1000);
      for (let i = 1; i < 50; i++) {
        const userId = 'synthetic-seed-' + i;
        const orgId = 'synthetic-org-' + i;
        await env.MERCHANT_DB.batch([
          env.MERCHANT_DB.prepare(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, 'Synthetic fixture', ?, 1, ?, ?)`).bind(userId, userId + '@example.com', t, t),
          env.MERCHANT_DB.prepare(`INSERT INTO dinkuskit_organization (organization_id, name, status, owner_user_id, authority_subject, admission_status, created_by_user_id, created_at, updated_at)
            VALUES (?, 'Synthetic fixture', 'active', ?, ?, 'admitted', ?, ?, ?)`).bind(orgId, userId, orgId, userId, t, t),
          env.MERCHANT_DB.prepare('INSERT INTO dinkuskit_admission (user_id, first_organization_id, slot_number, created_at) VALUES (?, ?, ?, ?)').bind(userId, orgId, i, t),
        ]);
      }
    } else return json(400, { error: 'unknown_fixture_action' });
    return json(200, { syntheticOnly: true });
  }

  if (request.method === 'POST' && url.pathname === '/__proof/expire-verification') {
    if (!env.MERCHANT_DB) return json(503, { error: 'merchant_unavailable' });
    await env.MERCHANT_DB.prepare("UPDATE verification SET expiresAt = '1970-01-01T00:00:00.000Z'").run();
    return json(200, { expired: true });
  }

  if (request.method === 'POST' && url.pathname === '/__proof/expire-connection') {
    const body = await request.json();
    if (!body?.connection_id || !env.MERCHANT_DB) return json(400, { error: 'invalid_connection' });
    await env.MERCHANT_DB.prepare('UPDATE dinkuskit_store_connection SET expires_at = 1 WHERE connection_id = ?').bind(body.connection_id).run();
    return json(200, { expired: true });
  }

  if (request.method === 'POST' && url.pathname === '/__proof/receipt') {
    const body = await request.json();
    if (!body?.connection_id) return json(400, { error: 'invalid_receipt' });
    await env.MERCHANT_PROOF_SIMULATION.put(body.connection_id, JSON.stringify(body));
    return json(200, { stored: true, transport: 'simulation' });
  }

  if (request.method === 'GET' && url.pathname === '/__proof/grant') {
    const siteId = url.searchParams.get('site_id') ?? '';
    if (!siteId || !env.MERCHANT_DB) return json(400, { error: 'invalid_site' });
    const row = await env.MERCHANT_DB.prepare(
      'SELECT site_id, revoked FROM dinkuskit_site_binding WHERE site_id = ?',
    ).bind(siteId).first();
    return json(200, { present: Boolean(row), revoked: row?.revoked === 1 });
  }

  if (request.method === 'POST' && url.pathname === '/__proof/fetch-probe') {
    const body = await request.json();
    const result = await fetchStoreProofReceipt({
      siteOrigin: String(body.siteOrigin ?? ''),
      connectionId: String(body.connectionId ?? 'probe'),
    });
    return json(result.ok ? 200 : 403, result);
  }

  return json(404, { error: 'not_found' });
}

export default {
  async fetch(request, env, ctx) {
    return transportStorage().run(testTransports(env), async () => {
      const proof = await proofRoutes(request, env, ctx);
      if (proof) return proof;
      return production.fetch(request, env, ctx);
    });
  },
  scheduled: production.scheduled,
};

export { PluginBridge } from './entry.mjs';
