import assert from 'node:assert/strict';
import { Role } from '@emdash-cms/auth';
import { authenticate as officialAuthenticate } from '@emdash-cms/cloudflare/auth';
import {
  ACCESS_AUDIENCE_ENV,
  ACCESS_TEAM_DOMAIN_ENV,
  INSTALLED_EDITOR_ROLE,
  OPERATOR_ALLOWLIST_ENV,
  cmsHasActiveAdmin,
  decodeRoutingPathname,
  evaluateAccessGate,
  hasEmdashToken,
  isAgentApiPath,
  isEmdashNamespace,
  officialAccessConfig,
  parseOperatorAllowlist,
  requestPathname,
  resolveNamespacePathname,
} from './lib/access-namespace-gate.mjs';
import { registerAstroMiddlewareLoader } from './lib/astro-middleware-loader.mjs';

const checks = [];
const record = (check) => {
  checks.push(check);
  console.log(`PASS ${check}`);
};

assert.equal(Role.EDITOR, 40);
assert.equal(INSTALLED_EDITOR_ROLE, Role.EDITOR);
record('Installed EmDash Role.EDITOR is 40, not the outdated Access comment default');

assert.equal(isEmdashNamespace('/_emdash'), true);
assert.equal(isEmdashNamespace('/_emdash/admin/setup'), true);
assert.equal(isEmdashNamespace('/_emdash/api/auth/login'), true);
assert.equal(isEmdashNamespace('/getting-started'), false);
record('Gate applies to the complete /_emdash namespace including setup and login');

assert.equal(decodeRoutingPathname('/%5femdash/admin/setup'), '/_emdash/admin/setup');
assert.equal(decodeRoutingPathname('/_%65mdash/admin/setup'), '/_emdash/admin/setup');
assert.equal(decodeRoutingPathname('/%5Femdash/admin/setup'), '/_emdash/admin/setup');
assert.equal(decodeRoutingPathname('/%255femdash/admin/setup'), '/_emdash/admin/setup');
assert.equal(decodeRoutingPathname('/_emdash%2fadmin/setup'), '/_emdash%2fadmin/setup');
assert.throws(() => decodeRoutingPathname('/%5femdash/admin/setup%'), /Invalid URL encoding/);
record('Routing decode matches Astro iterative decodeURI, including case and double-encoded unreserved bytes');

const encodedNamespacePaths = [
  '/%5femdash/admin/setup',
  '/_%65mdash/admin/setup',
  '/%5Femdash/admin/setup',
  '/%255femdash/admin/setup',
  '/_emdash%2fadmin/setup',
  '/_emdash%2Fadmin/setup',
  '/%5femdash/api/setup/status',
];
for (const path of encodedNamespacePaths) {
  assert.equal(resolveNamespacePathname(path).kind, 'protected', path);
  assert.equal(isEmdashNamespace(path), true, path);
}
record('Percent-encoded unreserved namespace chars, case escapes, and encoded slashes are protected');

assert.equal(resolveNamespacePathname('/%5femdash/admin/setup%').kind, 'malformed-protected');
assert.equal(resolveNamespacePathname('/%5femdash%').kind, 'malformed-protected');
assert.equal(resolveNamespacePathname('/_emdash/admin/setup%2').kind, 'malformed-protected');
assert.equal(resolveNamespacePathname('/_emdash/admin/%ZZ').kind, 'malformed-protected');
assert.equal(isEmdashNamespace('/%5femdash/admin/setup%'), true);
record('Malformed encodings relevant to /_emdash fail closed');

assert.equal(resolveNamespacePathname('/getting-started').kind, 'public');
assert.equal(resolveNamespacePathname('/%67etting-started').kind, 'public');
assert.equal(resolveNamespacePathname('/getting-started%').kind, 'public');
assert.equal(resolveNamespacePathname('/%ZZ').kind, 'public');
assert.equal(isEmdashNamespace('/%67etting-started'), false);
record('Public encoded and malformed paths stay public and are not rewritten into the namespace');

assert.equal(
  requestPathname(new Request('http://127.0.0.1/%5femdash/admin/setup')),
  '/%5femdash/admin/setup',
);
assert.equal(
  requestPathname(new Request('http://127.0.0.1/_%65mdash/api/setup/status?x=1')),
  '/_%65mdash/api/setup/status',
);
record('requestPathname keeps raw percent-encoded unreserved namespace bytes');

