import { AsyncLocalStorage } from 'node:async_hooks';
import production from './entry.mjs';

const ALS = Symbol.for('dinkuskit.merchant.transports.als');
const MAX_BYTES = 8192;
const TIMEOUT_MS = 3000;
const PROOF_PATHS = {
  inventory: { client: 'dinkus-inventory-emdash', path: '/_emdash/api/plugins/dinkus-inventory/store-proof' },
  payments: { client: 'dinkus-payments-emdash', path: '/_emdash/api/plugins/dinkus-payments/store-proof' },
};
const MAILBOX = new Map();

function storage() {
  if (!globalThis[ALS]) globalThis[ALS] = new AsyncLocalStorage();
  return globalThis[ALS];
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
  });
}

function emailDeliveryFromMemory() {
  return {
    async deliver({ email, url, intent }) {
      MAILBOX.set(email, { intent, url });
      return { delivered: 'test-sink' };
    },
  };
}

async function takeCapturedMail(email) {
  const captured = MAILBOX.get(email);
  if (!captured) return null;
  MAILBOX.delete(email);
  return captured;
}

function tokenFromCaptured(captured) {
  try {
    return new URL(captured.url).searchParams.get('token');
  } catch {
    return null;
  }
}

function concat(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function createProofFetch(env) {
  return async function proofFetch({ siteOrigin, connectionId, clientId, service }) {
    const registered = PROOF_PATHS[service];
    if (!registered || registered.client !== clientId) return { ok: false, reason: 'unregistered_service', transport: 'simulation' };
    if (siteOrigin !== env.TEST_INVENTORY_LOGICAL_ORIGIN) {
      return { ok: false, reason: 'test_origin_not_admitted', transport: 'simulation' };
    }
    const port = Number(env.TEST_INVENTORY_DISPATCHER_PORT);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      return { ok: false, reason: 'proof_dispatcher_unavailable', transport: 'simulation' };
    }
    const url = new URL(registered.path, `http://127.0.0.1:${port}`);
    url.searchParams.set('connection_id', connectionId);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(new Request(url, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { accept: 'application/json' },
      }));
      if (response.redirected || (response.status >= 300 && response.status < 400)) {
        return { ok: false, reason: 'proof_redirect_rejected', transport: 'simulation' };
      }
      if (response.status !== 200) return { ok: false, reason: 'proof_unavailable', transport: 'simulation' };
      const length = Number(response.headers.get('content-length') ?? '0');
      if (length > MAX_BYTES) return { ok: false, reason: 'proof_too_large', transport: 'simulation' };
      const reader = response.body?.getReader();
      if (!reader) return { ok: false, reason: 'proof_empty', transport: 'simulation' };
      const chunks = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BYTES) return { ok: false, reason: 'proof_too_large', transport: 'simulation' };
        chunks.push(value);
      }
      let receipt;
      try {
        receipt = JSON.parse(new TextDecoder().decode(concat(chunks)));
      } catch {
        return { ok: false, reason: 'proof_malformed', transport: 'simulation' };
      }
      if (!receipt || receipt.version !== 2 || receipt.connection_id !== connectionId) {
        return { ok: false, reason: 'proof_malformed', transport: 'simulation' };
      }
      return { ok: true, receipt, transport: 'simulation' };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { ok: false, reason: 'proof_timeout', transport: 'simulation' };
      }
      return { ok: false, reason: 'proof_fetch_blocked', transport: 'simulation' };
    } finally {
      clearTimeout(timer);
    }
  };
}

async function proofRoutes(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/__proof/browser') {
    return new Response(`<!doctype html><html><body>
<p>Test-only captured mailbox. This route does not expose the magic-link token.</p>
<form method="post" action="/__proof/browser/complete">
<label>Email <input type="email" name="email" required maxlength="200"></label>
<button type="submit">Continue to safe callback</button>
</form></body></html>`, {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store' },
    });
  }
  if (request.method === 'POST' && url.pathname === '/__proof/browser/complete') {
    const form = await request.formData();
    const email = String(form.get('email') ?? '').trim().toLowerCase();
    const captured = await takeCapturedMail(email);
    const token = captured ? tokenFromCaptured(captured) : null;
    if (!token) return new Response(null, { status: 303, headers: { location: '/account/sign-in?error=missing_mail' } });
    let verifyPath = `/api/auth/magic-link/verify?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent('/account')}`;
    try {
      const target = new URL(captured.url).searchParams.get('callbackURL');
      if (target) verifyPath = `/api/auth/magic-link/verify?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent(target)}`;
    } catch {}
    const verified = await production.fetch(new Request(new URL(verifyPath, request.url), {
      method: 'GET',
      headers: { origin: new URL(request.url).origin, cookie: request.headers.get('cookie') ?? '' },
      redirect: 'manual',
    }), env, ctx);
    const headers = new Headers({ location: verified.headers.get('location') || '/account', 'cache-control': 'private, no-store' });
    for (const cookie of verified.headers.getSetCookie?.() ?? []) headers.append('set-cookie', cookie);
    return new Response(null, { status: 303, headers });
  }
  if (request.method === 'POST' && url.pathname === '/__proof/mail/take') {
    const body = await request.json().catch(() => null);
    const captured = await takeCapturedMail(body?.email);
    return captured ? json(200, { intent: captured.intent, hasToken: Boolean(tokenFromCaptured(captured)) }) : json(404, { error: 'not_found' });
  }
  return null;
}

export default {
  async fetch(request, env, ctx) {
    return storage().run({
      emailDelivery: emailDeliveryFromMemory(),
      proofFetch: createProofFetch(env),
      testSiteOrigin: env.TEST_INVENTORY_LOGICAL_ORIGIN,
    }, async () => {
      const proof = await proofRoutes(request, env, ctx);
      return proof ?? production.fetch(request, env, ctx);
    });
  },
  scheduled: production.scheduled,
};

export { PluginBridge } from './entry.mjs';
