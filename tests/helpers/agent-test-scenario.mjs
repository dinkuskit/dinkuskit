import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { AGENT_IDENTITIES, AGENT_STORE_ORIGIN } from '../fixtures/agent-test-policy.mjs';
import { agentAuth } from './agent-test-harness.mjs';

const pkce = () => {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};
const form = fields => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() });
const post = body => ({ method: 'POST', body: JSON.stringify(body) });

/** HTTP E2E through built Astro/workerd routes; mail and store transport are simulations. */
export async function runAgentTestScenario(runtime) {
  const owner = new Map(); const staff = new Map(); const freshStaff = new Map();
  const request = (...args) => runtime.request(...args);
  assert.equal((await request(new Map(), '/health')).status, 200);
  assert.equal((await request(new Map(), '/account/.well-known/jwks.json')).status, 200);
  for (const [identity, jar] of [['owner', owner], ['staff', staff]]) {
    const login = await agentAuth(runtime, jar, identity);
    assert.equal(login.started.status, 303, 'synthetic signup accepted');
    assert.equal(login.completed.status, 200, 'mail completed without returning a link');
    const page = await request(jar, '/account');
    assert.equal(page.status, 200, 'actual account page after Better Auth signup');
    assert.ok((await page.text()).includes(AGENT_IDENTITIES[identity]), 'account renders its own identity');
  }
  const organizations = async jar => {
    const response = await request(jar, '/api/account/organizations');
    assert.equal(response.status, 200);
    return response.json();
  };
  const own = await organizations(owner); const personal = await organizations(staff);
  const org = own.selectedOrganizationId;
  assert.ok(org); assert.notEqual(org, personal.selectedOrganizationId);
  assert.ok([...owner.values()].join() !== [...staff.values()].join(), 'cookie jars remain distinct');
  const manage = (jar, action, permissions = []) => request(jar, '/api/account/memberships', form([
    ['organization_id', org], ['email', AGENT_IDENTITIES.staff], ['action', action],
    ...permissions.map(value => ['permission', value]),
  ]));
  assert.equal((await manage(owner, 'add_member')).status, 303);
  assert.equal((await manage(owner, 'set_permissions', ['ship:labels'])).status, 303);
  const members = await (await request(owner, '/api/account/memberships')).json();
  const member = members.members.find(item => item.email === AGENT_IDENTITIES.staff);
  assert.equal(member.role, 'member');
  assert.deepEqual(JSON.parse(member.permissions), ['ship:labels']);
  const select = jar => request(jar, '/api/account/organizations', form({ action: 'select', organization_id: org }));
  assert.equal((await select(staff)).status, 303);
  assert.equal((await organizations(staff)).selectedOrganizationId, org, 'staff sees and selects owner organization');
  assert.equal((await request(staff, '/api/account/memberships')).status, 403, 'no membership administration');
  assert.equal((await request(staff, '/account/sites')).status, 403, 'no site administration');
  assert.equal((await manage(staff, 'grant_admin', ['membership:manage'])).status, 403, 'cannot self-elevate');

  const proof = pkce();
  const callback = `${AGENT_STORE_ORIGIN}/_emdash/admin/plugins/dinkus-inventory/inventory`;
  const connectResponse = await request(new Map(), '/api/store-connections', post({
    protocol_version: 2, client_id: 'dinkus-inventory-emdash', service: 'inventory',
    site_origin: AGENT_STORE_ORIGIN, callback_uri: callback, code_challenge: proof.challenge, code_challenge_method: 'S256',
  }));
  assert.equal(connectResponse.status, 200);
  const connection = await connectResponse.json();
  assert.equal((await request(new Map(), '/__agent/receipt', post({
    version: 2, connection_id: connection.connection_id, challenge: connection.challenge,
    client_id: 'dinkus-inventory-emdash', service: 'inventory', site_id: connection.site_id,
    site_origin: AGENT_STORE_ORIGIN, callback_uri: callback, code_challenge: proof.challenge, expires_at: connection.expires_at,
  }))).status, 200);
  const exchange = () => request(new Map(), '/api/store-connections/token', post({
    client_id: 'dinkus-inventory-emdash', connection_id: connection.connection_id, code_verifier: proof.verifier,
  }));
  assert.equal((await exchange()).status, 400, 'store needs explicit consent');
  const path = `/account/connect?connection_id=${connection.connection_id}`;
  const consent = await request(owner, path);
  assert.equal(consent.status, 200); assert.match(await consent.text(), /Connect this store/);
  const approval = await request(owner, path, form({ action: 'approve', organization_id: org }));
  assert.equal(approval.status, 303); assert.equal(approval.headers.get('location'), callback);
  assert.equal((await exchange()).status, 200, 'simulated store proof accepted after real consent');
  assert.equal((await exchange()).status, 400, 'store exchange cannot replay');
  assert.equal((await request(owner, '/account/sites', form({
    action: 'service', organization_id: org, site_id: connection.site_id, service: 'ship', on: '1',
  }))).status, 303);
  const ship = async jar => {
    const proof = pkce();
    const response = await request(jar, `/account/ship-sign-in?${new URLSearchParams({
      site_id: connection.site_id, state: 'agent-test-state-' + 's'.repeat(32),
      code_challenge: proof.challenge, code_challenge_method: 'S256',
    })}`);
    assert.equal(response.status, 303);
    return { callback: new URL(response.headers.get('location'), runtime.origin), proof };
  };
  const signed = await ship(staff);
  assert.equal(signed.callback.searchParams.has('error'), false, 'staff can use Ship');
  const trade = body => request(new Map(), '/api/ship-sign-in/token', post(body));
  const redemption = { code: signed.callback.searchParams.get('code'), code_verifier: signed.proof.verifier };
  assert.ok(redemption.code);
  const issued = await trade(redemption); assert.equal(issued.status, 200);
  const tokens = await issued.json();
  const claims = JSON.parse(Buffer.from(tokens.access_token.split('.')[1], 'base64url').toString());
  assert.equal(claims.scope, 'ship:labels'); assert.equal(claims.email, AGENT_IDENTITIES.staff);
  assert.equal((await trade(redemption)).status, 400, 'Ship code cannot replay');
  assert.equal((await manage(owner, 'set_permissions', [])).status, 303);
  assert.equal((await ship(staff)).callback.searchParams.get('error'), 'access_denied', 'same session loses Ship permission');
  assert.equal((await trade({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token })).status, 400, 'revocation also stops refresh');
  await agentAuth(runtime, freshStaff, 'staff', 'sign-in');
  assert.equal((await select(freshStaff)).status, 303);
  assert.equal((await ship(freshStaff)).callback.searchParams.get('error'), 'access_denied', 'fresh login cannot restore revoked permission');

  assert.equal((await manage(owner, 'remove_member')).status, 303);
  assert.ok(!(await organizations(staff)).organizations.some(item => item.organizationId === org), 'removed staff no longer sees owner organization');
  assert.equal((await select(staff)).status, 403);
  assert.equal((await ship(staff)).callback.searchParams.get('error'), 'access_denied', 'removed existing session cannot use Ship');
  const removedFresh = new Map();
  await agentAuth(runtime, removedFresh, 'staff', 'sign-in');
  assert.ok(!(await organizations(removedFresh)).organizations.some(item => item.organizationId === org), 'fresh login cannot restore removed membership');
  assert.equal((await select(removedFresh)).status, 403);
  assert.equal((await ship(removedFresh)).callback.searchParams.get('error'), 'access_denied');

  const replayJar = new Map();
  const replayed = await request(replayJar, '/__agent/auth/complete', post({ identity: 'staff' }));
  assert.equal(replayed.status, 401); assert.equal(replayed.headers.has('set-cookie'), false);
  assert.equal((await request(replayJar, '/account')).status, 303, 'consumed mail cannot open another session');
  const expiredJar = new Map();
  await request(expiredJar, '/__agent/auth/start', post({ identity: 'staff', intent: 'sign-in' }));
  assert.equal((await request(new Map(), '/__agent/expire-auth', post({}))).status, 200);
  const expired = await request(expiredJar, '/__agent/auth/complete', post({ identity: 'staff' }));
  assert.equal(expired.status, 401); assert.equal(expired.headers.has('set-cookie'), false);
  assert.equal((await request(expiredJar, '/account')).status, 303, 'expired Better Auth mail cannot sign in');
  const recovered = new Map();
  const recovery = await agentAuth(runtime, recovered, 'owner', 'recovery');
  assert.equal(recovery.started.status, 303); assert.equal(recovery.completed.status, 200);
  assert.equal((await request(recovered, '/account')).status, 200, 'recovery uses normal Better Auth lifecycle');
  assert.equal((await request(recovered, '/account/logout', { method: 'POST' })).status, 303);
  assert.equal((await request(recovered, '/account')).status, 303, 'logout ends recovered session');
  return { result: 'passed', identities: ['owner', 'staff'], checks: [
    'real-signup-sign-in-recovery-and-logout', 'independent-cookie-jars', 'owner-organization-membership',
    'ship-only-permission', 'administration-denied', 'same-session-and-fresh-login-revocation',
    'membership-removal-existing-and-fresh-login', 'refresh-revocation', 'mail-expiry-and-consumption', 'store-consent-and-replay', 'ship-code-replay',
  ], transports: { mail: 'synthetic-local-mail', store: 'simulation' } };
}
