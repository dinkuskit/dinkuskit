import { startMerchantTestRuntime, stopRuntime, signup, request } from '../tests/helpers/merchant-harness.mjs';

// Local-only synthetic browser fixture. Production never imports this entry.
const runtime = await startMerchantTestRuntime({ port: 47861 });
try {
  const actors = [];
  for (const email of ['operator@example.test', 'redwood@example.test', 'lakeside@example.test']) {
    const { jar } = await signup(runtime, email);
    const person = await (await request(runtime, new Map(), '/__proof/foundation?email=' + encodeURIComponent(email))).json();
    const orgs = await (await request(runtime, jar, '/api/account/organizations')).json();
    actors.push({ email, userId: person.userId, organizationId: orgs.organizations[0].organizationId });
  }
  const [operator, redwood, lakeside] = actors;
  await request(runtime, new Map(), '/__proof/inventory-overview', { method: 'POST', body: JSON.stringify({ organizationId: redwood.organizationId, seed_bindings: true }) });
  const grants = [{ userId: operator.userId, resourceType: 'directory', resourceId: 'directory' }];
  for (const actor of actors) for (const [resourceType, resourceId] of [['person', actor.userId], ['organization', actor.organizationId]]) grants.push({ userId: operator.userId, resourceType, resourceId });
  for (const id of ['site-north', 'site-south']) grants.push({ userId: operator.userId, resourceType: 'store', resourceId: id });
  await request(runtime, new Map(), '/__proof/operator-directory', { method: 'POST', body: JSON.stringify({ grants, detach_user: operator.userId, organization_names: [
    { organizationId: operator.organizationId, name: 'Local demonstration' },
    { organizationId: redwood.organizationId, name: 'Redwood Works' },
    { organizationId: lakeside.organizationId, name: 'Lakeside Lab' },
  ] }) });
  console.log(JSON.stringify({ syntheticOnly: true, origin: runtime.origin, email: operator.email, directory: '/account/operator', mailbox: '/__proof/browser', organization: '/account/operator/organizations/' + redwood.organizationId }));
  const stop = async () => { await stopRuntime(runtime); process.exit(0); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
} catch (error) { await stopRuntime(runtime); throw error; }
