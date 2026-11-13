import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { readFile } from 'node:fs/promises';
import { parseAgentCatalogFeed, FEED_SCHEMA } from '../catalog/src/feed.ts';
import { universalProductId } from '../catalog/src/ids.ts';
import { listListedStores } from '../catalog/src/listing.ts';
import { handleRpc } from '../catalog/src/mcp.ts';
import { matchExpression } from '../catalog/src/search.ts';
import { refreshCatalog } from '../catalog/src/sync.ts';
import { handleRequest } from '../catalog/src/worker.ts';

/** better-sqlite3 behind the D1 calls the catalog uses; batch runs in one transaction. */
function d1(sqlite) {
  const statement = (sql) => {
    let stmt; try { stmt = sqlite.prepare(sql); } catch (error) { throw new Error(`${error.message}: ${sql}`); } let values = [];
    const execute = () => stmt.reader
      ? { success: true, results: stmt.all(...values), meta: { changes: 0 } }
      : { success: true, meta: { changes: stmt.run(...values).changes } };
    const wrapper = {
      bind(...v) { values = v; return wrapper; },
      async first() { return stmt.reader ? stmt.get(...values) ?? null : null; },
      async all() { return { success: true, results: stmt.all(...values) }; },
      async run() { return execute(); },
      execute,
    };
    return wrapper;
  };
  return { prepare: statement, async batch(statements) { return sqlite.transaction(() => statements.map(s => s.execute()))(); } };
}

async function catalogDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(await readFile(new URL('../catalog/migrations/0001_catalog.sql', import.meta.url), 'utf8'));
  return d1(sqlite);
}

const usd = (minor) => ({ currency: 'USD', minor: String(minor), formatted: `$${(minor / 100).toFixed(2)} USD` });
const feedFor = (origin, storeName, products) => ({
  schema: FEED_SCHEMA, storeName, siteOrigin: origin, products,
  policies: [{ slug: 'returns', title: 'Returns', url: `${origin}/returns` }, { slug: 'shipping', title: 'Shipping', url: `${origin}/shipping` }],
});
const ALPHA = 'https://alpha.example', BETA = 'https://beta.example';
const alphaFeed = () => feedFor(ALPHA, 'Alpha Outfitters', [
  {
    id: 'hat', sku: 'HAT', title: 'Wool Trail Hat', canonicalUrl: `${ALPHA}/products/hat`, description: 'A warm <b>wool</b> hat for cold trails.',
    imageUrls: [`${ALPHA}/media/hat.jpg`, 'http://insecure.example/x.jpg'], price: usd(2500), availability: { status: 'in_stock', sellable: true },
    brand: 'Northpeak', gtin: '4006381333931', aiProjection: { highlights: ['Merino wool'] },
  },
  {
    id: 'tee', sku: 'TEE', title: 'Trail Tee', canonicalUrl: `${ALPHA}/products/tee`, description: 'Soft cotton tee.',
    imageUrls: [`${ALPHA}/media/tee.jpg`], availability: { status: 'in_stock', sellable: true },
    variants: { productId: 'tee', options: [], members: [
      { catalogItemId: 'tee-blue-s', selections: [{ optionLabel: 'Color', valueLabel: 'Blue' }, { optionLabel: 'Size', valueLabel: 'S' }], price: usd(1800), availability: { status: 'in_stock', sellable: true } },
      { catalogItemId: 'tee-blue-m', selections: [{ optionLabel: 'Color', valueLabel: 'Blue' }, { optionLabel: 'Size', valueLabel: 'M' }], price: usd(1800), availability: { status: 'out_of_stock', sellable: false } },
      { catalogItemId: 'tee-red-m', selections: [{ optionLabel: 'Color', valueLabel: 'Red' }, { optionLabel: 'Size', valueLabel: 'M' }], price: usd(2000), availability: { status: 'in_stock', sellable: true } },
    ] },
  },
  { id: 'mug', sku: 'MUG', title: 'Camp Mug', canonicalUrl: `${ALPHA}/products/mug`, description: 'Enamel mug.', price: usd(1200), availability: { status: 'out_of_stock', sellable: false } },
  { id: 'elsewhere', title: 'Off-site product', canonicalUrl: 'https://evil.example/products/x', price: usd(100), availability: { sellable: true } },
]);
const betaFeed = () => feedFor(BETA, 'Beta Goods', [
  { id: 'b-hat', sku: 'BH', title: 'Northpeak Wool Hat', canonicalUrl: `${BETA}/products/wool-hat`, description: 'Same hat, other shop.', price: usd(2300), availability: { status: 'in_stock', sellable: true }, brand: 'Northpeak', gtin: '4006381333931' },
]);

