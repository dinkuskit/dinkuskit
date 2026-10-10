import { startCmsMerchantTestRuntime, stopRuntime, signup, request } from '../tests/helpers/merchant-harness.mjs';
import { createAuthenticatedEditor } from '../tests/helpers/emdash-editor.mjs';

// Loopback-only synthetic fixture for clicking through the operator admin pages.
// The EmDash Admin session comes from real passkey APIs; the test entry hands that
// opaque synthetic session to the browser at /__proof/cms-browser without logging it.
const runtime = await startCmsMerchantTestRuntime({ port: Number(process.env.PROOF_PORT ?? 47864) });
const form = body => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() });
const fixture = body => request(runtime, new Map(), '/__proof/approvals', { method: 'POST', body: JSON.stringify(body) });
try {
  const editor = await createAuthenticatedEditor(runtime);
  if (!editor.ok) throw new Error(`cms_session_failed:${editor.stage}`);
  await fixture({ mode: 'success' });
  // First businesses are approved automatically (first 50); a second business waits for an answer.
  const owners = {};
  for (const email of ['redwood@example.test', 'lakeside@example.test', 'harbor@example.test']) {
    const merchant = await signup(runtime, email);
    if (merchant.completed.status !== 303) throw new Error('signup_fixture_failed');
    owners[email] = merchant;
  }
  const second = await request(runtime, owners['redwood@example.test'].jar, '/api/account/organizations', form({ name: 'Redwood Wholesale' }));
  if (second.status !== 303) throw new Error('pending_fixture_failed');
  const orgs = await (await request(runtime, owners['lakeside@example.test'].jar, '/api/account/organizations')).json();
  await fixture({ store: { organizationId: orgs.organizations[0].organizationId, siteId: 'synthetic-lakeside-site',
    origin: 'https://lakeside-shop.example.test', services: ['payments', 'inventory'] } });
  await request(runtime, new Map(), '/__proof/cms-browser', { method: 'POST', body: JSON.stringify({ cookies: [...editor.jar.values()] }) });
  console.log(JSON.stringify({ syntheticOnly: true, origin: runtime.origin, browserStart: '/__proof/cms-browser',
    pages: ['/_emdash/admin/plugins/dinkuskit-operator/approvals', '/_emdash/admin/plugins/dinkuskit-operator/people', '/_emdash/admin/plugins/dinkuskit-operator/stores'] }));
  const stop = async () => { await stopRuntime(runtime); process.exit(0); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
} catch (error) { await stopRuntime(runtime); throw error; }
