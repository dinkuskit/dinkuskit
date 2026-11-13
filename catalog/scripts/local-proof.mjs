#!/usr/bin/env node
/**
 * Runs the catalog Worker as it is built for Cloudflare, inside the Workers runtime on
 * this machine, and walks through what an agent sees: a listed store reaching search,
 * then each way a store leaves (owner's switch, operator cut-off, Payments disconnect,
 * a store that stops answering) and the same product ids asked for again.
 *
 * Real here: the bundled Worker, its HTTP address, its timer, both D1 databases with
 * the repository's own migrations, and the rate limits. Stand-ins: the two stores (their
 * feeds are served to the Worker's outbound requests) and the clock for "ten minutes
 * later" (the stored read time is moved back). Workers AI and Vectorize have no local
 * form, so this run answers by words and says so.
 *
 *   npm run proof:catalog
 */
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const root = fileURLToPath(new URL('../..', import.meta.url));
const ADDRESS = 'https://catalog.dinkuskit.com/api/ucp/mcp';
const ALPHA = 'https://alpha-outfitters.example', BETA = 'https://beta-goods.example', PLAYGROUND = 'https://playground.example';

const usd = minor => ({ currency: 'USD', minor: String(minor), formatted: `$${(minor / 100).toFixed(2)} USD` });
const feed = (origin, storeName, products) => ({
  schema: 'dinkuskit.commerce.agent-catalog-feed/v1', storeName, siteOrigin: origin, products,
  policies: [{ slug: 'returns', title: 'Returns', url: `${origin}/returns` }],
});
const hat = (origin, title, price) => ({
  id: 'hat', sku: 'HAT', title, canonicalUrl: `${origin}/products/hat`, description: 'A warm wool hat.', price: usd(price),
  availability: { status: 'in_stock', sellable: true }, brand: 'Northpeak', gtin: '4006381333931',
});
/** What each store's feed address answers right now; `null` is a store that is down. */
const feeds = {
  [ALPHA]: feed(ALPHA, 'Alpha Outfitters', [hat(ALPHA, 'Wool Trail Hat', 2500)]),
  [BETA]: feed(BETA, 'Beta Goods', [hat(BETA, 'Northpeak Wool Hat', 2300)]),
  [PLAYGROUND]: feed(PLAYGROUND, 'Playground', [hat(PLAYGROUND, 'Test Hat', 100)]),
};

const statements = sql => sql.replace(/^\s*--.*$/gm, '').split(/;\s*(?:\n|$)/).map(text => text.trim()).filter(Boolean);
async function migrate(db, directory) {
  for (const file of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
    for (const sql of statements(await readFile(join(directory, file), 'utf8'))) await db.prepare(sql).run();
  }
}
/** Inserts a row, filling the table's other required columns with plain values. */
async function insert(db, table, values) {
  const columns = (await db.prepare(`PRAGMA table_info("${table}")`).all()).results;
  const row = { ...values };
  for (const column of columns) {
    if (column.name in row || !column.notnull || column.dflt_value !== null) continue;
    row[column.name] = /INT|DATE|TIME/i.test(column.type) ? 1 : `${table}-${column.name}-${values.site_id ?? values.user_id ?? values.id ?? 'x'}`;
  }
  const names = Object.keys(row);
  await db.prepare(`INSERT INTO "${table}" (${names.map(name => `"${name}"`).join(',')}) VALUES (${names.map(() => '?').join(',')})`).bind(...Object.values(row)).run();
}

