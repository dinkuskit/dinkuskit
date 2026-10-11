import { timingSafeEqual } from 'node:crypto';

// This module is copied only into the disposable local test build.
export const AGENT_IDENTITIES = Object.freeze({
  owner: 'agent-owner@example.test',
  staff: 'agent-staff@example.test',
});
export const AGENT_STORE_ORIGIN = 'https://agent-store.example.test';
export const AGENT_RUN_MS = 10 * 60 * 1000;
export const AGENT_REQUEST_LIMIT = 160;
const BODY_LIMIT = 8192;

export function isLocalOrigin(value) {
  try {
    const url = new URL(value);
    return url.origin === value && url.protocol === 'http:'
      && ['localhost', '127.0.0.1'].includes(url.hostname)
      && !url.username && !url.password;
  } catch { return false; }
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: {
    'content-type': 'application/json', 'cache-control': 'private, no-store',
    'referrer-policy': 'no-referrer',
  } });
}

async function boundedBody(request) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > BODY_LIMIT) { await reader.cancel(); throw new Error('body_limit'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}

export function createAgentTestEntry(testWorker, now = Date.now) {
  let requests = 0;
  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      // No key, test binding, or request host can turn this into a remote lane.
      if (!isLocalOrigin(env.MERCHANT_BASE_URL)
        || !/^[A-Za-z0-9_-]{43}$/.test(env.AGENT_TEST_KEY ?? '')
        || !Number.isSafeInteger(Number(env.AGENT_TEST_EXPIRES_AT))
        || Number(env.AGENT_TEST_EXPIRES_AT) > now() + AGENT_RUN_MS) return json(503, { error: 'local_configuration_required' });
      if (now() >= Number(env.AGENT_TEST_EXPIRES_AT)) return json(410, { error: 'run_expired' });
      if (url.origin !== env.MERCHANT_BASE_URL || request.headers.get('origin') !== env.MERCHANT_BASE_URL) return json(403, { error: 'origin_denied' });
      const presentedKey = new TextEncoder().encode(request.headers.get('x-agent-test-key') ?? '');
      const expectedKey = new TextEncoder().encode(env.AGENT_TEST_KEY);
      if (presentedKey.length !== expectedKey.length || !timingSafeEqual(presentedKey, expectedKey)) return json(401, { error: 'run_key_required' });
      if (++requests > AGENT_REQUEST_LIMIT) return json(429, { error: 'run_request_limit' });
      if (!['GET', 'POST'].includes(request.method)) return json(405, { error: 'method_denied' });
      let body;
      try { body = await boundedBody(request); } catch { return json(413, { error: 'body_limit' }); }
      const delegate = (path, contents = body, contentType = request.headers.get('content-type')) => {
        const headers = new Headers(request.headers);
        headers.delete('x-agent-test-key'); headers.delete('content-length');
        if (contentType) headers.set('content-type', contentType);
        return testWorker.fetch(new Request(new URL(path, env.MERCHANT_BASE_URL), {
          method: request.method, headers, ...(request.method === 'POST' ? { body: contents } : {}), redirect: 'manual',
        }), env, ctx);
      };
      if (url.pathname.startsWith('/__agent/')) {
        if (request.method !== 'POST' || url.search) return json(404, { error: 'not_found' });
        let input;
        try { input = JSON.parse(body); } catch { return json(400, { error: 'invalid_json' }); }
        if (!input || typeof input !== 'object' || Array.isArray(input)) return json(400, { error: 'invalid_input' });
        if (url.pathname === '/__agent/auth/start' || url.pathname === '/__agent/auth/complete') {
          const fields = url.pathname.endsWith('/start') ? ['identity', 'intent'] : ['identity'];
          if (Object.keys(input).some(key => !fields.includes(key))) return json(400, { error: 'invalid_input' });
          const email = typeof input.identity === 'string' && Object.hasOwn(AGENT_IDENTITIES, input.identity) ? AGENT_IDENTITIES[input.identity] : null;
          if (!email) return json(403, { error: 'synthetic_identity_required' });
          if (url.pathname.endsWith('/start')) {
            if (!['signup', 'sign-in', 'recovery'].includes(input.intent)) return json(400, { error: 'invalid_intent' });
            const form = new URLSearchParams({ email, phone: '+15555550123', service_channel: 'email', agreement: 'on' });
            return delegate(`/account/${input.intent === 'recovery' ? 'recover' : input.intent}`, form.toString(), 'application/x-www-form-urlencoded');
          }
          const response = await delegate('/__proof/browser/complete', new URLSearchParams({ email }).toString(), 'application/x-www-form-urlencoded');
          // Only cookie state leaves completion; captured links and their redirects never do.
          const cookies = response.headers.getSetCookie();
          if (!cookies.some(cookie => /^dk-merchant\.session_token=[^;]+/.test(cookie) && !cookie.includes('Max-Age=0'))) return json(401, { error: 'authentication_failed' });
          const headers = new Headers({ 'content-type': 'application/json', 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' });
          for (const cookie of cookies) headers.append('set-cookie', cookie);
          return new Response(JSON.stringify({ transport: 'synthetic-local-mail' }), { status: 200, headers });
        }
        if (url.pathname === '/__agent/expire-auth') {
          if (Object.keys(input).length) return json(400, { error: 'invalid_input' });
          return delegate('/__proof/expire-verification', '{}', 'application/json');
        }
        if (url.pathname === '/__agent/receipt') {
          if (input.site_origin !== AGENT_STORE_ORIGIN || input.service !== 'inventory'
            || input.client_id !== 'dinkus-inventory-emdash'
            || input.callback_uri !== `${AGENT_STORE_ORIGIN}/_emdash/admin/plugins/dinkus-inventory/inventory`
            || Object.keys(input).some(key => !['version', 'connection_id', 'challenge', 'client_id', 'service', 'site_id', 'site_origin', 'callback_uri', 'code_challenge', 'expires_at'].includes(key))) return json(403, { error: 'synthetic_store_required' });
          return delegate('/__proof/receipt', body, 'application/json');
        }
        return json(404, { error: 'not_found' });
      }
      const allowed = ['/health', '/account/.well-known/jwks.json', '/account', '/account/sites', '/account/connect', '/account/logout', '/account/ship-sign-in',
        '/api/account/organizations', '/api/account/memberships', '/api/store-connections',
        '/api/store-connections/token', '/api/ship-sign-in/token'];
      if (!allowed.includes(url.pathname)) return json(404, { error: 'not_found' });
      if (request.method === 'POST' && url.pathname === '/api/store-connections') {
        let input; try { input = JSON.parse(body); } catch { return json(400, { error: 'invalid_json' }); }
        if (input?.site_origin !== AGENT_STORE_ORIGIN) return json(403, { error: 'synthetic_store_required' });
      }
      if (request.method === 'POST' && url.pathname === '/api/account/memberships') {
        if (!Object.values(AGENT_IDENTITIES).includes(new URLSearchParams(body).get('email'))) return json(403, { error: 'synthetic_identity_required' });
      }
      return delegate(url.pathname + url.search);
    },
  };
}
