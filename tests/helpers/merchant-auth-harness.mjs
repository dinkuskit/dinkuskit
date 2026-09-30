/**
 * Local test harness only. Not native EmDash browser integration and not a
 * product auth platform. Signup, sign-in, and recovery go through exported
 * @emdash-cms/auth helpers. HTTP cookies and site-control live here as fixtures.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import {
  completeSignup as emdashCompleteSignup,
  requestSignup as emdashRequestSignup,
  sendMagicLink as emdashSendMagicLink,
  verifyMagicLink as emdashVerifyMagicLink,
} from '@emdash-cms/auth';
import { canonicalAccountId, createProofServiceIssuer } from '../../src/account/index.ts';
import { createGeneralSubscriberAdapter } from './general-subscriber-adapter.mjs';

const COOKIE = 'dk_session';
const SESSION_TTL_MS = 30 * 60 * 1000;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function token() {
  return randomBytes(32).toString('base64url');
}

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function siteProof(controlSecret, nonce) {
  return createHmac('sha256', controlSecret).update(nonce).digest('hex');
}

function extractToken(text) {
  const match = String(text).match(/[?&]token=([^&\s]+)/);
  if (!match) throw new Error('email_not_captured');
  return decodeURIComponent(match[1]);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', chunk => chunks.push(Buffer.from(chunk)));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function sessionIdFromCookie(header) {
  const match = header?.match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`));
  return match?.[1];
}

function json(status, body, cookie) {
  const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
  if (cookie?.clear) headers['set-cookie'] = `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
  if (cookie?.sessionId) headers['set-cookie'] = `${COOKIE}=${cookie.sessionId}; HttpOnly; Path=/; SameSite=Lax`;
  return { status, headers, body: JSON.stringify(body) };
}

function errorStatus(error) {
  const code = error instanceof Error ? error.message : 'error';
  if (code === 'unauthorized' || code === 'invalid_token' || code === 'account_disabled' || code === 'token_expired') return 401;
  if (code === 'site_control_required' || code === 'site_control_failed' || code === 'grant_required' || code === 'challenge_required' || code === 'user_exists') return 403;
  if (code === 'unknown_site' || code === 'invalid_service_pair' || code === 'email_not_captured') return 400;
  return 500;
}

export async function createMerchantAuthHarness(options = {}) {
  const adapter = createGeneralSubscriberAdapter();
  const issuer = await createProofServiceIssuer(options);
  const now = options.now ?? (() => Date.now());
  const northSecret = token();
  const southSecret = token();
  const sites = new Map([
    ['site-north', { label: 'North store', controlSecret: northSecret }],
    ['site-south', { label: 'South store', controlSecret: southSecret }],
  ]);
  const sessions = new Map();
  const grants = new Map();
  const proven = new Set();
  const challenges = new Map();
  const inbox = [];

  const grantKey = (subject, siteId) => `${subject}:${siteId}`;
  const proveKey = (subject, siteId) => `${subject}:${siteId}`;

  const signupConfig = {
    baseUrl: 'http://127.0.0.1',
    siteName: 'DinkusKit',
    email: async message => {
      inbox.push({ to: message.to, subject: message.subject, kind: 'signup', text: message.text });
    },
  };
  const magicConfig = {
    baseUrl: 'http://127.0.0.1',
    siteName: 'DinkusKit',
    email: async message => {
      inbox.push({ to: message.to, subject: message.subject, kind: 'magic_link', text: message.text });
    },
  };
  const recoveryConfig = {
    ...magicConfig,
    email: async message => {
      inbox.push({ to: message.to, subject: message.subject, kind: 'recovery', text: message.text });
    },
  };

  function accountFromUser(user) {
    return {
      subject: user.id,
      email: user.email,
      issuer: issuer.issuer,
      accountId: canonicalAccountId(issuer.issuer, user.id),
      disabled: user.disabled,
      role: user.role,
    };
  }

  async function requireUser(subject) {
    const user = await adapter.getUserById(subject);
    if (!user) throw new Error('unauthorized');
    return user;
  }

  function sessionOf(sessionId) {
    if (!sessionId) throw new Error('unauthorized');
    const session = sessions.get(sessionId);
    if (!session || session.expiresAt <= now()) {
      if (session) sessions.delete(sessionId);
      throw new Error('unauthorized');
    }
    return session;
  }

  function createSession(subject) {
    const id = token();
    sessions.set(id, { id, subject, expiresAt: now() + SESSION_TTL_MS });
    return id;
  }

  async function requireActiveSession(sessionId) {
    const session = sessionOf(sessionId);
    const user = await requireUser(session.subject);
    if (user.disabled) throw new Error('account_disabled');
    return { session, user, account: accountFromUser(user) };
  }

  function takeToken(email, kind) {
    const index = inbox.findLastIndex(item => item.to === email && item.kind === kind && item.text);
    if (index < 0) throw new Error('email_not_captured');
    const [item] = inbox.splice(index, 1);
    return extractToken(item.text);
  }

  async function completeMagic(raw) {
    let user;
    try {
      user = await emdashVerifyMagicLink(adapter, raw);
    } catch (error) {
      if (error?.name === 'MagicLinkError') throw new Error(error.code);
      throw error;
    }
    if (user.disabled) throw new Error('account_disabled');
    return { sessionId: createSession(user.id), account: accountFromUser(user) };
  }

  return {
    issuer: issuer.issuer,
    jwks: issuer.jwks,
    kid: issuer.kid,
    tokenTtlSeconds: issuer.tokenTtlSeconds,
    adapter,
    sites: () => [...sites.entries()].map(([siteId, site]) => ({ siteId, label: site.label })),
    controlSecretFor(siteId) {
      const site = sites.get(siteId);
      if (!site) throw new Error('unknown_site');
      return site.controlSecret;
    },
    capturedMail() {
      return inbox.map(({ to, subject, kind, text }) => ({
        to,
        subject,
        kind,
        hasTokenQuery: /[?&]token=/.test(text ?? ''),
        signupUrlCoupled: kind === 'signup' && /\/admin\/signup\?token=/.test(text ?? ''),
        magicUrlCoupled: kind !== 'signup' && /\/_emdash\/api\/auth\/magic-link\/verify\?token=/.test(text ?? ''),
      }));
    },
    takeToken,
    async requestSignup(email) {
      await emdashRequestSignup(signupConfig, adapter, email);
    },
    async completeSignup(raw) {
      try {
        const user = await emdashCompleteSignup(adapter, raw, {});
        return { sessionId: createSession(user.id), account: accountFromUser(user) };
      } catch (error) {
        if (error?.name === 'SignupError') throw new Error(error.code);
        throw error;
      }
    },
    async requestSignIn(email) {
      await emdashSendMagicLink(magicConfig, adapter, email, 'magic_link');
    },
    async completeSignIn(raw) {
      return completeMagic(raw);
    },
    async requestRecovery(email) {
      await emdashSendMagicLink(recoveryConfig, adapter, email, 'recovery');
    },
    async completeRecovery(raw) {
      return completeMagic(raw);
    },
    signOut(id) {
      if (id) sessions.delete(id);
    },
    async session(sessionId) {
      const { session, account } = await requireActiveSession(sessionId);
      return {
        account,
        grants: [...grants.values()].filter(grant => grant.subject === session.subject).map(grant => grant.siteId),
        proven: [...proven].filter(key => key.startsWith(`${session.subject}:`)).map(key => key.slice(session.subject.length + 1)),
      };
    },
    async challenge(sessionId, siteId) {
      const { session } = await requireActiveSession(sessionId);
      if (!sites.has(siteId)) throw new Error('unknown_site');
      const nonce = token();
      challenges.set(`${session.subject}:${siteId}`, {
        subject: session.subject,
        siteId,
        nonce,
        expiresAt: now() + CHALLENGE_TTL_MS,
      });
      return { siteId, challenge: nonce };
    },
    async prove(sessionId, siteId, proof) {
      const { session } = await requireActiveSession(sessionId);
      const pending = challenges.get(`${session.subject}:${siteId}`);
      const site = sites.get(siteId);
      if (!pending || !site || pending.expiresAt <= now()) throw new Error('challenge_required');
      const expected = siteProof(site.controlSecret, pending.nonce);
      if (!safeEqual(expected, proof)) throw new Error('site_control_failed');
      challenges.delete(`${session.subject}:${siteId}`);
      proven.add(proveKey(session.subject, siteId));
    },
    async authorize(sessionId, siteId) {
      const { session } = await requireActiveSession(sessionId);
      if (!sites.has(siteId)) throw new Error('unknown_site');
      if (!proven.has(proveKey(session.subject, siteId))) throw new Error('site_control_required');
      grants.set(grantKey(session.subject, siteId), { subject: session.subject, siteId, authorizedAt: now() });
    },
    async revoke(sessionId, siteId) {
      const { session } = await requireActiveSession(sessionId);
      grants.delete(grantKey(session.subject, siteId));
      proven.delete(proveKey(session.subject, siteId));
      challenges.delete(`${session.subject}:${siteId}`);
    },
    async disable(sessionId) {
      const { session } = await requireActiveSession(sessionId);
      await adapter.updateUser(session.subject, { disabled: true });
    },
    async issue(sessionId, input) {
      const { account } = await requireActiveSession(sessionId);
      if (!grants.has(grantKey(account.subject, input.siteId))) throw new Error('grant_required');
      return issuer.issue({
        subject: account.subject,
        siteId: input.siteId,
        audience: input.audience,
        scope: input.scope,
        ttlSeconds: input.ttlSeconds,
      });
    },
    snapshot() {
      return {
        issuer: issuer.issuer,
        merchantCount: adapter.users.size,
        sessionCount: sessions.size,
        grantCount: grants.size,
        emailCount: inbox.length,
        adapterUserCount: adapter.users.size,
        allowedDomainRows: adapter.allowedDomainRowCount(),
        cmsUserCount: 0,
        websiteEditorCount: 0,
        publicLoginRoute: false,
        fixtureHttpSession: true,
        nativeBrowserIntegration: false,
        sites: [...sites.keys()],
      };
    },
  };
}

export async function handleMerchantAuth(runtime, request) {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const cookie = sessionIdFromCookie(request.headers.cookie);

  try {
    if (request.method === 'GET' && url.pathname === '/jwks') return json(200, runtime.jwks);
    if (request.method === 'GET' && url.pathname === '/meta') return json(200, runtime.snapshot());
    if (request.method === 'GET' && url.pathname === '/session') {
      const current = await runtime.session(cookie);
      return json(200, {
        signedIn: true,
        accountId: current.account.accountId,
        emailDomain: current.account.email.split('@')[1],
        disabled: current.account.disabled,
        role: current.account.role,
        grants: current.grants,
        proven: current.proven,
        websiteEditor: false,
        fixtureHttpSession: true,
      });
    }

    const body = request.method === 'POST' ? JSON.parse((await readBody(request)) || '{}') : {};

    if (request.method === 'POST' && url.pathname === '/signup') {
      await runtime.requestSignup(String(body.email ?? ''));
      return json(200, { accepted: true });
    }
    if (request.method === 'POST' && url.pathname === '/signup/complete') {
      const result = await runtime.completeSignup(String(body.token ?? ''));
      return json(200, { accountId: result.account.accountId, role: result.account.role, websiteEditor: false }, { sessionId: result.sessionId });
    }
    if (request.method === 'POST' && url.pathname === '/signin') {
      await runtime.requestSignIn(String(body.email ?? ''));
      return json(200, { accepted: true });
    }
    if (request.method === 'POST' && url.pathname === '/signin/complete') {
      const result = await runtime.completeSignIn(String(body.token ?? ''));
      return json(200, { accountId: result.account.accountId, role: result.account.role, websiteEditor: false }, { sessionId: result.sessionId });
    }
    if (request.method === 'POST' && url.pathname === '/recovery') {
      await runtime.requestRecovery(String(body.email ?? ''));
      return json(200, { accepted: true });
    }
    if (request.method === 'POST' && url.pathname === '/recovery/complete') {
      const result = await runtime.completeRecovery(String(body.token ?? ''));
      return json(200, { accountId: result.account.accountId, role: result.account.role, websiteEditor: false }, { sessionId: result.sessionId });
    }
    if (request.method === 'POST' && url.pathname === '/signout') {
      runtime.signOut(cookie);
      return json(200, { signedOut: true }, { clear: true });
    }
    if (request.method === 'POST' && url.pathname === '/sites/challenge') {
      return json(200, await runtime.challenge(cookie, String(body.siteId ?? '')));
    }
    if (request.method === 'POST' && url.pathname === '/sites/prove') {
      await runtime.prove(cookie, String(body.siteId ?? ''), String(body.proof ?? ''));
      return json(200, { proven: true });
    }
    if (request.method === 'POST' && url.pathname === '/sites/authorize') {
      await runtime.authorize(cookie, String(body.siteId ?? ''));
      return json(200, { authorized: true });
    }
    if (request.method === 'POST' && url.pathname === '/sites/revoke') {
      await runtime.revoke(cookie, String(body.siteId ?? ''));
      return json(200, { revoked: true });
    }
    if (request.method === 'POST' && url.pathname === '/account/disable') {
      await runtime.disable(cookie);
      return json(200, { disabled: true });
    }
    if (request.method === 'POST' && url.pathname === '/tokens') {
      const issued = await runtime.issue(cookie, {
        siteId: String(body.siteId ?? ''),
        audience: body.audience,
        scope: body.scope,
      });
      return json(200, { issued: true, claims: issued.claims, token: issued.token });
    }
    if (request.method === 'POST' && url.pathname === '/tokens/renew') {
      const issued = await runtime.issue(cookie, {
        siteId: String(body.siteId ?? ''),
        audience: body.audience,
        scope: body.scope,
      });
      return json(200, { renewed: true, claims: issued.claims, token: issued.token });
    }
    return json(404, { error: 'not_found' });
  } catch (error) {
    return json(errorStatus(error), { error: error instanceof Error ? error.message : 'error' });
  }
}

export async function listenMerchantAuth(runtime, host = '127.0.0.1') {
  const server = createServer((req, res) => {
    void handleMerchantAuth(runtime, req).then(result => {
      res.writeHead(result.status, result.headers);
      res.end(result.body);
    });
  });
  await new Promise(resolve => server.listen(0, host, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('listen_failed');
  return { server, base: `http://${host}:${address.port}` };
}