const fetcher = (feeds) => async (address) => {
  const origin = new URL(address).origin;
  return feeds[origin] ? new Response(JSON.stringify(feeds[origin]), { status: 200 }) : new Response('no', { status: 503 });
};
const stores = [{ siteId: 'site-alpha', siteOrigin: ALPHA }, { siteId: 'site-beta', siteOrigin: BETA }];
const call = async (db, name, catalog) => (await handleRpc(db, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: { catalog } } })).result.structuredContent;

test('a feed is read as plain, checked rows and refused when it is for another site', () => {
  const parsed = parseAgentCatalogFeed(alphaFeed(), ALPHA);
  assert.equal(parsed.offers.length, 3);
  assert.equal(parsed.skipped, 1, 'a product whose page is on another site is left out');
  assert.equal(parsed.offers[0].description, 'A warm wool hat for cold trails.');
  assert.deepEqual(parsed.offers[0].images, [`${ALPHA}/media/hat.jpg`]);
  assert.deepEqual(parsed.policies.map(policy => policy.type), ['refund_policy', 'shipping_policy']);
  assert.deepEqual(parseAgentCatalogFeed(alphaFeed(), BETA), { error: 'feed_is_for_another_site' });
  assert.deepEqual(parseAgentCatalogFeed({ products: [] }, ALPHA), { error: 'not_a_catalog_feed' });
});

test('the same barcode, or brand and part number, gives one product id; otherwise the id is the store\'s own', async () => {
  const base = { brand: null, mpn: null, gtin: null, siteId: 'a', storeProductId: 'p' };
  const one = await universalProductId({ ...base, gtin: '4006381333931' });
  const two = await universalProductId({ ...base, gtin: '04006381333931', siteId: 'b', storeProductId: 'q' });
  assert.equal(one.upid, two.upid);
  assert.equal(one.basis, 'gtin');
  const three = await universalProductId({ ...base, brand: 'North Peak', mpn: 'WH-01' });
  const four = await universalProductId({ ...base, brand: 'northpeak', mpn: 'wh01', siteId: 'b' });
  assert.equal(three.upid, four.upid);
  assert.notEqual((await universalProductId(base)).upid, (await universalProductId({ ...base, siteId: 'b' })).upid);
});

test('search groups one product across stores, hides what cannot be bought, and filters by price and shop', async () => {
  const db = await catalogDb();
  const results = await refreshCatalog(db, stores, fetcher({ [ALPHA]: alphaFeed(), [BETA]: betaFeed() }), 1000);
  assert.deepEqual(results.map(result => [result.outcome, result.products]), [['updated', 3], ['updated', 1]]);

  const hats = await call(db, 'search_catalog', { query: 'wool hat' });
  assert.equal(hats.ucp.version, '2026-08-25');
  assert.equal(hats.products.length, 1, 'one product, two sellers');
  assert.deepEqual(hats.products[0].variants.map(variant => [variant.seller.name, variant.price.amount]), [['Beta Goods', 2300], ['Alpha Outfitters', 2500]]);
  assert.equal(hats.products[0].metadata.seller_count, 2);
  assert.deepEqual(hats.products[0].price_range.min, { amount: 2300, currency: 'USD' });
  assert.equal(hats.products[0].variants[1].seller.links[0].type, 'refund_policy');
  assert.match(hats.products[0].id, /^dkp_[0-9a-f]{24}$/);

  assert.equal((await call(db, 'search_catalog', { query: 'mug' })).products.length, 0, 'sold out is hidden by default');
  assert.equal((await call(db, 'search_catalog', { query: 'mug', filters: { available: false } })).products.length, 1);
  const cheap = await call(db, 'search_catalog', { filters: { price: { max: 1900 } } });
  assert.deepEqual(cheap.products.map(product => product.title), ['Trail Tee']);
  assert.deepEqual(cheap.products[0].variants.map(variant => variant.title), ['Blue / S', 'Red / M'], 'the sold-out size is left out');
  const onlyBeta = await call(db, 'search_catalog', { query: 'hat', filters: { shops: ['site-beta'] } });
  assert.equal(onlyBeta.products.length, 1);
  assert.equal((await call(db, 'search_catalog', { query: 'hat', filters: { ships_to: { country: 'DE' } } })).products.length, 0);
  const ignored = await call(db, 'search_catalog', { query: 'hat', filters: { rating: { variant: { min: 4 } } } });
  assert.deepEqual(ignored.messages, [{ type: 'warning', code: 'unsupported_filter', content: 'rating' }]);
  assert.equal((await call(db, 'search_catalog', {})).ucp.status, 'error');

  const paged = await call(db, 'search_catalog', { query: 'trail hat tee', pagination: { limit: 1 } });
  assert.equal(paged.products.length, 1);
  assert.equal(paged.pagination.has_next_page, true);
  const next = await call(db, 'search_catalog', { query: 'trail hat tee', pagination: { limit: 1, cursor: paged.pagination.cursor } });
  assert.notEqual(next.products[0].id, paged.products[0].id);
});

