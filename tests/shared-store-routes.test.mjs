import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { accountForm, request, signup, startMerchantTestRuntime, stopRuntime } from './helpers/merchant-harness.mjs';

test('shared service routes require separate consent and display processor setup authority', async () => {
  let runtime = await startMerchantTestRuntime(); const owner = new Map(); const outsider = new Map();
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
    const createKey=async ()=>{ const page=await post(owner,{action:'store_key',site_id:siteId}); assert.equal(page.status,200); assert.equal(page.headers.get('cache-control'),'private, no-store'); const html=await page.text(); assert.ok(/<button type="button" data-copy-target="store-key-[^"]+" data-copy-status="store-key-status-[^"]+" hidden[^>]*>Copy store key<\/button>/.test(html),'the key has a Copy button'); assert.ok(/<p id="store-key-status-[^"]+" role="status" aria-live="polite"[^>]*><\/p>/.test(html),'copy feedback has a live region'); assert.ok(/<script type="module">[\s\S]*clipboard[\s\S]*<\/script>/.test(html),'the copy handler is bundled into the page'); return html.match(/<code id="store-key-[^"]+"[^>]*>(dk_store_[A-Za-z0-9_-]{43})<\/code>/)?.[1]; };
    const trade=(key,scope,audience)=>request(runtime,new Map(),'/api/store-passes',{method:'POST',headers:{authorization:`Bearer ${key}`},body:JSON.stringify({site_id:siteId,scope,audience})});
    const setup=await (await request(runtime,owner,'/account/sites')).text();
    assert.match(setup,/Set up Commerce/); assert.match(setup,/Create store key/); assert.match(setup,/Turn on Ship/);
    assert.match(setup,/Coupons: Coming soon/); assert.doesNotMatch(setup,/Turn on Coupons/,'Commerce takes no coupon codes in v1');
    const key=await createKey(); assert.ok(key,'the new key is shown once');
    assert.doesNotMatch(await (await request(runtime,owner,'/account/sites')).text(),new RegExp(key),'the key is never shown again');
    const pass=await trade(key,'payments:checkout','dinkus-payments'); assert.equal(pass.status,200);
    const issued=await pass.json(); assert.equal(issued.token_type,'Bearer'); assert.equal(issued.expires_in,300);
    const claims=JSON.parse(Buffer.from(issued.access_token.split('.')[1],'base64url').toString());
    assert.equal(claims.aud,'dinkus-payments'); assert.equal(claims.scope,'payments:checkout'); assert.equal(claims.site_id,siteId); assert.equal(claims.iss,'https://dinkuskit.com/account');
    assert.equal(claims.site_origin,origin,'the pass carries the store address Connect checked, for Payments return pages');
    assert.equal((await post(outsider,{action:'service',site_id:siteId,service:'ship',on:'1'})).status,303);
    assert.equal((await post(outsider,{action:'store_key',site_id:siteId})).status,303,'another business cannot make a key for this store');
    assert.deepEqual(await (await trade(key,'ship:orders','dinkus-ship')).json(),{error:'service_not_enabled'},'another business cannot turn on Ship for this store');
    assert.equal((await post(owner,{action:'service',site_id:siteId,service:'coupons',on:'1'})).status,303);
    assert.deepEqual(await (await trade(key,'coupons:checkout','dinkus-coupons')).json(),{error:'service_not_enabled'},'Coupons cannot be turned on while it is coming soon');
    assert.equal((await post(owner,{action:'service',site_id:siteId,service:'ship',on:'1'})).status,303);
    const shipPass=await trade(key,'ship:orders','dinkus-ship'); assert.equal(shipPass.status,200);
    assert.equal(JSON.parse(Buffer.from((await shipPass.json()).access_token.split('.')[1],'base64url').toString()).site_origin,origin);
    assert.match(await (await request(runtime,owner,'/account/sites')).text(),/Turn off Ship/);
    const replaced=await createKey(); assert.notEqual(replaced,key);
    assert.deepEqual(await (await trade(key,'payments:checkout','dinkus-payments')).json(),{error:'invalid_store_key'},'Replace key stops the old key');
    assert.equal((await trade(replaced,'payments:checkout','dinkus-payments')).status,200);
    assert.doesNotMatch(await (await request(runtime,outsider,'/account/sites')).text(),/Set up Commerce/);

    // Checkout settings: read from Payments' own status and shown to paste into Commerce.
    const unescape=text=>text.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
    const showSettings=async (jar,fields={})=>{ const page=await post(jar,{action:'checkout_settings',site_id:siteId,shipping_mode:'flat',shipping_amount:'5.00',payments_mode:'test',...fields}); return {status:page.status,html:await page.text()}; };
    assert.match((await showSettings(owner)).html,/could not reach Payments/,'Payments did not answer');
    assert.match((await showSettings(owner,{shipping_amount:'five'})).html,/Enter the flat shipping charge in dollars/);
    assert.equal((await request(runtime,new Map(),'/__proof/payments-status',{method:'POST',body:JSON.stringify({site_id:siteId,body:{state:'ready',bindingRef:'bind_route_1',connectionEvidence:{provider:'stripe',accountRef:'acct_1RouteTest'}}})})).status,200);
    const shown=await showSettings(owner); assert.equal(shown.status,200);
    const settings=JSON.parse(unescape(shown.html.match(/<pre><code>([\s\S]*?)<\/code><\/pre>/)[1]));
    assert.equal(settings.schema,'dinkuskit.commerce.registry-checkout/v1'); assert.equal(settings.commerceOrigin,origin); assert.equal(settings.siteId,siteId);
    assert.deepEqual([settings.bindingRef,settings.providerId,settings.stripeAccountId,settings.mode],['bind_route_1','stripe','acct_1RouteTest','test']);
    assert.deepEqual(settings.shipping,{configurationId:`shipping-${siteId}`,revision:1,mode:'flat',amount:{currency:'USD',minor:'500'}});
    assert.deepEqual(settings.ship,{origin:'https://ship.dinkuskit.com',audience:'dinkus-ship'}); assert.equal('coupons' in settings,false,'Coupons is coming soon');
    const call=await (await request(runtime,new Map(),`/__proof/payments-status-call?site_id=${encodeURIComponent(siteId)}`)).json();
    const statusClaims=JSON.parse(Buffer.from(call.token.split('.')[1],'base64url').toString());
    assert.deepEqual([statusClaims.aud,statusClaims.scope,statusClaims.site_id],['dinkus-payments','payments:admin',siteId]);
    const outside=await showSettings(outsider,{shipping_amount:'9.00'}); assert.doesNotMatch(outside.html,/bind_route_1/,'another business sees no settings for this store');
    assert.match(await (await request(runtime,owner,'/account/sites')).text(),/value="5\.00"/,'the saved charge is kept, not the outsider\'s');
    const turnOffShip=await post(owner,{action:'service',site_id:siteId,service:'ship',on:'0'});
    assert.equal(turnOffShip.headers.get('location'),`/account/sites?changed=${siteId}`);
    assert.match(await (await request(runtime,owner,`/account/sites?changed=${siteId}`)).text(),/paste them into Commerce/);
    const withoutShip=JSON.parse(unescape((await showSettings(owner)).html.match(/<pre><code>([\s\S]*?)<\/code><\/pre>/)[1]));
    assert.equal('ship' in withoutShip,false,'Ship is left out once it is off'); assert.equal(withoutShip.shipping.revision,1,'the charge did not change');

    // Sign in with DinkusKit.com for Ship's label page.
    const pkce=()=>{ const verifier=randomBytes(32).toString('base64url'); return {verifier,challenge:createHash('sha256').update(verifier).digest('base64url')}; };
    const shipState=`route-state-${'s'.repeat(32)}`;
    const shipPath=challenge=>`/account/ship-sign-in?${new URLSearchParams({site_id:siteId,state:shipState,code_challenge:challenge,code_challenge_method:'S256'})}`;
    const shipBack=async (jar,path)=>{ const page=await request(runtime,jar,path); assert.equal(page.status,303); assert.equal(page.headers.get('referrer-policy'),'no-referrer'); const url=new URL(page.headers.get('location')); assert.equal(`${url.origin}${url.pathname}`,'https://ship.dinkuskit.com/auth/callback'); assert.equal(url.searchParams.get('state'),shipState); return url; };
    const shipToken=body=>request(runtime,new Map(),'/api/ship-sign-in/token',{method:'POST',body:JSON.stringify(body)});
    const first=pkce();
    const signedOut=await request(runtime,new Map(),shipPath(first.challenge));
    assert.equal(signedOut.headers.get('location'),`/account/sign-in?callbackURL=${encodeURIComponent(shipPath(first.challenge))}`,'sign-in first, then back to the same request');
    assert.equal((await shipBack(owner,shipPath(first.challenge))).searchParams.get('error'),'ship_not_enabled','Ship is off');
    assert.equal((await post(owner,{action:'service',site_id:siteId,service:'ship',on:'1'})).status,303);
    const back=await shipBack(owner,shipPath(first.challenge));
    const signed=await shipToken({code:back.searchParams.get('code'),code_verifier:first.verifier}); assert.equal(signed.status,200);
    const signedBody=await signed.json();
    const shipClaims=JSON.parse(Buffer.from(signedBody.access_token.split('.')[1],'base64url').toString());
    assert.deepEqual([shipClaims.aud,shipClaims.scope,shipClaims.site_id,shipClaims.email,shipClaims.iss],['dinkus-ship','ship:labels',siteId,'shared-owner@example.test','https://dinkuskit.com/account']);
    assert.equal((await shipToken({code:back.searchParams.get('code'),code_verifier:first.verifier})).status,400,'a code works once');
    const refreshed=await shipToken({grant_type:'refresh_token',refresh_token:signedBody.refresh_token}); assert.equal(refreshed.status,200);
    assert.equal((await shipBack(outsider,shipPath(pkce().challenge))).searchParams.get('error'),'access_denied','another business');
    assert.equal((await shipBack(owner,`${shipPath(first.challenge)}&redirect_uri=${encodeURIComponent('https://evil.example.test/')}`)).searchParams.get('error'),'invalid_request','the return address cannot be changed');
    const noState=await request(runtime,owner,`/account/ship-sign-in?site_id=${siteId}`); assert.equal(noState.status,400); assert.match(await noState.text(),/not complete/);
    // Restart only this local fixture with the exact server-owned registration.
    // Persistent identity, grant and key survive; no fixture auth endpoint bypasses the built routes.
    const legacyRefresh = (await refreshed.json()).refresh_token;
    const oldPending = pkce();
    const oldBack = await shipBack(owner,shipPath(oldPending.challenge));
    const prior = runtime;
    await prior.worker.stop();
    runtime = await startMerchantTestRuntime({ persistTo: prior.persistTo, secret: prior.secret, jwt: prior.jwt, origin: prior.origin, port: Number(new URL(prior.origin).port), shipSandboxRegistration: { siteId, generation: 'test-generation-1' } });
    runtime.ownedPersist = prior.ownedPersist;
    assert.equal((await trade(replaced,'ship:orders','dinkus-ship')).status,403);
    const sandboxPass = generation => request(runtime,new Map(),'/api/store-passes',{method:'POST',headers:{authorization:`Bearer ${replaced}`},body:JSON.stringify({site_id:siteId,scope:'ship:orders',audience:'dinkus-ship-sandbox',generation})});
    assert.equal((await sandboxPass('stale-generation')).status,403);
    const machine = await sandboxPass('test-generation-1'); assert.equal(machine.status,200);
    const machineClaims = JSON.parse(Buffer.from((await machine.json()).access_token.split('.')[1],'base64url').toString());
    assert.deepEqual([machineClaims.aud,machineClaims.ship_recipient,machineClaims.ship_generation,machineClaims.ship_mode],['dinkus-ship-sandbox','ship-sandbox','test-generation-1','test']);
    assert.equal((await shipToken({code:oldBack.searchParams.get('code'),code_verifier:oldPending.verifier})).status,400,'legacy code cannot upgrade');
    assert.equal((await shipToken({grant_type:'refresh_token',refresh_token:legacyRefresh})).status,400,'legacy family cannot upgrade');
    const isolatedSettings = JSON.parse(unescape((await showSettings(owner)).html.match(/<pre><code>([\s\S]*?)<\/code><\/pre>/)[1]));
    assert.deepEqual(isolatedSettings.ship,{origin:'https://ship.sm0ky.dev',audience:'dinkus-ship-sandbox',recipient:'ship-sandbox',generation:'test-generation-1',mode:'test'});
    assert.equal((await showSettings(owner,{payments_mode:'live'})).status,400);
    assert.equal((await sandboxPass('test-generation-1')).status,200,'refused live save did not change persisted TEST setting');
    const isolatedPkce = pkce();
    const isolatedPage = await request(runtime,owner,shipPath(isolatedPkce.challenge));
    assert.equal(isolatedPage.status,303);
    const isolatedBack = new URL(isolatedPage.headers.get('location'));
    assert.equal(isolatedBack.origin,'https://ship.sm0ky.dev');
    const isolatedToken = await shipToken({code:isolatedBack.searchParams.get('code'),code_verifier:isolatedPkce.verifier});
    assert.equal(isolatedToken.status,200);
    const isolatedBody = await isolatedToken.json();
    const isolatedClaims = JSON.parse(Buffer.from(isolatedBody.access_token.split('.')[1],'base64url').toString());
    assert.deepEqual([isolatedClaims.aud,isolatedClaims.scope,isolatedClaims.ship_generation],['dinkus-ship-sandbox','ship:labels','test-generation-1']);
    assert.equal((await shipToken({grant_type:'refresh_token',refresh_token:isolatedBody.refresh_token})).status,200);
    assert.equal((await request(runtime,owner,'/account/logout',{method:'POST'})).status,303);
    assert.deepEqual(await (await shipToken({grant_type:'refresh_token',refresh_token:legacyRefresh})).json(),{error:'invalid_grant'},'signing out of DinkusKit.com ends Ship\'s sign-in');
  } finally { await stopRuntime(runtime); }
});

