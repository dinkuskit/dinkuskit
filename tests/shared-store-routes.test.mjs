import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, createHash } from 'node:crypto';
import { accountForm, request, signup, startMerchantTestRuntime, stopRuntime } from './helpers/merchant-harness.mjs';

test('shared service routes require separate consent and display processor setup authority', async () => {
  const runtime = await startMerchantTestRuntime(); const owner = new Map(); const outsider = new Map();
  try {
    await signup(runtime,'shared-owner@example.test',owner); await signup(runtime,'shared-outsider@example.test',outsider);
    const origin = 'https://shared-route.example.test';
    async function start(service) {
      const verifier = randomBytes(32).toString('base64url'); const challenge = createHash('sha256').update(verifier).digest('base64url');
      const client = `dinkus-${service}-emdash`;
      const callback = `${origin}/_emdash/admin/plugins/${service === 'payments' ? 'r_3brsc2on3bu673rn/status' : 'dinkus-inventory/inventory'}`;
      const response = await request(runtime,new Map(),'/api/store-connections',{method:'POST',body:JSON.stringify({protocol_version:2,client_id:client,service,site_origin:origin,callback_uri:callback,code_challenge:challenge,code_challenge_method:'S256'})});
      assert.equal(response.status,200); const body=await response.json();
      assert.equal(body.protocol_version,2);
      const receipt={version:2,connection_id:body.connection_id,challenge:body.challenge,client_id:client,service,site_id:body.site_id,site_origin:origin,callback_uri:callback,code_challenge:challenge,expires_at:body.expires_at};
      assert.equal((await request(runtime,new Map(),'/__proof/receipt',{method:'POST',body:JSON.stringify(receipt)})).status,200);
      return {body,client,verifier,callback,path:`/account/connect?connection_id=${body.connection_id}`};
    }
    async function approve(c,jar=owner) { return request(runtime,jar,c.path,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:await accountForm(runtime,jar,'action=approve')}); }
    async function token(c) { return request(runtime,new Map(),'/api/store-connections/token',{method:'POST',body:JSON.stringify({client_id:c.client,connection_id:c.body.connection_id,code_verifier:c.verifier})}); }
    const inventory=await start('inventory'); assert.equal((await approve(inventory)).headers.get('location'),inventory.callback);
    const payments=await start('payments'); assert.equal(payments.body.site_id,inventory.body.site_id);
    assert.equal((await token(payments)).status,400);
    const consent=await request(runtime,owner,payments.path); assert.equal(consent.status,200); const html=await consent.text();
    assert.match(html,/payments/i); assert.match(html,/processor/i); assert.doesNotMatch(html,/read.only access/i);
    assert.equal((await approve(payments)).headers.get('location'),payments.callback); assert.equal((await token(payments)).status,200);
    const sites=await request(runtime,owner,'/account/sites'); const siteHtml=await sites.text(); assert.match(siteHtml,/inventory/i); assert.match(siteHtml,/payments/i);
    const outsideSites=await request(runtime,outsider,'/account/sites'); assert.doesNotMatch(await outsideSites.text(),/shared-route\.example\.test/);
    const revoke=await request(runtime,owner,'/account/sites',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:await accountForm(runtime,owner,new URLSearchParams({action:'revoke',site_id:payments.body.site_id,service:'payments'}).toString())});
    assert.equal(revoke.status,303);
    assert.equal((await token(inventory)).status,200,'Payments revoke leaves Inventory grant redeemable');
    const again=await start('payments'); assert.notEqual((await approve(again)).headers.get('location'),again.callback,'revoked Payments cannot reconnect silently');
  } finally { await stopRuntime(runtime); }
});