assert.deepEqual(parseOperatorAllowlist(' Owner@Fixture.Invalid , editor@fixture.invalid\n'), [
  'owner@fixture.invalid',
  'editor@fixture.invalid',
]);
record('Runtime allowlist is parsed from env text, not from committed addresses');

const fixtureEnv = {
  [ACCESS_TEAM_DOMAIN_ENV]: 'example.invalid',
  [ACCESS_AUDIENCE_ENV]: 'fixture-audience-not-production',
  [OPERATOR_ALLOWLIST_ENV]: 'owner@fixture.invalid',
};
const setupReq = new Request('http://127.0.0.1/_emdash/admin/setup');
const loginReq = new Request('http://127.0.0.1/_emdash/api/auth/login');

const missing = await evaluateAccessGate({
  pathname: '/_emdash/admin/setup',
  request: setupReq,
  env: {},
  authenticate: officialAuthenticate,
});
assert.deepEqual(missing, { allow: false, status: 404, reason: 'missing-config' });
record('Missing Access team/audience/allowlist denies setup before authenticate');

const anonymous = await evaluateAccessGate({
  pathname: '/_emdash/admin/setup',
  request: setupReq,
  env: fixtureEnv,
  authenticate: officialAuthenticate,
});
assert.deepEqual(anonymous, { allow: false, status: 404, reason: 'unauthenticated' });
record('Anonymous setup with no Access JWT is denied before EmDash runtime');

const spoofedCookie = await evaluateAccessGate({
  pathname: '/_emdash/api/setup',
  request: new Request('http://127.0.0.1/_emdash/api/setup', {
    method: 'POST',
    headers: {
      cookie: 'CF_Authorization=spoofed; astro-session=spoofed',
      host: 'dinkuskit.com',
      'x-forwarded-host': 'dinkuskit.com',
    },
  }),
  env: fixtureEnv,
  authenticate: officialAuthenticate,
});
assert.deepEqual(spoofedCookie, { allow: false, status: 404, reason: 'unauthenticated' });
record('Official authenticate denies spoofed CF_Authorization cookie and Host on setup POST');

const spoofedHeaderJwt = await evaluateAccessGate({
  pathname: '/_emdash/api/auth/login',
  request: new Request('http://127.0.0.1/_emdash/api/auth/login', {
    headers: { 'cf-access-jwt-assertion': 'not-a-jwt' },
  }),
  env: fixtureEnv,
  authenticate: officialAuthenticate,
});
assert.deepEqual(spoofedHeaderJwt, { allow: false, status: 404, reason: 'unauthenticated' });
record('Official authenticate denies a spoofed Cf-Access-Jwt-Assertion on login');

await assert.rejects(
  () => officialAuthenticate(setupReq, officialAccessConfig({
    teamDomain: fixtureEnv[ACCESS_TEAM_DOMAIN_ENV],
    audience: fixtureEnv[ACCESS_AUDIENCE_ENV],
  })),
  /No Access JWT present/,
);
record('Official @emdash-cms/cloudflare/auth authenticate throws on missing JWT');

const tokenReq = new Request('http://127.0.0.1/_emdash/admin', {
  headers: { 'cf-access-jwt-assertion': 'controlled-verifier-not-a-hosted-jwt' },
});
const controlledUnknown = await evaluateAccessGate({
  pathname: '/_emdash/admin',
  request: tokenReq,
  env: fixtureEnv,
  authenticate: async () => ({ email: 'stranger@fixture.invalid', name: 'Stranger', role: INSTALLED_EDITOR_ROLE }),
});
assert.deepEqual(controlledUnknown, { allow: false, status: 404, reason: 'unknown-identity' });
record('Controlled verifier (not hosted Access proof): unknown identity is denied');

const controlledAllowlisted = await evaluateAccessGate({
  pathname: '/_emdash/admin',
  request: tokenReq,
  env: fixtureEnv,
  authenticate: async () => ({ email: 'owner@fixture.invalid', name: 'Owner', role: 50 }),
});
assert.deepEqual(controlledAllowlisted, {
  allow: true,
  reason: 'allowlisted',
  email: 'owner@fixture.invalid',
});
record('Controlled verifier (not hosted Access proof): allowlisted identity may proceed');

