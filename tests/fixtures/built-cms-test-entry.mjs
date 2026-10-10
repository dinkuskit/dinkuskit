import { AsyncLocalStorage } from 'node:async_hooks';
import production from './entry.mjs';
import { fetchStoreProofReceipt } from './proof-fetch.mjs';
import { runWithCmsProof } from './cms-proof-als.mjs';

let admissionMode = 'success';
const admissionMessages = [];
let browserCmsCookies = [];

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
    const { delay_ms: _delay, expire_after_delay: _expire, ...receipt } = stored;
    if (receipt.site_origin !== siteOrigin) return { ok: false, reason: 'simulation_origin_mismatch', transport: 'simulation' };
    return { ok: true, receipt, transport: 'simulation' };
  };
}

function testTransports(env) {
  const mail = env.MERCHANT_MAIL_CAPTURE;
  const proof = env.MERCHANT_PROOF_SIMULATION;
  return {
    testSiteOrigin: env.MERCHANT_BASE_URL,
    admissionEmail: { async send(message) {
      if (admissionMode === 'failure') throw new Error('synthetic failure');
      if (admissionMode === 'slow') await new Promise(resolve => setTimeout(resolve, 100));
      admissionMessages.push(message);
      return { messageId: 'synthetic-admission' };
    } },
    emailDelivery: mail ? emailDeliveryFromCapture(mail) : undefined,
    proofFetch: proof ? simulationFetch(proof, env.MERCHANT_DB) : undefined,
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

  // This entry is never imported by production. All records belong to an isolated local fixture.
  if (url.pathname === '/__proof/cms-browser' && request.method === 'POST') {
    browserCmsCookies = (await request.json()).cookies;
    return json(200, { ready: true });
  }
  if (url.pathname === '/__proof/cms-browser' && request.method === 'GET') {
    const headers = new Headers({ location: '/_emdash/admin/plugins/dinkuskit-operator/approvals', 'cache-control': 'no-store' });
    for (const cookie of browserCmsCookies) headers.append('set-cookie', cookie + '; Path=/; HttpOnly; SameSite=Lax');
    return new Response(null, { status: 303, headers });
  }
  if (url.pathname === '/__proof/approvals') {
    const db = env.MERCHANT_DB;
    if (request.method === 'POST') {
      const b = await request.json();
      if (b.mode) admissionMode = b.mode;
      if (b.cms) await env.DB.prepare('UPDATE users SET role=?,disabled=? WHERE email=?')
        .bind(b.cms.role, b.cms.disabled, 'editor@cms.example').run();
      // Synthetic denied-only account and removed-membership proof; never part of production.
      if (b.removeMembership) await db.prepare(`UPDATE dinkuskit_membership SET status='removed'
        WHERE organization_id=? AND user_id=(SELECT id FROM "user" WHERE email=?)`)
        .bind(b.removeMembership.organizationId, b.removeMembership.email).run();
      // Synthetic store that pressed Connect for the given services.
      if (b.store) {
        const org = await db.prepare('SELECT authority_subject FROM dinkuskit_organization WHERE organization_id=?').bind(b.store.organizationId).first();
        const t = Math.floor(Date.now() / 1000);
        await db.prepare('INSERT INTO dinkuskit_store_identity (site_id, site_origin, account_subject, created_at) VALUES (?,?,?,?)')
          .bind(b.store.siteId, b.store.origin, org.authority_subject, t).run();
        for (const service of b.store.services) await db.prepare('INSERT INTO dinkuskit_service_grant (site_id, service, revoked, granted_at) VALUES (?,?,0,?)')
          .bind(b.store.siteId, service, t).run();
      }
      if (b.profile) {
        const owner = await db.prepare('SELECT owner_user_id FROM dinkuskit_organization WHERE organization_id=?').bind(b.organizationId).first();
        if (b.profile === 'missing') await db.prepare('DELETE FROM dinkuskit_signup_profile WHERE user_id=?').bind(owner.owner_user_id).run();
        else await db.prepare('UPDATE dinkuskit_signup_profile SET service_channel=?,email_verified=?,phone_verified=? WHERE user_id=?')
          .bind(b.profile.channel, b.profile.emailVerified, b.profile.phoneVerified, owner.owner_user_id).run();
      }
      return json(200, { configured: true });
    }
    const id = url.searchParams.get('id');
    const org = await db.prepare('SELECT organization_id,status,admission_status,authority_subject FROM dinkuskit_organization WHERE organization_id=?').bind(id).first();
    const audit = await db.prepare('SELECT * FROM dinkuskit_organization_approval_audit WHERE organization_id=?').bind(id).first();
    const notices = await db.prepare('SELECT * FROM dinkuskit_organization_notification WHERE organization_id=?').bind(id).all();
    const allocations = await db.prepare('SELECT * FROM dinkuskit_admission ORDER BY user_id').all();
    return json(200, { org, audit, notices: notices.results, allocations: allocations.results,
      messages: admissionMessages, grants: await db.prepare('SELECT count(*) n FROM dinkuskit_service_grant').first() });
  }

  if (request.method === 'GET' && url.pathname === '/__proof/browser') {
    return new Response(`<!doctype html><html><body>
<form method="post" action="/__proof/browser/complete">
<label>Email <input type="email" name="email" required maxlength="200"></label>
<button type="submit">Continue</button>
</form>
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
    const rewritten = new Request(new URL(`/api/auth/magic-link/verify?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent('/account')}`, request.url), {
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
      'SELECT i.site_id, g.revoked FROM dinkuskit_store_identity i JOIN dinkuskit_service_grant g ON g.site_id = i.site_id WHERE i.site_id = ? AND g.service = ?',
    ).bind(siteId, url.searchParams.get('service') ?? 'inventory').first();
    return json(200, { present: Boolean(row), revoked: row?.revoked === 1 });
  }

  if (request.method === 'POST' && url.pathname === '/__proof/fetch-probe') {
    const body = await request.json();
    const result = await fetchStoreProofReceipt({
      siteOrigin: String(body.siteOrigin ?? ''),
      connectionId: String(body.connectionId ?? 'probe'),
      clientId: String(body.clientId ?? 'dinkus-inventory-emdash'),
      service: String(body.service ?? 'inventory'),
    });
    return json(result.ok ? 200 : 403, result);
  }

  return json(404, { error: 'not_found' });
}

export default {
  async fetch(request, env, ctx) {
    return runWithCmsProof(() => transportStorage().run(testTransports(env), async () => {
      const proof = await proofRoutes(request, env, ctx);
      if (proof) return proof;
      return production.fetch(request, env, ctx);
    }));
  },
  scheduled: production.scheduled,
};

export { PluginBridge } from './entry.mjs';