test('Connect to DinkusKit through the routes: Commerce first, a key per plugin, settings read, Disconnect', async () => {
  const runtime = await startMerchantTestRuntime(); const owner = new Map();
  try {
    await signup(runtime,'plugin-owner@example.test',owner);
    const origin = 'https://plugin-connect.example.test';
    const paths = { commerce:['dinkus-commerce-emdash','r_gshdrqaldna3r7sn/settings'], payments:['dinkus-payments-emdash','r_3brsc2on3bu673rn/status'], ship:['dinkus-ship-emdash','r_ehdlg5cxkb3ffqvr/shipping'] };
    const form = async (jar,fields)=>({method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:await accountForm(runtime,jar,new URLSearchParams(fields).toString())});
    async function start(service) {
      const verifier = randomBytes(32).toString('base64url'); const challenge = createHash('sha256').update(verifier).digest('base64url');
      const [client, path] = paths[service]; const callback = `${origin}/_emdash/admin/plugins/${path}`;
      const response = await request(runtime,new Map(),'/api/store-connections',{method:'POST',body:JSON.stringify({protocol_version:2,client_id:client,service,site_origin:origin,callback_uri:callback,code_challenge:challenge,code_challenge_method:'S256'})});
      const body = await response.json();
      if (response.status === 200) await request(runtime,new Map(),'/__proof/receipt',{method:'POST',body:JSON.stringify({version:2,connection_id:body.connection_id,challenge:body.challenge,client_id:client,service,site_id:body.site_id,site_origin:origin,callback_uri:callback,code_challenge:challenge,expires_at:body.expires_at})});
      return { status: response.status, body, client, verifier, callback, path:`/account/connect?connection_id=${body.connection_id}` };
    }
    async function connect(service) {
      const c = await start(service); assert.equal(c.status,200,`${service} starts`);
      const page = await (await request(runtime,owner,c.path)).text();
      assert.match(page,/own store key/,`the approval page says ${service} gets its own key`);
      assert.equal((await request(runtime,owner,c.path,await form(owner,{action:'approve'}))).headers.get('location'),c.callback);
      const token = await request(runtime,new Map(),'/api/store-connections/token',{method:'POST',body:JSON.stringify({client_id:c.client,connection_id:c.body.connection_id,code_verifier:c.verifier})});
      assert.equal(token.status,200); return { ...c, issued: await token.json() };
    }
    const early = await start('ship'); assert.deepEqual([early.status, early.body], [409, { error: 'connect_commerce_first' }]);
    const commerce = await connect('commerce'); assert.equal(commerce.issued.access_token, undefined); assert.match(commerce.issued.store_key, /^dk_store_/);
    const siteId = commerce.issued.site_id;
    const sites = await (await request(runtime,owner,'/account/sites')).text();
    assert.match(sites,/plugin-connect\.example\.test/,'a store with only Commerce connected is on Your stores');
    assert.match(sites,/Commerce plugin: connected/); assert.match(sites,/Disconnect Commerce/); assert.match(sites,/Payments plugin: not connected/);
    assert.doesNotMatch(sites,/No store is connected yet/);
    const home=await (await request(runtime,owner,'/account')).text();
    assert.match(home,/Your store is connected/,'the account page counts a store Commerce alone connected'); assert.match(home,/plugin-connect\.example\.test/);
    const payments = await connect('payments'); assert.equal(payments.issued.site_id, siteId); assert.match(payments.issued.store_key, /^dk_store_/);
    const trade = (key,scope,audience)=>request(runtime,new Map(),'/api/store-passes',{method:'POST',headers:{authorization:`Bearer ${key}`},body:JSON.stringify({site_id:siteId,scope,audience})});
    assert.equal((await trade(payments.issued.store_key,'payments:checkout','dinkus-payments')).status,200);
    assert.deepEqual(await (await trade(payments.issued.store_key,'commerce:settings','dinkuskit')).json(),{error:'scope_not_allowed'});
    assert.equal((await request(runtime,owner,'/account/sites',await form(owner,{action:'service',site_id:siteId,service:'ship',on:'1'}))).status,303);
    const ship = await connect('ship'); assert.equal((await trade(ship.issued.store_key,'ship:admin','dinkus-ship')).status,200);
    // Commerce reads its settings itself.
    assert.equal((await request(runtime,owner,'/account/sites',await form(owner,{action:'checkout_settings',site_id:siteId,shipping_mode:'flat',shipping_amount:'4.00',payments_mode:'test'}))).status,200);
    assert.equal((await request(runtime,new Map(),'/__proof/payments-status',{method:'POST',body:JSON.stringify({site_id:siteId,body:{state:'ready',bindingRef:'bind_plugin_1',connectionEvidence:{provider:'stripe',accountRef:'acct_1PluginTest'}}})})).status,200);
    const settingsPass = (await (await trade(commerce.issued.store_key,'commerce:settings','dinkuskit')).json()).access_token;
    const read = await request(runtime,new Map(),'/api/commerce-settings',{headers:{authorization:`Bearer ${settingsPass}`}});
    assert.equal(read.status,200); const settings = await read.json();
    assert.deepEqual([settings.siteId,settings.commerceOrigin,settings.bindingRef,settings.shipping.amount.minor,settings.ship.audience],[siteId,origin,'bind_plugin_1','400','dinkus-ship']);
    assert.equal((await request(runtime,new Map(),'/api/commerce-settings')).status,401);
    // Disconnect stops only that plugin's key.
    assert.equal((await request(runtime,owner,'/account/sites',await form(owner,{action:'disconnect_plugin',site_id:siteId,plugin:'ship'}))).status,303);
    assert.deepEqual(await (await trade(ship.issued.store_key,'ship:admin','dinkus-ship')).json(),{error:'invalid_store_key'});
    assert.equal((await trade(commerce.issued.store_key,'ship:orders','dinkus-ship')).status,200);
    assert.match(await (await request(runtime,owner,'/account/sites')).text(),/Ship plugin: not connected/);
  } finally { await stopRuntime(runtime); }
});