test('lookup and get_product answer by product id, variant id and page address', async () => {
  const db = await catalogDb();
  await refreshCatalog(db, stores, fetcher({ [ALPHA]: alphaFeed(), [BETA]: betaFeed() }), 1000);
  const tee = (await call(db, 'search_catalog', { query: 'tee' })).products[0];
  const red = tee.variants.find(variant => variant.title === 'Red / M');

  const looked = await call(db, 'lookup_catalog', { ids: [red.id, `${ALPHA}/products/hat?utm=1`, 'dkp_missing'] });
  assert.deepEqual(looked.products.map(product => product.title), ['Trail Tee', 'Northpeak Wool Hat'], 'the lowest-priced store leads a shared product');
  assert.deepEqual(looked.products[0].variants.map(variant => variant.inputs), [[{ id: red.id, match: 'exact' }]]);
  assert.deepEqual(looked.messages, [{ type: 'info', code: 'not_found', content: 'dkp_missing' }]);

  const full = await call(db, 'get_product', { id: tee.id, selected: [{ name: 'Color', label: 'Blue' }] });
  assert.deepEqual(full.product.selected, [{ name: 'Color', label: 'Blue' }]);
  const size = full.product.options.find(option => option.name === 'Size');
  assert.deepEqual(size.values, [{ label: 'S', exists: true, available: true }, { label: 'M', exists: true, available: false }]);
  assert.deepEqual(full.product.variants.map(variant => variant.title), ['Blue / S', 'Blue / M']);

  const relaxed = await call(db, 'get_product', { id: tee.id, selected: [{ name: 'Color', label: 'Red' }, { name: 'Size', label: 'S' }], preferences: ['Color', 'Size'] });
  assert.deepEqual(relaxed.product.selected, [{ name: 'Color', label: 'Red' }], 'no red in S, so size is relaxed first');
  assert.equal((await call(db, 'get_product', { id: 'dkp_nope' })).ucp.status, 'error');
});

test('a store that changes, fails or leaves the list is kept right', async () => {
  const db = await catalogDb();
  const feeds = { [ALPHA]: alphaFeed(), [BETA]: betaFeed() };
  await refreshCatalog(db, stores, fetcher(feeds), 1000);
  assert.deepEqual((await refreshCatalog(db, stores, fetcher(feeds), 1300)).map(result => result.outcome), ['unchanged', 'unchanged']);

  feeds[BETA].products[0].price = usd(1999);
  delete feeds[ALPHA];
  const third = await refreshCatalog(db, stores, fetcher(feeds), 1600);
  assert.deepEqual(third.map(result => result.outcome), ['failed', 'updated']);
  const hats = await call(db, 'search_catalog', { query: 'wool hat' });
  assert.deepEqual(hats.products[0].variants.map(variant => variant.price.amount), [1999, 2500], 'a store that cannot be read keeps its last good products');

  await refreshCatalog(db, [stores[0]], fetcher(feeds), 1900);
  const after = await call(db, 'search_catalog', { query: 'wool hat' });
  assert.deepEqual(after.products[0].variants.map(variant => variant.seller.name), ['Alpha Outfitters'], 'a delisted store is gone');
});

