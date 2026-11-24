#!/usr/bin/env node
/**
 * Proves that a catalog filled by the Worker as it was before migration 0003 still loads
 * and answers after the upgrade (agent-catalog-store-category-20261124).
 *
 * Two Workers run side by side in the Workers runtime on this machine and share the same
 * two D1 databases: the catalog as it was built from the commit before 0003 was added,
 * and the catalog as it is now. The old Worker fills the catalog through its own timer,
 * the way the live catalog is filled today; the catalog's own category guesses are
 * written where the old Worker's indexing step writes them (Workers AI and Vectorize
 * have no local form). Then 0003 is applied and the new Worker answers from those same
 * stored rows, before and after its first read of the stores.
 *
 *   npm run proof:catalog-upgrade
 *   CATALOG_UPGRADE_FROM=<commit> npm run proof:catalog-upgrade
 */
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const root = fileURLToPath(new URL('../..', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const added = git('log', '-1', '--format=%H', '--diff-filter=A', '--', 'catalog/migrations/0003_store_category.sql');
const from = process.env.CATALOG_UPGRADE_FROM || git('rev-parse', `${added}^`);

const ADDRESS = 'https://catalog.dinkuskit.com/api/ucp/mcp';
const ALPHA = 'https://alpha-outfitters.example', BETA = 'https://beta-goods.example';
const HATS = { id: 'aa-2-17', name: 'Apparel & Accessories > Clothing Accessories > Hats' };
const TOPS = { id: 'aa-1-13', name: 'Apparel & Accessories > Clothing > Clothing Tops' };
const TEES = { id: 'aa-1-13-8', name: 'Apparel & Accessories > Clothing > Clothing Tops > T-Shirts' };

const usd = minor => ({ currency: 'USD', minor: String(minor), formatted: `$${(minor / 100).toFixed(2)} USD` });
const feed = (origin, storeName, products) => ({
  schema: 'dinkuskit.commerce.agent-catalog-feed/v1', storeName, siteOrigin: origin, products,
  policies: [{ slug: 'returns', title: 'Returns', url: `${origin}/returns` }],
});
const hat = (origin, title, price) => ({
  id: 'hat', sku: 'HAT', title, canonicalUrl: `${origin}/products/hat`, description: 'A warm wool hat.', price: usd(price),
  availability: { status: 'in_stock', sellable: true }, brand: 'Northpeak', gtin: '4006381333931',
});
const tee = origin => ({
  id: 'tee', sku: 'TEE', title: 'Trail Tee', canonicalUrl: `${origin}/products/tee`, description: 'Soft cotton tee.', availability: { status: 'in_stock', sellable: true },
  variants: { productId: 'tee', options: [], members: [['Blue', 'S'], ['Red', 'M']].map(([color, size]) => ({
    catalogItemId: `tee-${color}-${size}`.toLowerCase(), price: usd(1800), availability: { status: 'in_stock', sellable: true },
    selections: [{ optionLabel: 'Color', valueLabel: color }, { optionLabel: 'Size', valueLabel: size }],
  })) },
});
const feeds = {
  [ALPHA]: feed(ALPHA, 'Alpha Outfitters', [hat(ALPHA, 'Wool Trail Hat', 2500), tee(ALPHA)]),
  [BETA]: feed(BETA, 'Beta Goods', [hat(BETA, 'Northpeak Wool Hat', 2300)]),
};

const statements = sql => sql.replace(/^\s*--.*$/gm, '').split(/;\s*(?:\n|$)/).map(text => text.trim()).filter(Boolean);
async function migrate(db, directory, files) {
  for (const file of files) for (const sql of statements(await readFile(join(directory, file), 'utf8'))) await db.prepare(sql).run();
}
const sqlFiles = async directory => (await readdir(directory)).filter(name => name.endsWith('.sql')).sort();
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

const work = await mkdtemp(join(tmpdir(), 'dinkuskit-catalog-upgrade-'));
const beforeTree = join(work, 'before'), beforeOut = join(work, 'before-out'), afterOut = join(work, 'after-out');
let mf;
const failures = [];
const check = (label, actual, expected) => {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures.push(label);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}\n      ${JSON.stringify(actual)}${pass ? '' : `\n      expected ${JSON.stringify(expected)}`}`);
};
try {
  execFileSync('sh', ['-c', `mkdir -p "${beforeTree}" && git archive "${from}" catalog | tar -x -C "${beforeTree}"`], { cwd: root });
  const wrangler = join(root, 'node_modules/.bin/wrangler');
  execFileSync(wrangler, ['deploy', '--dry-run', '--outdir', beforeOut, '-c', join(beforeTree, 'catalog/wrangler.jsonc')], { cwd: root, stdio: 'pipe' });
  execFileSync(wrangler, ['deploy', '--dry-run', '--outdir', afterOut, '-c', join(root, 'catalog/wrangler.jsonc')], { cwd: root, stdio: 'pipe' });
  const worker = (name, outDir) => ({
    name, modules: true, modulesRoot: outDir, scriptPath: join(outDir, 'worker.js'), compatibilityDate: '2026-09-29',
    // The same database ids: both Workers read and write the very same stored rows.
    d1Databases: { CATALOG_DB: 'catalog', MERCHANT_DB: 'merchant' },
    ratelimits: {
      NAMED_AGENT_LIMIT: { namespace_id: '2001', simple: { limit: 50, period: 10 } },
      UNNAMED_AGENT_LIMIT: { namespace_id: '2002', simple: { limit: 30, period: 60 } },
    },
    outboundService(request) {
      const url = new URL(request.url), body = feeds[url.origin];
      if (url.pathname !== '/feeds/agent-catalog.json' || !body) return new Response('unavailable', { status: 503 });
      return Response.json(body);
    },
  });
  mf = new Miniflare(convertV4MiniflareOptions({ workers: [worker('catalog-before', beforeOut), worker('catalog-after', afterOut)] }));
  const catalogDb = await mf.getD1Database('CATALOG_DB', 'catalog-before'), merchantDb = await mf.getD1Database('MERCHANT_DB', 'catalog-before');
  const beforeMigrations = await sqlFiles(join(beforeTree, 'catalog/migrations'));
  const newMigrations = (await sqlFiles(join(root, 'catalog/migrations'))).filter(file => !beforeMigrations.includes(file));
  await migrate(catalogDb, join(beforeTree, 'catalog/migrations'), beforeMigrations);
  await migrate(merchantDb, join(root, 'migrations/merchant'), await sqlFiles(join(root, 'migrations/merchant')));
  for (const [name, origin] of [['alpha', ALPHA], ['beta', BETA]]) {
    await insert(merchantDb, 'user', { id: `user-${name}`, email: `${name}@example.test` });
    await insert(merchantDb, 'dinkuskit_account', { user_id: `user-${name}`, subject: `sub-${name}`, disabled: 0 });
    await insert(merchantDb, 'dinkuskit_organization', { organization_id: `org-${name}`, owner_user_id: `user-${name}`, authority_subject: `sub-${name}`, status: 'active', admission_status: 'admitted' });
    await insert(merchantDb, 'dinkuskit_membership', { organization_id: `org-${name}`, user_id: `user-${name}`, role: 'owner', status: 'active' });
    await insert(merchantDb, 'dinkuskit_store_identity', { site_id: `site-${name}`, site_origin: origin, account_subject: `sub-${name}` });
    await insert(merchantDb, 'dinkuskit_plugin_key', { site_id: `site-${name}`, plugin: 'payments' });
    await insert(merchantDb, 'dinkuskit_service_grant', { site_id: `site-${name}`, service: 'ship', revoked: 0 });
  }

  const before = await mf.getWorker('catalog-before'), after = await mf.getWorker('catalog-after');
  let address = 0;
  const agent = target => {
    const tool = async (name, catalog) => (await (await target.fetch(ADDRESS, {
      method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': `192.0.2.${(address += 1)}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: { catalog } } }),
    })).json()).result.structuredContent;
    return {
      tool,
      // Everything an agent is shown, apart from the answer's own envelope.
      search: async catalog => (await tool('search_catalog', catalog)).products,
      lookup: async ids => (await tool('lookup_catalog', { ids })).products,
      detail: async id => (await tool('get_product', { id })).product,
    };
  };
  const sellers = product => (product?.variants ?? []).map(variant => `${variant.seller.name} ${variant.price.amount}`);
  const category = product => product?.metadata?.category ?? null;

  console.log(`\n== 1. The catalog as it was (built from ${from.slice(0, 7)}, migrations ${beforeMigrations.join(', ')}) fills itself ==`);
  const old = agent(before);
  await before.scheduled({ cron: '*/5 * * * *' });
  // The old Worker's indexing step stores its own category guess here; Vectorize has no local form.
  for (const row of (await catalogDb.prepare('SELECT offer_id, title FROM catalog_offer ORDER BY offer_id').all()).results) {
    const guess = row.title.includes('Hat') ? HATS : TOPS;
    await catalogDb.prepare('INSERT INTO catalog_vector (offer_id, vector_id, content_hash, category_id, category_name) VALUES (?, ?, ?, ?, ?)')
      .bind(row.offer_id, `v-${row.offer_id}`, 'hash', guess.id, guess.name).run();
  }
  const stored = (await catalogDb.prepare('SELECT count(*) AS offers FROM catalog_offer').first()).offers;
  check('the old Worker stored the three store products (two hats, one tee family)', stored, 3);
  const hatsBefore = await old.search({ query: 'wool hat', filters: { available: false } });
  const teeBefore = (await old.search({ query: 'tee' }))[0];
  const hatId = hatsBefore[0].id, redTee = teeBefore.variants.find(variant => variant.title === 'Red / M').id;
  const answersBefore = {
    search: hatsBefore, tee: teeBefore,
    lookup: await old.lookup([hatId, redTee]),
    page: await old.detail(`${ALPHA}/products/hat`),
    variant: await old.detail(redTee),
    category: await old.tool('search_catalog', { filters: { categories: ['aa-2'] } }),
  };
  check('old Worker: one hat, both stores, lowest price first', sellers(hatsBefore[0]), ['Beta Goods 2300', 'Alpha Outfitters 2500']);
  check('old Worker: the catalog\'s guess is shown, marked inferred', category(hatsBefore[0]), { ...HATS, inferred: true });

  console.log(`\n== 2. Apply ${newMigrations.join(', ')} to the filled catalog ==`);
  await migrate(catalogDb, join(root, 'catalog/migrations'), newMigrations);
  const columns = (await catalogDb.prepare('PRAGMA table_info(catalog_offer)').all()).results.map(column => column.name);
  check('catalog_offer gains the store category columns', ['category_id', 'category_name'].every(name => columns.includes(name)), true);
  check('every stored product is still there, with no store pick yet',
    (await catalogDb.prepare('SELECT count(*) AS offers, count(category_id) AS picked FROM catalog_offer').first()), { offers: 3, picked: 0 });

  console.log('\n== 3. The new Worker answers from the same stored rows, before it reads any store ==');
  const now = agent(after);
  check('search_catalog gives exactly the answer the old Worker gave', await now.search({ query: 'wool hat', filters: { available: false } }), answersBefore.search);
  check('the tee family is the same answer too', (await now.search({ query: 'tee' }))[0], answersBefore.tee);
  check('lookup_catalog by the product id and a variant id an agent kept', await now.lookup([hatId, redTee]), answersBefore.lookup);
  check('get_product by product page address', await now.detail(`${ALPHA}/products/hat`), answersBefore.page);
  check('get_product by a kept variant id', await now.detail(redTee), answersBefore.variant);
  // The category filter runs only where the category index is bound (tests/catalog.test.mjs covers it with a
  // stand-in index); on this machine both Workers pass it over and say so, the same way.
  const filtered = await now.tool('search_catalog', { filters: { categories: ['aa-2'] } });
  check('a category filter, with no category index here, gets the same answer and warning as before', filtered, answersBefore.category);
  check('and the warning names the filter it passed over', filtered.messages.map(entry => `${entry.code}:${entry.content}`), ['unsupported_filter:categories']);

  console.log('\n== 4. The new Worker reads the stores: a store pick wins, the rest keep the guess ==');
  feeds[ALPHA].products[1].category = { taxonomy: 'shopify', id: `gid://shopify/TaxonomyCategory/${TEES.id}`, name: TEES.name };
  await after.scheduled({ cron: '*/5 * * * *' });
  check('the store\'s pick is stored on its own row only',
    (await catalogDb.prepare('SELECT store_product_id, category_id FROM catalog_offer ORDER BY site_id, store_product_id').all()).results,
    [{ store_product_id: 'hat', category_id: null }, { store_product_id: 'tee', category_id: TEES.id }, { store_product_id: 'hat', category_id: null }]);
  const teeAfter = (await now.search({ query: 'tee' }))[0];
  check('the tee now shows the store\'s pick, not marked inferred', category(teeAfter), { ...TEES, inferred: false });
  check('and keeps its product id, so an id an agent kept still opens it', teeAfter.id, teeBefore.id);
  check('the kept variant id still opens the same variant', (await now.detail(redTee)).selected.map(pick => pick.label), ['Red', 'M']);
  const hatAfter = (await now.search({ query: 'wool hat', filters: { available: false } }))[0];
  check('the hats, with no store pick, keep the catalog\'s guess marked inferred', category(hatAfter), { ...HATS, inferred: true });
  check('and keep the same product id and sellers', { id: hatAfter.id, sellers: sellers(hatAfter) }, { id: hatId, sellers: ['Beta Goods 2300', 'Alpha Outfitters 2500'] });
  check('the agent-facing category list carries the store\'s pick', teeAfter.categories, [{ value: TEES.id, taxonomy: 'shopify' }]);

  console.log('\n== 5. The category door on the built Worker ==');
  const door = async (query, init) => { const answer = await after.fetch(`https://catalog.dinkuskit.com/api/categories${query}`, init); return { status: answer.status, body: await answer.json() }; };
  check('GET with no words is refused', await door(''), { status: 400, body: { error: 'missing_q' } });
  check('a POST is refused', await door('?q=tee', { method: 'POST' }), { status: 405, body: { error: 'method_not_allowed' } });
  check('with no Workers AI or Vectorize bound (as on this machine) it says so, not an empty list', await door('?q=wool%20hat'), { status: 503, body: { error: 'categories_unavailable' } });
  check('the old Worker never had the door', (await before.fetch('https://catalog.dinkuskit.com/api/categories?q=tee')).status, 404);
} finally {
  await mf?.dispose();
  await rm(work, { recursive: true, force: true });
}
console.log(failures.length ? `\n${failures.length} check(s) failed.` : '\nEvery check passed.');
process.exit(failures.length ? 1 : 0);