test('Connect authority through the real Worker: another business, a late exchange after Disconnect, a suspended business', async () => {
  const runtime = await startMerchantTestRuntime(); const owner = new Map(), other = new Map();
  // Change the local D1 the Worker is using, as an operator action would.
  const d1 = sql => { const r = spawnSync('node_modules/.bin/wrangler',['d1','execute','dinkuskit-merchant-local','--local','--persist-to',runtime.persistTo,'--config','wrangler.jsonc','--yes','--json','--command',sql],{encoding:'utf8'}); assert.equal(r.status,0,r.stderr); return JSON.parse(r.stdout).at(-1).results; };
  try {
    await signup(runtime,'authority-owner@example.test',owner);
    await signup(runtime,'authority-other@example.test',other);
    const origin = 'https://plugin-authority.example.test';
    const paths = { commerce:['dinkus-commerce-emdash','r_gshdrqaldna3r7sn/settings'], payments:['dinkus-payments-emdash','r_3brsc2on3bu673rn/status'] };
    const form = async (jar,fields)=>({method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:await accountForm(runtime,jar,new URLSearchParams(fields).toString())});
    async function start(service) {
      const verifier = randomBytes(32).toString('base64url'); const challenge = createHash('sha256').update(verifier).digest('base64url');
      const [client, path] = paths[service]; const callback = `${origin}/_emdash/admin/plugins/${path}`;
      const body = await (await request(runtime,new Map(),'/api/store-connections',{method:'POST',body:JSON.stringify({protocol_version:2,client_id:client,service,site_origin:origin,callback_uri:callback,code_challenge:challenge,code_challenge_method:'S256'})})).json();
      await request(runtime,new Map(),'/__proof/receipt',{method:'POST',body:JSON.stringify({version:2,connection_id:body.connection_id,challenge:body.challenge,client_id:client,service,site_id:body.site_id,site_origin:origin,callback_uri:callback,code_challenge:challenge,expires_at:body.expires_at})});
      return { body, client, verifier, path:`/account/connect?connection_id=${body.connection_id}` };
    }
    const approve = async (jar,c)=>request(runtime,jar,c.path,await form(jar,{action:'approve'}));
    const exchange = async c=>{ const r = await request(runtime,new Map(),'/api/store-connections/token',{method:'POST',body:JSON.stringify({client_id:c.client,connection_id:c.body.connection_id,code_verifier:c.verifier})}); return { status:r.status, body:await r.json() }; };
    const commerce = await start('commerce'); await approve(owner,commerce); const commerceKey = (await exchange(commerce)).body.store_key;
    const payments = await start('payments'); await approve(owner,payments); assert.equal((await exchange(payments)).status,200);
    const siteId = commerce.body.site_id;
    const keys = () => d1(`SELECT plugin FROM dinkuskit_plugin_key WHERE site_id = '${siteId}' ORDER BY plugin`).map(r => r.plugin);
    assert.deepEqual(keys(),['commerce','payments']);
    const trade = (key,scope,audience)=>request(runtime,new Map(),'/api/store-passes',{method:'POST',headers:{authorization:`Bearer ${key}`},body:JSON.stringify({site_id:siteId,scope,audience})});

    // Another business cannot approve a Connect for this store, so no key is handed over.
    const foreign = await start('commerce');
    await approve(other,foreign);
    assert.deepEqual(await exchange(foreign),{status:400,body:{error:'authorization_pending',interval:5}});
    assert.equal((await trade(commerceKey,'payments:checkout','dinkus-payments')).status,200,'the owner\'s key still works');

    // A business suspended inside a settings pass's five minutes gets nothing, and no Payments call is made.
    assert.equal((await request(runtime,owner,'/account/sites',await form(owner,{action:'checkout_settings',site_id:siteId,shipping_mode:'free',payments_mode:'test'}))).status,200);
    await request(runtime,new Map(),'/__proof/payments-status',{method:'POST',body:JSON.stringify({site_id:siteId,body:{state:'ready',bindingRef:'bind_authority',connectionEvidence:{provider:'stripe',accountRef:'acct_1Authority'}}})});
    const pass = (await (await trade(commerceKey,'commerce:settings','dinkuskit')).json()).access_token;
    const read = () => request(runtime,new Map(),'/api/commerce-settings',{headers:{authorization:`Bearer ${pass}`}});
    const lastCall = async () => (await (await request(runtime,new Map(),`/__proof/payments-status-call?site_id=${siteId}`)).json()).token;
    assert.equal((await read()).status,200); const called = await lastCall(); assert.ok(called);
    const subject = `(SELECT account_subject FROM dinkuskit_store_identity WHERE site_id = '${siteId}')`;
    d1(`UPDATE dinkuskit_organization SET status = 'suspended' WHERE authority_subject = ${subject}`);
    const suspended = await read();
    assert.deepEqual([suspended.status, await suspended.json()],[403,{error:'store_suspended'}]);
    assert.equal(await lastCall(),called,'no Payments status call for a suspended store');
    assert.deepEqual(await (await trade(commerceKey,'commerce:settings','dinkuskit')).json(),{error:'store_suspended'});
    d1(`UPDATE dinkuskit_organization SET status = 'active' WHERE authority_subject = ${subject}`);
    assert.equal((await read()).status,200);

    // An approved Connect not yet picked up dies with Disconnect.
    const late = await start('commerce');
    assert.equal((await approve(owner,late)).status,303);
    assert.equal((await request(runtime,owner,'/account/sites',await form(owner,{action:'disconnect_plugin',site_id:siteId,plugin:'commerce'}))).status,303);
    assert.deepEqual(await exchange(late),{status:400,body:{error:'access_denied'}});
    assert.deepEqual(keys(),['payments'],'no Commerce key came back');
    assert.deepEqual(await (await trade(commerceKey,'payments:checkout','dinkus-payments')).json(),{error:'invalid_store_key'});
  } finally { await stopRuntime(runtime); }
});