const outDir = await mkdtemp(join(tmpdir(), 'dinkuskit-catalog-'));
let mf;
const failures = [];
const check = (label, actual, expected) => {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures.push(label);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}\n      ${JSON.stringify(actual)}${pass ? '' : `\n      expected ${JSON.stringify(expected)}`}`);
};
try {
  execFileSync(join(root, 'node_modules/.bin/wrangler'), ['deploy', '--dry-run', '--outdir', outDir, '-c', join(root, 'catalog/wrangler.jsonc')], { cwd: root, stdio: 'pipe' });
  mf = new Miniflare(convertV4MiniflareOptions({
    workers: [{
      name: 'dinkuskit-catalog', modules: true, modulesRoot: outDir, scriptPath: join(outDir, 'worker.js'), compatibilityDate: '2026-09-29',
      d1Databases: { CATALOG_DB: 'catalog', MERCHANT_DB: 'merchant' },
      ratelimits: {
        NAMED_AGENT_LIMIT: { namespace_id: '2001', simple: { limit: 50, period: 10 } },
        UNNAMED_AGENT_LIMIT: { namespace_id: '2002', simple: { limit: 30, period: 60 } },
      },
      bindings: { CATALOG_EXCLUDED_ORIGINS: PLAYGROUND },
      outboundService(request) {
        const url = new URL(request.url), body = feeds[url.origin];
        if (url.pathname !== '/feeds/agent-catalog.json' || !body) return new Response('unavailable', { status: 503 });
        return Response.json(body);
      },
    }],
  }));
  const catalogDb = await mf.getD1Database('CATALOG_DB'), merchantDb = await mf.getD1Database('MERCHANT_DB');
  await migrate(catalogDb, join(root, 'catalog/migrations'));
  await migrate(merchantDb, join(root, 'migrations/merchant'));
  const connect = async (name, origin) => {
    await insert(merchantDb, 'user', { id: `user-${name}`, email: `${name}@example.test` });
    await insert(merchantDb, 'dinkuskit_account', { user_id: `user-${name}`, subject: `sub-${name}`, disabled: 0 });
    await insert(merchantDb, 'dinkuskit_organization', { organization_id: `org-${name}`, owner_user_id: `user-${name}`, authority_subject: `sub-${name}`, status: 'active', admission_status: 'admitted' });
    await insert(merchantDb, 'dinkuskit_membership', { organization_id: `org-${name}`, user_id: `user-${name}`, role: 'owner', status: 'active' });
    await insert(merchantDb, 'dinkuskit_store_identity', { site_id: `site-${name}`, site_origin: origin, account_subject: `sub-${name}` });
    await insert(merchantDb, 'dinkuskit_plugin_key', { site_id: `site-${name}`, plugin: 'payments' });
    await insert(merchantDb, 'dinkuskit_service_grant', { site_id: `site-${name}`, service: 'ship', revoked: 0 });
  };
  for (const [name, origin] of [['alpha', ALPHA], ['beta', BETA], ['playground', PLAYGROUND]]) await connect(name, origin);

  const worker = await mf.getWorker();
  const timer = () => worker.scheduled({ cron: '*/5 * * * *' });
  let address = 0;
  const post = (body, from) => mf.dispatchFetch(ADDRESS, {
    method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': from ?? `192.0.2.${(address += 1)}` }, body: JSON.stringify(body),
  });
  const tool = async (name, catalog) => (await (await post({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: { catalog } } })).json()).result.structuredContent;
  const sellers = product => (product?.variants ?? []).map(variant => `${variant.seller.name} ${variant.price.amount}`);
  const search = async () => (await tool('search_catalog', { query: 'wool hat', filters: { available: false } })).products;
  const lookup = async id => sellers((await tool('lookup_catalog', { ids: [id] })).products[0]);
  const detail = async id => { const answer = await tool('get_product', { id }); return answer.product ? sellers(answer.product) : answer.messages[0].code; };

  console.log('\n== 1. Listed stores reach the public agent address ==');
  const profile = await (await mf.dispatchFetch('https://catalog.dinkuskit.com/.well-known/ucp')).json();
  check('the UCP profile names the agent address', profile.ucp.services['dev.ucp.shopping'][0].endpoint, ADDRESS);
  const tools = await (await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).json();
  check('the three catalog tools are offered', tools.result.tools.map(entry => entry.name), ['search_catalog', 'lookup_catalog', 'get_product']);
  check('before the first read the catalog is empty', (await search()).length, 0);
  await timer();
  const first = await tool('search_catalog', { query: 'wool hat' });
  const product = first.products[0], productId = product.id;
  const alphaVariant = product.variants.find(variant => variant.seller.name === 'Alpha Outfitters').id;
  const betaVariant = product.variants.find(variant => variant.seller.name === 'Beta Goods').id;
  check('search: one product, both stores, lowest price first; the playground store is never listed', sellers(product), ['Beta Goods 2300', 'Alpha Outfitters 2500']);
  check('with no model bound the answer says it matched words only', first.messages.map(entry => entry.code), ['meaning_search_unavailable']);
  check('lookup_catalog by product id', await lookup(productId), ['Beta Goods 2300', 'Alpha Outfitters 2500']);
  check('get_product by product page address', await detail(`${ALPHA}/products/hat`), ['Beta Goods 2300', 'Alpha Outfitters 2500']);

  console.log('\n== 2. A price change shows in full detail at once, and in search by the next read ==');
  feeds[BETA].products[0].price = usd(1999);
  await catalogDb.prepare('UPDATE catalog_store SET validated_at = validated_at - 60').run();
  check('search still holds the last read', sellers((await search())[0]), ['Beta Goods 2300', 'Alpha Outfitters 2500']);
  check('get_product reads the store again first', await detail(productId), ['Beta Goods 1999', 'Alpha Outfitters 2500']);

  console.log('\n== 3. The owner switches the catalog off in the store admin (the store\'s feed lists nothing) ==');
  feeds[BETA].products = [];
  await timer();
  check('search', sellers((await search())[0]), ['Alpha Outfitters 2500']);
  check('the Beta variant id an agent kept', await lookup(betaVariant), []);
  feeds[BETA].products = [hat(BETA, 'Northpeak Wool Hat', 1999)];
  await timer();
  check('switched back on, the store returns with the next read', sellers((await search())[0]), ['Beta Goods 1999', 'Alpha Outfitters 2500']);

  console.log('\n== 4. The operator cuts a store off ==');
  await merchantDb.prepare("UPDATE dinkuskit_service_grant SET revoked = 1, revoked_by = 'operator' WHERE site_id = 'site-beta'").run();
  await catalogDb.prepare('UPDATE catalog_store SET validated_at = validated_at - 60').run();
  check('get_product, before any timed read, already leaves the store out', await detail(productId), ['Alpha Outfitters 2500']);
  check('search', sellers((await search())[0]), ['Alpha Outfitters 2500']);
  check('the Beta variant id an agent kept', await lookup(betaVariant), []);
  await merchantDb.prepare("UPDATE dinkuskit_service_grant SET revoked = 0, revoked_by = NULL WHERE site_id = 'site-beta'").run();
  await timer();
  check('restored, the store returns', sellers((await search())[0]), ['Beta Goods 1999', 'Alpha Outfitters 2500']);

  console.log('\n== 5. Payments is disconnected ==');
  await merchantDb.prepare("DELETE FROM dinkuskit_plugin_key WHERE site_id = 'site-alpha' AND plugin = 'payments'").run();
  await timer();
  check('search', sellers((await search())[0]), ['Beta Goods 1999']);
  check('the Alpha variant id an agent kept', await lookup(alphaVariant), []);
  check('the Alpha product page address', await detail(`${ALPHA}/products/hat`), 'not_found');
  await insert(merchantDb, 'dinkuskit_plugin_key', { site_id: 'site-alpha', plugin: 'payments' });
  await timer();
  check('connected again, the store returns', sellers((await search())[0]), ['Beta Goods 1999', 'Alpha Outfitters 2500']);

  console.log('\n== 6. A store stops answering ==');
  feeds[ALPHA] = null;
  await catalogDb.prepare("UPDATE catalog_store SET validated_at = validated_at - 300 WHERE site_id = 'site-alpha'").run();
  await timer();
  const store = await catalogDb.prepare("SELECT last_error, read_at - validated_at >= 300 AS age_still_counts_from_last_good_read FROM catalog_store WHERE site_id = 'site-alpha'").first();
  check('the failed read is recorded and does not count as fresh', store, { last_error: 'feed_status_503', age_still_counts_from_last_good_read: 1 });
  check('inside ten minutes the last good products stay', sellers((await search())[0]), ['Beta Goods 1999', 'Alpha Outfitters 2500']);
  await catalogDb.prepare("UPDATE catalog_store SET validated_at = validated_at - 301 WHERE site_id = 'site-alpha'").run();
  check('ten minutes after its last good read, with no timed read in between, search leaves it out', sellers((await search())[0]), ['Beta Goods 1999']);
  check('the Alpha variant id an agent kept', await lookup(alphaVariant), []);
  await timer();
  check('still down at the next read, still out', sellers((await search())[0]), ['Beta Goods 1999']);

  console.log('\n== 7. The timer itself stops ==');
  await catalogDb.prepare('UPDATE catalog_store SET validated_at = validated_at - 601').run();
  check('nothing older than ten minutes is answered: search', (await search()).length, 0);
  check('lookup_catalog by the product id', await lookup(productId), []);
  check('get_product by the product id', await detail(productId), 'not_found');

  console.log('\n== 8. Ten stores sell the product and the most expensive one is cut off ==');
  feeds[ALPHA] = feed(ALPHA, 'Alpha Outfitters', [hat(ALPHA, 'Wool Trail Hat', 2500)]);
  for (let number = 1; number <= 8; number += 1) {
    const origin = `https://shop-${number}.example`;
    feeds[origin] = feed(origin, `Shop ${number}`, [hat(origin, 'Wool Hat', 3000 + number)]);
    await connect(`shop-${number}`, origin);
  }
  await timer();
  const ten = ['Beta Goods 1999', 'Alpha Outfitters 2500', ...Array.from({ length: 8 }, (_, index) => `Shop ${index + 1} ${3001 + index}`)];
  check('get_product lists all ten sellers', await detail(productId), ten);
  await merchantDb.prepare("UPDATE dinkuskit_service_grant SET revoked = 1, revoked_by = 'operator' WHERE site_id = 'site-shop-8'").run();
  check('the tenth seller, cut off since the last read, is left out of the very next answer', await detail(productId), ten.slice(0, 9));

  console.log('\n== 9. The list of listed stores cannot be read ==');
  await merchantDb.prepare('ALTER TABLE dinkuskit_plugin_key RENAME TO dinkuskit_plugin_key_away').run();
  check('get_product gives no detail it could not check', await detail(productId), 'temporarily_unavailable');
  await merchantDb.prepare('ALTER TABLE dinkuskit_plugin_key_away RENAME TO dinkuskit_plugin_key').run();
  check('readable again, detail returns', await detail(productId), ten.slice(0, 9));

  console.log('\n== 10. Limits count by address; a new agent profile does not open a new allowance ==');
  const asAgent = number => post({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_catalog', arguments: { meta: { 'ucp-agent': { profile: `https://agent.example/${number}` } }, catalog: { query: 'hat' } } } }, '198.51.100.7');
  const named = [];
  for (let number = 1; number <= 55; number += 1) named.push((await asAgent(number)).status);
  check('55 requests from one address, each under a different profile', { answered: named.filter(status => status === 200).length, refused: named.filter(status => status === 429).length }, { answered: 50, refused: 5 });
  const unnamed = [];
  for (let number = 1; number <= 33; number += 1) unnamed.push((await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, '198.51.100.8')).status);
  check('33 requests from an agent that does not name itself', { answered: unnamed.filter(status => status === 200).length, refused: unnamed.filter(status => status === 429).length }, { answered: 30, refused: 3 });
} finally {
  await mf?.dispose();
  await rm(outDir, { recursive: true, force: true });
}
console.log(failures.length ? `\n${failures.length} check(s) failed.` : '\nEvery check passed.');
process.exit(failures.length ? 1 : 0);
