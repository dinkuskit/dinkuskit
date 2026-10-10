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
    const again=await start('payments'); assert.equal((await token(again)).status,400,'revoked Payments needs fresh consent');
    assert.equal((await approve(again)).headers.get('location'),again.callback,'the owner reconnects Payments by explicit consent'); assert.equal((await token(again)).status,200);

    // Set up Commerce: one store key, traded for passes for the services that are on.
    const siteId=payments.body.site_id;
    const post=async (jar,fields)=>request(runtime,jar,'/account/sites',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:await accountForm(runtime,jar,new URLSearchParams(fields).toString())});
    const createKey=async ()=>{ const page=await post(owner,{action:'store_key',site_id:siteId}); assert.equal(page.status,200); assert.equal(page.headers.get('cache-control'),'private, no-store'); return (await page.text()).match(/<code>(dk_store_[A-Za-z0-9_-]{43})<\/code>/)?.[1]; };
    const trade=(key,scope,audience)=>request(runtime,new Map(),'/api/store-passes',{method:'POST',headers:{authorization:`Bearer ${key}`},body:JSON.stringify({site_id:siteId,scope,audience})});
    const setup=await (await request(runtime,owner,'/account/sites')).text();
    assert.match(setup,/Set up Commerce/); assert.match(setup,/Create store key/); assert.match(setup,/Turn on Coupons/);
    const key=await createKey(); assert.ok(key,'the new key is shown once');
    assert.doesNotMatch(await (await request(runtime,owner,'/account/sites')).text(),new RegExp(key),'the key is never shown again');
    const pass=await trade(key,'payments:checkout','dinkus-payments'); assert.equal(pass.status,200);
    const issued=await pass.json(); assert.equal(issued.token_type,'Bearer'); assert.equal(issued.expires_in,300);
    const claims=JSON.parse(Buffer.from(issued.access_token.split('.')[1],'base64url').toString());
    assert.equal(claims.aud,'dinkus-payments'); assert.equal(claims.scope,'payments:checkout'); assert.equal(claims.site_id,siteId); assert.equal(claims.iss,'https://dinkuskit.com/account');
    assert.equal((await post(outsider,{action:'service',site_id:siteId,service:'coupons',on:'1'})).status,303);
    assert.equal((await post(outsider,{action:'store_key',site_id:siteId})).status,303,'another business cannot make a key for this store');
    assert.deepEqual(await (await trade(key,'coupons:checkout','dinkus-coupons')).json(),{error:'service_not_enabled'},'another business cannot turn on Coupons for this store');
    assert.equal((await post(owner,{action:'service',site_id:siteId,service:'coupons',on:'1'})).status,303);
    assert.equal((await trade(key,'coupons:checkout','dinkus-coupons')).status,200);
    assert.match(await (await request(runtime,owner,'/account/sites')).text(),/Turn off Coupons/);
    const replaced=await createKey(); assert.notEqual(replaced,key);
    assert.deepEqual(await (await trade(key,'payments:checkout','dinkus-payments')).json(),{error:'invalid_store_key'},'Replace key stops the old key');
    assert.equal((await trade(replaced,'payments:checkout','dinkus-payments')).status,200);
    assert.doesNotMatch(await (await request(runtime,outsider,'/account/sites')).text(),/Set up Commerce/);
  } finally { await stopRuntime(runtime); }
});
