import { startMerchantTestRuntime, startProductionWorker, stopRuntime, signup, request } from '../tests/helpers/merchant-harness.mjs';

// Local-only synthetic browser fixture. Production never imports this entry.
const runtime = await startMerchantTestRuntime({ port: 47861 });
let missingRuntime;
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
  await request(runtime, new Map(), '/__proof/operator-directory', { method: 'POST', body: JSON.stringify({ use_persisted: true, persisted_grants: [{ userId: operator.userId }], detach_user: operator.userId, organization_names: [
    { organizationId: operator.organizationId, name: 'Local demonstration' },
    { organizationId: redwood.organizationId, name: 'Redwood Works' },
    { organizationId: lakeside.organizationId, name: 'Lakeside Lab' },
  ] }) });
  missingRuntime = await startProductionWorker();
  console.log(JSON.stringify({ syntheticOnly: true, origin: runtime.origin, missingRuntimeOrigin: missingRuntime.origin, email: operator.email, directory: '/account/operator', mailbox: '/__proof/browser', organizations: [redwood, lakeside].map(actor => '/account/operator/organizations/' + actor.organizationId), actors }));
  const stop = async () => { await stopRuntime(runtime); await stopRuntime(missingRuntime); process.exit(0); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
} catch (error) { await stopRuntime(runtime); if (missingRuntime) await stopRuntime(missingRuntime); throw error; }
