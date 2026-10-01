import assert from 'node:assert/strict';
import { Role } from '@emdash-cms/auth';
import { authenticate as officialAuthenticate } from '@emdash-cms/cloudflare/auth';
import {
  ACCESS_AUDIENCE_ENV,
  ACCESS_TEAM_DOMAIN_ENV,
  INSTALLED_EDITOR_ROLE,
  OPERATOR_ALLOWLIST_ENV,
  decodeRoutingPathname,
  evaluateAccessGate,
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

console.log(checks.map((check) => `PASS ${check}`).join('\n'));
