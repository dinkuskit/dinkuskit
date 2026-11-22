import { pathToFileURL } from 'node:url';
const { request, signup, startMerchantTestRuntime, stopRuntime } = await import(pathToFileURL(process.cwd() + '/tests/helpers/merchant-harness.mjs').href);
const runtime = await startMerchantTestRuntime();
try {
  const owner = await signup(runtime, 'smoke-148@example.com');
  const orgId = (await (await request(runtime, owner.jar, '/api/account/organizations')).json()).organizations[0].organizationId;
  for (const path of ['/account/inventory', `/account/operator/inventory?organization_id=${orgId}`, '/account', '/account/sites', '/account/connect', '/account/.well-known/jwks.json']) {
    const r = await request(runtime, owner.jar, path, { redirect: 'manual' });
    console.log(`${r.status}  GET ${path.replace(orgId, '<org>')}`);
  }
} finally { await stopRuntime(runtime); }
