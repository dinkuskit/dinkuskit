// One-time move of the documentation articles into EmDash.
//
//   node --experimental-strip-types scripts/docs-import.mjs seed --from <git-rev>
//     Converts the Markdown articles at <git-rev> (src/content/docs) to
//     Portable Text and writes them to seed/seed.json as unpublished drafts.
//     Already run for 1f6562b; kept so the conversion can be repeated and checked.
//
//   node --experimental-strip-types scripts/docs-import.mjs push --url <site origin>
//     Loads the seed's docs collection and drafts into an existing EmDash site
//     through its API (setup only applies the seed to a new database). Creates
//     what is missing and never overwrites: a field or entry that already exists
//     is left as it is. Authenticates with EMDASH_TOKEN (an EmDash API token)
//     or CF_ACCESS_TOKEN (a Cloudflare Access token from `cloudflared access token`).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { markdownToPortableText } from '../src/docs/portable-text.ts';

const SEED = new URL('../seed/seed.json', import.meta.url);
const COLLECTION = 'docs';

// Where each article sat in the Markdown tree, its sidebar group, and its sidebar name.
const ARTICLES = [
  ['start-here', 'Start here', 'Choose your path'],
  ['store-owners/setup', 'Store owners', 'Set up a store'],
  ['store-owners/first-product', 'Store owners', 'Add your first product'],
  ['store-owners/test-order', 'Store owners', 'Verify a test order'],
  ['developers/integrate', 'Developers', 'Build a site'],
  ['developers/add-on', 'Developers', 'Extend DinkusKit'],
  ['developers/contribute', 'Developers', 'Contribute'],
  ['reference/commerce', 'Product reference', 'Commerce'],
  ['reference/payments', 'Product reference', 'Payments'],
  ['reference/inventory', 'Product reference', 'Inventory'],
  ['reference/ship', 'Product reference', 'Ship'],
  ['troubleshooting', 'Troubleshooting and upgrades', 'Troubleshooting and upgrades'],
  ['ai-assistants', 'Using AI assistants', 'Read docs with your assistant'],
];

function frontmatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error('Article has no frontmatter');
  const data = Object.fromEntries(match[1].split('\n').map(line => {
    const [, key, raw] = line.match(/^(\w+):\s*(.*)$/) ?? [];
    return [key, raw?.replace(/^"(.*)"$/, '$1')];
  }));
  return { data, body: source.slice(match[0].length).trim() };
}

function seedFrom(rev) {
  const seed = JSON.parse(readFileSync(SEED, 'utf8'));
  seed.content[COLLECTION] = ARTICLES.map(([path, section, navLabel], index) => {
    const { data, body } = frontmatter(execFileSync('git', ['show', `${rev}:src/content/docs/${path}.md`], { encoding: 'utf8' }));
    const slug = path.split('/').at(-1);
    return {
      id: `doc-${slug}`,
      slug,
      status: 'draft',
      data: {
        title: data.title,
        nav_label: navLabel,
        summary: data.summary,
        audience: data.audience,
        product: data.product,
        version_scope: data.version,
        section,
        order: (index + 1) * 10,
        body: markdownToPortableText(body),
      },
    };
  });
  writeFileSync(SEED, `${JSON.stringify(seed, null, 2)}\n`);
  console.log(`Wrote ${ARTICLES.length} draft articles from ${rev} to seed/seed.json`);
}

async function push(origin) {
  const base = new URL(origin);
  if (base.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(base.hostname)) throw new Error('Use an https site origin');
  const headers = { 'content-type': 'application/json', 'x-emdash-request': '1' };
  if (process.env.EMDASH_TOKEN) headers.authorization = `Bearer ${process.env.EMDASH_TOKEN}`;
  if (process.env.CF_ACCESS_TOKEN) headers['cf-access-token'] = process.env.CF_ACCESS_TOKEN;
  const api = async (method, path, body) => {
    const response = await fetch(new URL(`/_emdash/api${path}`, base), {
      method, headers, redirect: 'manual', body: body && JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    return { status: response.status, data: payload?.data ?? payload };
  };
  const seed = JSON.parse(readFileSync(SEED, 'utf8'));
  const collection = seed.collections.find(item => item.slug === COLLECTION);
  const existing = await api('GET', `/schema/collections/${COLLECTION}?includeFields=true`);
  if (existing.status === 404) {
    const { fields, ...definition } = collection;
    const created = await api('POST', '/schema/collections', definition);
    if (created.status !== 201 && created.status !== 200) throw new Error(`Creating the docs collection failed: HTTP ${created.status} ${JSON.stringify(created.data)}`);
    console.log('Created the docs collection');
  } else if (existing.status !== 200) {
    throw new Error(`Reading the docs collection failed: HTTP ${existing.status} (check the sign-in token)`);
  }
  const fields = (await api('GET', `/schema/collections/${COLLECTION}/fields`)).data;
  const have = new Set((fields?.items ?? fields ?? []).map(field => field.slug));
  for (const field of collection.fields) {
    if (have.has(field.slug)) continue;
    const created = await api('POST', `/schema/collections/${COLLECTION}/fields`, { validation: null, ...field });
    if (created.status !== 201 && created.status !== 200) throw new Error(`Adding field ${field.slug} failed: HTTP ${created.status} ${JSON.stringify(created.data)}`);
    console.log(`Added field ${field.slug}`);
  }
  for (const entry of seed.content[COLLECTION]) {
    const found = await api('GET', `/content/${COLLECTION}/${entry.slug}`);
    if (found.status === 200) { console.log(`Kept existing ${entry.slug}`); continue; }
    const created = await api('POST', `/content/${COLLECTION}`, { slug: entry.slug, status: 'draft', data: entry.data });
    if (created.status !== 201 && created.status !== 200) throw new Error(`Adding ${entry.slug} failed: HTTP ${created.status} ${JSON.stringify(created.data)}`);
    console.log(`Added draft ${entry.slug}`);
  }
}

const { positionals, values } = parseArgs({ allowPositionals: true, options: { from: { type: 'string' }, url: { type: 'string' } } });
if (positionals[0] === 'seed' && values.from) seedFrom(values.from);
else if (positionals[0] === 'push' && values.url) await push(values.url);
else {
  console.error('Usage: docs-import.mjs seed --from <git-rev> | push --url <site origin>');
  process.exit(2);
}