for (const path of [
  '/%5femdash/admin/setup',
  '/_%65mdash/admin/setup',
  '/%5femdash/api/setup/status',
  '/_emdash%2fadmin/setup',
]) {
  const encodedAnonymous = await evaluateAccessGate({
    pathname: path,
    request: new Request(`http://127.0.0.1${path}`),
    env: fixtureEnv,
    authenticate: officialAuthenticate,
  });
  assert.deepEqual(encodedAnonymous, { allow: false, status: 404, reason: 'unauthenticated' }, path);
}
record('Official authenticate denies anonymous encoded /_emdash setup and status paths');

const encodedSpoofed = await evaluateAccessGate({
  pathname: '/%5femdash/api/setup/status',
  request: new Request('http://127.0.0.1/%5femdash/api/setup/status', {
    headers: {
      cookie: 'CF_Authorization=spoofed',
      'cf-access-jwt-assertion': 'not-a-jwt',
    },
  }),
  env: fixtureEnv,
  authenticate: officialAuthenticate,
});
assert.deepEqual(encodedSpoofed, { allow: false, status: 404, reason: 'unauthenticated' });
record('Official authenticate denies spoofed JWT on percent-encoded /_emdash status');

const malformedProtected = await evaluateAccessGate({
  pathname: '/%5femdash/admin/setup%',
  request: new Request('http://127.0.0.1/%5femdash/admin/setup%'),
  env: fixtureEnv,
  authenticate: officialAuthenticate,
});
assert.deepEqual(malformedProtected, { allow: false, status: 404, reason: 'malformed-namespace' });
record('Malformed namespace encodings fail closed before authenticate');

const publicEncoded = await evaluateAccessGate({
  pathname: '/%67etting-started',
  request: new Request('http://127.0.0.1/%67etting-started'),
  env: {},
  authenticate: officialAuthenticate,
});
assert.deepEqual(publicEncoded, { allow: true, reason: 'public' });
record('Encoded public paths are not Access-gated and keep public UX');

const publicPage = await evaluateAccessGate({
  pathname: '/',
  request: new Request('http://127.0.0.1/'),
  env: {},
});
assert.deepEqual(publicPage, { allow: true, reason: 'public' });
record('Public pages are not Access-gated by this namespace guard');

const loginMissing = await evaluateAccessGate({
  pathname: '/_emdash/api/auth/login',
  request: loginReq,
  env: { [ACCESS_TEAM_DOMAIN_ENV]: 'example.invalid' },
  authenticate: officialAuthenticate,
});
assert.equal(loginMissing.reason, 'missing-config');
record('Partial Access config still fail-closes login');

// --- Regression: Cloudflare Adapter createLocals runtime-env resolution ---
registerAstroMiddlewareLoader();

const { createLocals } = await import('../node_modules/@astrojs/cloudflare/dist/utils/cf-helpers.js');
const { createAccessNamespaceGuard, readGateEnv } = await import('../src/access-namespace-guard.ts');

const adapterLocals = createLocals({});
assert.throws(
  () => adapterLocals.runtime.env,
  /Astro\.locals\.runtime\.env has been removed in Astro v6/,
  'Installed @astrojs/cloudflare createLocals runtime.env must be a throwing getter',
);
record('Installed @astrojs/cloudflare createLocals provides real throwing runtime.env getter');

process.env[ACCESS_TEAM_DOMAIN_ENV] = 'team.fixture.invalid';
process.env[ACCESS_AUDIENCE_ENV] = 'fixture-audience-not-production';
process.env[OPERATOR_ALLOWLIST_ENV] = 'owner@fixture.invalid';

const resolvedEnv = readGateEnv({ locals: adapterLocals });
assert.equal(resolvedEnv[ACCESS_TEAM_DOMAIN_ENV], 'team.fixture.invalid');
assert.equal(resolvedEnv[ACCESS_AUDIENCE_ENV], 'fixture-audience-not-production');
assert.equal(resolvedEnv[OPERATOR_ALLOWLIST_ENV], 'owner@fixture.invalid');
record('readGateEnv resolves runtime scalars from process.env without touching throwing locals.runtime.env');

let verifierCalledWith = null;
let verifierCalls = 0;
const controlledVerifier = async (request, config) => {
  verifierCalls++;
  verifierCalledWith = config;
  return { email: 'owner@fixture.invalid', name: 'Owner', role: INSTALLED_EDITOR_ROLE };
};