test('search words never reach the query language', () => {
  assert.equal(matchExpression('wool "hat" OR NEAR(x) *'), '"wool" OR "hat" OR "or" OR "near"');
  assert.equal(matchExpression('! ? *'), null);
});

test('the agent address speaks MCP and publishes the UCP profile', async () => {
  const db = await catalogDb();
  const env = { CATALOG_DB: db, MERCHANT_DB: db, UNNAMED_AGENT_LIMIT: { limit: async ({ key }) => ({ success: key !== '203.0.113.9' }) } };
  const post = (body, headers = {}) => handleRequest(new Request('https://catalog.dinkuskit.com/api/ucp/mcp', { method: 'POST', headers, body: JSON.stringify(body) }), env);
  const init = await (await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })).json();
  assert.equal(init.result.serverInfo.name, 'dinkuskit-catalog');
  const tools = await (await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).json();
  assert.deepEqual(tools.result.tools.map(tool => tool.name), ['search_catalog', 'lookup_catalog', 'get_product']);
  assert.equal((await post({ jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
  assert.equal((await post({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, { 'cf-connecting-ip': '203.0.113.9' })).status, 429);
  assert.equal((await handleRequest(new Request('https://catalog.dinkuskit.com/api/ucp/mcp'), env)).status, 405);
  assert.equal((await handleRequest(new Request('https://catalog.dinkuskit.com/elsewhere'), env)).status, 404);
  const profile = await (await handleRequest(new Request('https://catalog.dinkuskit.com/.well-known/ucp'), env)).json();
  assert.equal(profile.ucp.services['dev.ucp.shopping'][0].endpoint, 'https://catalog.dinkuskit.com/api/ucp/mcp');
});

test('only connected, approved, payment-ready stores the owner left on are listed', async () => {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE dinkuskit_store_identity (site_id TEXT PRIMARY KEY, site_origin TEXT, account_subject TEXT, created_at INTEGER);
    CREATE TABLE dinkuskit_organization (organization_id TEXT, status TEXT, admission_status TEXT, owner_user_id TEXT, authority_subject TEXT);
    CREATE TABLE dinkuskit_account (user_id TEXT, disabled INTEGER);
    CREATE TABLE dinkuskit_membership (organization_id TEXT, user_id TEXT, role TEXT, status TEXT);
    CREATE TABLE dinkuskit_plugin_key (site_id TEXT, plugin TEXT);
    CREATE TABLE dinkuskit_service_grant (site_id TEXT, service TEXT, revoked INTEGER, revoked_by TEXT);
  `);
  const business = (name, admission = 'admitted') => {
    sqlite.prepare('INSERT INTO dinkuskit_organization VALUES (?, ?, ?, ?, ?)').run(`org-${name}`, 'active', admission, `user-${name}`, `sub-${name}`);
    sqlite.prepare('INSERT INTO dinkuskit_account VALUES (?, 0)').run(`user-${name}`);
    sqlite.prepare("INSERT INTO dinkuskit_membership VALUES (?, ?, 'owner', 'active')").run(`org-${name}`, `user-${name}`);
  };
  const store = (name, { origin = `https://${name}.example`, payments = true } = {}) => {
    sqlite.prepare('INSERT INTO dinkuskit_store_identity VALUES (?, ?, ?, 1)').run(`site-${name}`, origin, `sub-${name}`);
    if (payments) sqlite.prepare("INSERT INTO dinkuskit_plugin_key VALUES (?, 'payments')").run(`site-${name}`);
  };
  for (const name of ['listed', 'off', 'cutoff', 'nopay', 'test', 'local']) business(name);
  business('pending', 'pending_operator');
  store('listed'); store('off'); store('cutoff'); store('pending'); store('test');
  store('nopay', { payments: false });
  store('local', { origin: 'http://localhost:4321' });
  sqlite.prepare("INSERT INTO dinkuskit_service_grant VALUES ('site-off', 'catalog', 1, 'owner')").run();
  sqlite.prepare("INSERT INTO dinkuskit_service_grant VALUES ('site-cutoff', 'ship', 1, 'operator')").run();
  sqlite.prepare("INSERT INTO dinkuskit_service_grant VALUES ('site-listed', 'catalog', 0, NULL)").run();
  assert.deepEqual(await listListedStores(d1(sqlite), ['https://test.example']), [{ siteId: 'site-listed', siteOrigin: 'https://listed.example' }]);
});
