import { startCmsMerchantTestRuntime, stopRuntime, signup, request } from '../tests/helpers/merchant-harness.mjs';
import { createAuthenticatedEditor } from '../tests/helpers/emdash-editor.mjs';

// Loopback-only synthetic fixture. Session is obtained through real EmDash passkey APIs.
// The test entry transfers that opaque synthetic session to the browser without logging it.
const runtime = await startCmsMerchantTestRuntime({ port: 47864 });
const form = body => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() });
try {
  const editor = await createAuthenticatedEditor(runtime);
  if (!editor.ok) throw new Error(`cms_session_failed:${editor.stage}`);
  const organizations = [];
  for (const [email, name, sms] of [['redwood@example.test', 'Redwood Works', false], ['lakeside@example.test', 'Lakeside Lab', true]]) {
    const merchant = await signup(runtime, email);
    const created = await request(runtime, merchant.jar, '/api/account/organizations', form({ name }));
    if (created.status !== 303) throw new Error('pending_fixture_failed');
    const id = new URL(created.headers.get('location'), runtime.origin).searchParams.get('organization_id');
    if (sms) await request(runtime, new Map(), '/__proof/approvals', { method: 'POST', body: JSON.stringify({ organizationId: id, profile: { channel: 'phone', emailVerified: 1, phoneVerified: 1 } }) });
    organizations.push({ name, path: `/account/organization-approvals/${id}` });
  }
  await request(runtime, new Map(), '/__proof/approvals', { method: 'POST', body: JSON.stringify({ mode: 'failure' }) });
  await request(runtime, new Map(), '/__proof/cms-browser', { method: 'POST', body: JSON.stringify({ cookies: [...editor.jar.values()] }) });
  console.log(JSON.stringify({ syntheticOnly: true, origin: runtime.origin, browserStart: '/__proof/cms-browser', organizations, emailMode: 'failure' }));
  const stop = async () => { await stopRuntime(runtime); process.exit(0); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
} catch (error) { await stopRuntime(runtime); throw error; }