const middleware = createAccessNamespaceGuard({ authenticate: controlledVerifier });

let nextCalled = false;
const allowedContext = {
  request: new Request('http://127.0.0.1/_emdash/admin/setup', {
    headers: { 'cf-access-jwt-assertion': 'synthetic-jwt' },
  }),
  url: new URL('http://127.0.0.1/_emdash/admin/setup'),
  locals: adapterLocals,
};
const allowedRes = await middleware(allowedContext, () => {
  nextCalled = true;
  return new Response('downstream-setup', { status: 200 });
});
assert.equal(verifierCalls, 1, 'Controlled verifier must be called exactly once');
assert.equal(verifierCalledWith?.audience, 'fixture-audience-not-production', 'Runtime scalar audience must reach verifier');
assert.equal(verifierCalledWith?.teamDomain, 'team.fixture.invalid', 'Runtime scalar team domain must reach verifier');
assert.equal(nextCalled, true, 'Allowed identity calls downstream next');
assert.equal(allowedRes.status, 200);
record('Controlled verifier receives runtime scalar values and allowed identity calls next');

const strangerVerifier = async () => ({
  email: 'stranger@fixture.invalid',
  name: 'Stranger',
  role: INSTALLED_EDITOR_ROLE,
});
const strangerMiddleware = createAccessNamespaceGuard({ authenticate: strangerVerifier });
let strangerNextCalled = false;
const strangerRes = await strangerMiddleware(allowedContext, () => {
  strangerNextCalled = true;
  return new Response('downstream', { status: 200 });
});
assert.equal(strangerNextCalled, false, 'Unknown identity must not call downstream next');
assert.equal(strangerRes.status, 404);
assert.equal(await strangerRes.text(), 'Not Found');
record('Controlled verifier: unknown identity remains 404 before downstream');

let configMissingVerifierCalls = 0;
const configMissingVerifier = async () => {
  configMissingVerifierCalls++;
  return { email: 'owner@fixture.invalid', name: 'Owner', role: INSTALLED_EDITOR_ROLE };
};
const missingConfigMiddleware = createAccessNamespaceGuard({ authenticate: configMissingVerifier });
delete process.env[ACCESS_AUDIENCE_ENV];
let missingNextCalled = false;
const missingConfigRes = await missingConfigMiddleware(allowedContext, () => {
  missingNextCalled = true;
  return new Response('downstream', { status: 200 });
});
assert.equal(configMissingVerifierCalls, 0, 'Verifier must not be called when configuration is missing');
assert.equal(missingNextCalled, false, 'Missing configuration must not call downstream next');
assert.equal(missingConfigRes.status, 404);
record('Missing configuration remains 404 before downstream and verifier');

process.env[ACCESS_AUDIENCE_ENV] = 'fixture-audience-not-production';

let anonNextCalled = false;
const anonContext = {
  request: new Request('http://127.0.0.1/_emdash/admin/setup'),
  url: new URL('http://127.0.0.1/_emdash/admin/setup'),
  locals: adapterLocals,
};
const anonRes = await middleware(anonContext, () => {
  anonNextCalled = true;
  return new Response('downstream', { status: 200 });
});
assert.equal(anonNextCalled, false, 'Anonymous request must not call downstream next');
assert.equal(anonRes.status, 404);
record('Anonymous protected request remains 404 before downstream');

let publicNextCalled = false;
const publicContext = {
  request: new Request('http://127.0.0.1/'),
  url: new URL('http://127.0.0.1/'),
  locals: adapterLocals,
};
const publicRes = await middleware(publicContext, () => {
  publicNextCalled = true;
  return new Response('public-content', { status: 200 });
});
assert.equal(publicNextCalled, true, 'Public route passes through to downstream next');
assert.equal(publicRes.status, 200);
assert.equal(await publicRes.text(), 'public-content');
record('Public route passes through to downstream next with adapter locals');

// --- Access service tokens (synthetic local keys; not hosted Access proof) ---
{
  const { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } = await import('jose');
  const { createAccessAuthenticate } = await import('./lib/access-service-token-auth.mjs');

  const team = 'team.fixture.invalid';
  const audience = 'fixture-audience-not-production';
  const tokenCn = '0123456789abcdef0123456789abcdef.access';
  const otherCn = 'fedcba9876543210fedcba9876543210.access';
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const { privateKey: strangerKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'fixture-kid', alg: 'RS256' };
  const localJwks = createLocalJWKSet({ keys: [jwk] });
  const getKey = (domain) => {
    assert.equal(domain, team, 'JWKS must be resolved for the configured team domain');
    return localJwks;
  };
  const sign = (claims, { aud = audience, iss = `https://${team}`, key = privateKey } = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'fixture-kid' })
      .setIssuer(iss)
      .setAudience(aud)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(key);

  let officialCalls = 0;
  const officialStub = async () => {
    officialCalls++;
    return { email: 'owner@fixture.invalid', name: 'Owner', role: INSTALLED_EDITOR_ROLE };
  };
  const svcAuthenticate = createAccessAuthenticate({ officialAuthenticate: officialStub, getKey, env: {} });
  const svcEnv = {
    [ACCESS_TEAM_DOMAIN_ENV]: team,
    [ACCESS_AUDIENCE_ENV]: audience,
    [OPERATOR_ALLOWLIST_ENV]: 'owner@fixture.invalid',
    EMDASH_OPERATOR_SERVICE_TOKENS: ` ${tokenCn.toUpperCase()} , other.example.access`,
  };
  const reqWith = (jwt) => new Request('http://127.0.0.1/_emdash/api/content/posts', {
    headers: { 'cf-access-jwt-assertion': jwt },
  });
  const adminPresent = async () => true;
  const gate = (jwt, env = svcEnv, hasActiveAdmin = adminPresent, pathname = '/_emdash/api/content/posts') => evaluateAccessGate({
    pathname,
    request: reqWith(jwt),
    env,
    authenticate: svcAuthenticate,
    hasActiveAdmin,
  });
  const serviceClaims = { common_name: tokenCn, sub: '', type: 'app' };

  officialCalls = 0;
  const allowedToken = await gate(await sign(serviceClaims));
  assert.deepEqual(allowedToken, {
    allow: true,
    reason: 'service-token',
    email: 'service+0123456789abcdef0123456789abcdef@tokens.invalid',
  });
  assert.equal(officialCalls, 0, 'Service tokens must skip the Access identity lookup');
  const identity = await svcAuthenticate(reqWith(await sign(serviceClaims)), {
    teamDomain: team,
    audience,
    serviceTokens: [tokenCn],
  });
  assert.equal(identity.role, INSTALLED_EDITOR_ROLE, 'Service token maps to Editor (40), not Admin');
  assert.equal(identity.email, 'service+0123456789abcdef0123456789abcdef@tokens.invalid');
  record('Verified, listed service token is allowed as a stable Editor placeholder without identity lookup');

  // Bootstrap boundary: a listed, verified token is denied until a human Admin exists.
  const noAdminCases = [undefined, async () => false, async () => { throw new Error('db down'); }, async () => 'yes'];
  for (const hasActiveAdmin of noAdminCases) {
    for (const path of ['/_emdash/api/content/posts', '/_emdash/admin/setup', '/_emdash/api/setup/status', '/_emdash/admin']) {
      assert.deepEqual(await evaluateAccessGate({
        pathname: path,
        request: reqWith(await sign(serviceClaims)),
        env: svcEnv,
        authenticate: svcAuthenticate,
        hasActiveAdmin,
      }), { allow: false, status: 404, reason: 'service-token-before-admin' }, path);
    }
  }
  assert.deepEqual(
    await evaluateAccessGate({ pathname: '/_emdash/admin/setup', request: reqWith(await sign({ email: 'owner@fixture.invalid', sub: 'u' })), env: svcEnv, authenticate: svcAuthenticate }),
    { allow: true, reason: 'allowlisted', email: 'owner@fixture.invalid' },
    'Allowlisted humans can still bootstrap without an existing Admin',
  );
  const fakeD1 = (rows, { fail = false } = {}) => ({
    prepare(sql) {
      assert.match(sql, /FROM users WHERE role >= \? AND \(disabled IS NULL OR disabled = 0\)/);
      return {
        bind(role) {
          assert.equal(role, 50);
          return { first: async () => { if (fail) throw new Error('no such table: users'); return rows.find((r) => r.role >= role && !r.disabled) ? { ok: 1 } : null; } };
        },
      };
    },
  });
  assert.equal(await cmsHasActiveAdmin(undefined), false);
  assert.equal(await cmsHasActiveAdmin(fakeD1([])), false);
  assert.equal(await cmsHasActiveAdmin(fakeD1([{ role: 40, disabled: 0 }])), false);
  assert.equal(await cmsHasActiveAdmin(fakeD1([{ role: 50, disabled: 1 }])), false);
  assert.equal(await cmsHasActiveAdmin(fakeD1([{ role: 50 }], { fail: true })), false);
  assert.equal(await cmsHasActiveAdmin(fakeD1([{ role: 40 }, { role: 50, disabled: 0 }])), true);
  record('Service tokens are denied (404, before EmDash) until the CMS has an enabled Admin; empty, Editor-only, disabled-Admin or unreadable DB all fail closed');

  const unlisted = await gate(await sign({ ...serviceClaims, common_name: otherCn }));
  assert.deepEqual(unlisted, { allow: false, status: 404, reason: 'unauthenticated' });
  record('Verified but unlisted service token is denied with the generic 404');

  const noVarEnv = { ...svcEnv };
  delete noVarEnv.EMDASH_OPERATOR_SERVICE_TOKENS;
  assert.deepEqual(await gate(await sign(serviceClaims), noVarEnv), {
    allow: false, status: 404, reason: 'unauthenticated',
  });
  assert.deepEqual(await gate(await sign(serviceClaims), { ...svcEnv, EMDASH_OPERATOR_SERVICE_TOKENS: ' ' }), {
    allow: false, status: 404, reason: 'unauthenticated',
  });
  const neitherEnv = { ...noVarEnv };
  delete neitherEnv[OPERATOR_ALLOWLIST_ENV];
  assert.deepEqual(await gate(await sign(serviceClaims), neitherEnv), {
    allow: false, status: 404, reason: 'missing-config',
  });
  await assert.rejects(
    () => svcAuthenticate(reqWith('x'), { teamDomain: team, audience }),
  );
  const runtimeNoVar = createAccessAuthenticate({ officialAuthenticate: officialStub, getKey, env: {} });
  await assert.rejects(
    () => runtimeNoVar(reqWith('not-a-jwt'), { teamDomain: team, audience }),
  );
  await assert.rejects(
    async () => runtimeNoVar(reqWith(await sign(serviceClaims)), { teamDomain: team, audience }),
    /Service token not allowed/,
  );
  const runtimeWithVar = createAccessAuthenticate({
    officialAuthenticate: officialStub,
    getKey,
    env: { EMDASH_OPERATOR_SERVICE_TOKENS: tokenCn },
  });
  assert.equal(
    (await runtimeWithVar(reqWith(await sign(serviceClaims)), { teamDomain: team, audienceEnvVar: 'X' }).catch((e) => e)).message,
    'Access audience not configured',
  );
  assert.equal(
    (await runtimeWithVar(reqWith(await sign(serviceClaims)), { teamDomain: team, audience })).role,
    INSTALLED_EDITOR_ROLE,
  );
  record('Missing or empty EMDASH_OPERATOR_SERVICE_TOKENS denies every service token (default deny)');

  officialCalls = 0;
  assert.deepEqual(await gate(await sign(serviceClaims, { aud: 'some-other-app' })), {
    allow: false, status: 404, reason: 'unauthenticated',
  });
  assert.deepEqual(await gate(await sign(serviceClaims, { iss: 'https://evil.fixture.invalid' })), {
    allow: false, status: 404, reason: 'unauthenticated',
  });
  assert.deepEqual(await gate(await sign(serviceClaims, { key: strangerKey })), {
    allow: false, status: 404, reason: 'unauthenticated',
  });
  const forged = (await sign(serviceClaims)).split('.');
  forged[1] = Buffer.from(JSON.stringify({ ...serviceClaims, aud: audience, iss: `https://${team}`, exp: 4102444800 })).toString('base64url');
  assert.deepEqual(await gate(forged.join('.')), { allow: false, status: 404, reason: 'unauthenticated' });
  assert.equal(officialCalls, 0, 'Rejected tokens never reach the identity lookup');
  record('Listed service token with bad aud, bad iss, foreign key or tampered payload is denied');

  officialCalls = 0;
  const userJwt = await sign({ email: 'owner@fixture.invalid', sub: 'user-sub', type: 'app' });
  assert.deepEqual(await gate(userJwt), { allow: true, reason: 'allowlisted', email: 'owner@fixture.invalid' });
  assert.equal(officialCalls, 1, 'Email users still go through official authenticate');
  const strangerUser = createAccessAuthenticate({
    officialAuthenticate: async () => ({ email: 'stranger@fixture.invalid', name: 'S', role: 40 }),
    getKey,
    env: {},
  });
  assert.deepEqual(await evaluateAccessGate({
    pathname: '/_emdash/admin',
    request: reqWith(userJwt),
    env: svcEnv,
    authenticate: strangerUser,
  }), { allow: false, status: 404, reason: 'unknown-identity' });
  officialCalls = 0;
  const bothClaims = await sign({ email: 'owner@fixture.invalid', common_name: tokenCn, sub: 'user-sub' });
  assert.deepEqual(await gate(bothClaims), { allow: true, reason: 'allowlisted', email: 'owner@fixture.invalid' });
  assert.equal(officialCalls, 1, 'A JWT with an email is a user, never a service token');
  assert.deepEqual(await evaluateAccessGate({
    pathname: '/_emdash/admin',
    request: reqWith(userJwt),
    env: svcEnv,
    authenticate: async () => ({ email: 'service+0123456789abcdef0123456789abcdef@tokens.invalid' }),
  }), { allow: false, status: 404, reason: 'unknown-identity' });
  record('Email users are unchanged: official lookup, email allowlist, and no service-token shortcut');

  const svcMiddleware = createAccessNamespaceGuard({ authenticate: svcAuthenticate, hasActiveAdmin: adminPresent });
  const noAdminMiddleware = createAccessNamespaceGuard({ authenticate: svcAuthenticate, hasActiveAdmin: async () => false });
  const defaultAdminMiddleware = createAccessNamespaceGuard({ authenticate: svcAuthenticate });
  process.env.EMDASH_OPERATOR_SERVICE_TOKENS = tokenCn;
  process.env[ACCESS_TEAM_DOMAIN_ENV] = team;
  const mwCtx = async (jwt) => ({
    request: reqWith(jwt),
    url: new URL('http://127.0.0.1/_emdash/api/content/posts'),
    locals: adapterLocals,
  });
  const okRes = await svcMiddleware(await mwCtx(await sign(serviceClaims)), () => new Response('ok'));
  assert.equal(await okRes.text(), 'ok');
  const noAdminRes = await noAdminMiddleware(await mwCtx(await sign(serviceClaims)), () => new Response('ok'));
  assert.equal(noAdminRes.status, 404);
  assert.equal(await noAdminRes.text(), 'Not Found');
  const defaultAdminRes = await defaultAdminMiddleware(await mwCtx(await sign(serviceClaims)), () => new Response('ok'));
  assert.equal(defaultAdminRes.status, 404, 'Without a readable CMS DB binding the default admin check fails closed');
  const denyRes = await svcMiddleware(
    await mwCtx(await sign({ ...serviceClaims, common_name: otherCn })),
    () => new Response('ok'),
  );
  assert.equal(denyRes.status, 404);
  assert.equal(await denyRes.text(), 'Not Found');
  delete process.env.EMDASH_OPERATOR_SERVICE_TOKENS;
  const unsetRes = await svcMiddleware(await mwCtx(await sign(serviceClaims)), () => new Response('ok'));
  assert.equal(unsetRes.status, 404);
  record('Guard middleware reads EMDASH_OPERATOR_SERVICE_TOKENS at runtime and keeps the same 404 body');
}

{
  // website-agent-api-tokens-20261027: agents bring an EmDash API token instead of an Access sign-in.
  const noAccess = async () => { throw new Error('Access must not be consulted for an EmDash token'); };
  const tokenGate = (pathname, authorization, hasActiveAdmin = async () => true, extraHeaders = {}) => evaluateAccessGate({
    pathname,
    request: new Request(`http://127.0.0.1${pathname}`, { method: 'POST', headers: { ...(authorization ? { authorization } : {}), ...extraHeaders } }),
    env: fixtureEnv,
    authenticate: noAccess,
    hasActiveAdmin,
  });
  for (const path of [
    '/_emdash/api/mcp', '/_emdash/api/content/pages', '/_emdash/api/content/pages/home/publish', '/_emdash/api/menus/footer-get-started',
    '/_emdash/api/schema/collections', '/_emdash/api/taxonomies', '/_emdash/api/media', '/_emdash/api/sections', '/_emdash/api/widget-areas',
    '/_emdash/api/revisions/x', '/%5femdash/api/content/pages',
  ]) {
    assert.deepEqual(await tokenGate(path, 'Bearer ec_pat_fixture'), { allow: true, reason: 'emdash-token' }, path);
  }
  assert.deepEqual(await tokenGate('/_emdash/api/mcp', 'Bearer ec_oat_fixture'), { allow: true, reason: 'emdash-token' });
  record('An EmDash API or OAuth token reaches EmDash on /_emdash/api REST and MCP without an Access sign-in');

  for (const path of [
    '/_emdash/admin', '/_emdash/admin/content/pages', '/_emdash/api/admin/api-tokens', '/_emdash/api/admin/users',
    '/_emdash/api/ADMIN/api-tokens', '/_emdash/api/setup/status', '/_emdash/api/auth/login', '/_emdash/api/oauth/token',
    '/_emdash/api//admin/api-tokens', '/_emdash/api/content/../admin/api-tokens', '/_emdash/api/./admin/users',
    '/_emdash/api/content/%2f..%2fadmin', '/_emdash/api%2fadmin/api-tokens', '/_emdash/api\\admin', '/_emdash/api',
    // EmDash public routes skip Bearer checks and read a saved session; plugin routes stay with people.
    '/_emdash/api/snapshot', '/_emdash/api/search', '/_emdash/api/search/suggest', '/_emdash/api/comments/pages/x',
    '/_emdash/api/media/file/key', '/_emdash/api/plugins/dinkuskit-operator/approvals', '/_emdash/api/settings',
    '/_emdash/api/health', '/_emdash/api/manifest', '/_emdash/api/Content/pages', '/_emdash/api/MCP', '/_emdash/api/contentx',
  ]) {
    const decision = await tokenGate(path, 'Bearer ec_pat_fixture');
    assert.equal(decision.allow, false, path);
  }
  record('A token never opens the admin UI, token and user management, setup, sign-in, OAuth, public session-reading routes, plugins, settings, or a path with empty, dot or escaped segments');

  for (const cookie of ['astro-session=stale', 'CF_Authorization=spoofed', 'x=1']) {
    const decision = await tokenGate('/_emdash/api/content/pages', 'Bearer ec_pat_fixture', async () => true, { cookie });
    assert.deepEqual(decision, { allow: false, status: 404, reason: 'unauthenticated' }, cookie);
  }
  record('A token sent with any cookie gets no token lane, so a saved CMS session never rides on it; it needs Access as before');

  for (const authorization of [undefined, 'Bearer ', 'Bearer ec_pat_', 'Bearer not-an-emdash-token', 'Basic ec_pat_fixture', 'bearer ec_pat_fixture']) {
    const decision = await tokenGate('/_emdash/api/content/pages', authorization);
    assert.deepEqual(decision, { allow: false, status: 404, reason: 'unauthenticated' }, String(authorization));
  }
  record('Without an EmDash-shaped token the request still needs Access, as before');

  for (const hasActiveAdmin of [async () => false, async () => { throw new Error('no db'); }, null]) {
    assert.deepEqual(
      await tokenGate('/_emdash/api/content/pages', 'Bearer ec_pat_fixture', hasActiveAdmin),
      { allow: false, status: 404, reason: 'token-before-admin' },
    );
  }
  record('Tokens are refused until the CMS has an enabled human Admin (fails closed)');

  assert.equal(hasEmdashToken(new Request('http://127.0.0.1/', { headers: { authorization: 'Bearer ec_pat_x' } })), true);
  assert.equal(isAgentApiPath('/_emdash/api/mcp'), true);
  assert.equal(isAgentApiPath('/_emdash/api/oauth'), false);
  assert.equal(isAgentApiPath('/_emdash/api/snapshot'), false);
  assert.equal(hasEmdashToken(new Request('http://127.0.0.1/', { headers: { authorization: 'Bearer ec_pat_x', cookie: 'a=b' } })), false);
  record('Token and path helpers match the gate');
}

console.log(checks.map((check) => `PASS ${check}`).join('\n'));
