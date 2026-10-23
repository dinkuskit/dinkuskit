// One-time load of a new seed page into an existing EmDash site.
//
//   node --experimental-strip-types scripts/pages-import.mjs --url <site origin> --page <slug> [--page <slug>] [--publish]
//
// Setup applies seed/seed.json only to a new database, so a page added to the
// seed later (such as /start) reaches a running site through this script, once,
// after the deploy that carries its code. It adds the seed's block types the
// site lacks, lets the pages layout field use them, and adds each named page as
// a draft. It never overwrites: anything that already exists is kept as it is.
// With --publish it also publishes the pages it added in this run, and never
// one that was already there; without it an editor presses Publish in the admin.
// Authenticates with EMDASH_TOKEN (an EmDash API token) or CF_ACCESS_TOKEN
// (a Cloudflare Access token from `cloudflared access token`).
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const SEED = new URL('../seed/seed.json', import.meta.url);
const COLLECTION = 'pages';
const LAYOUT = 'layout';

const ok = status => status === 200 || status === 201;

async function push(origin, slugs, publish) {
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
  const pages = slugs.map(slug => {
    const page = seed.content[COLLECTION].find(entry => entry.slug === slug);
    if (!page) throw new Error(`seed/seed.json has no ${COLLECTION} entry "${slug}"`);
    return page;
  });
  // Only the block types the named pages use.
  const used = new Set(pages.flatMap(page => (page.data[LAYOUT] ?? []).map(block => block._type)));

  const listed = await api('GET', '/schema/block-types');
  if (listed.status !== 200) throw new Error(`Reading block types failed: HTTP ${listed.status} (check the sign-in token)`);
  const have = new Set((listed.data?.items ?? []).map(type => type.slug));
  for (const type of seed.blockTypes.filter(type => used.has(type.slug))) {
    if (have.has(type.slug)) { console.log(`Kept existing block type ${type.slug}`); continue; }
    const fields = type.versions.find(version => version.version === type.currentVersion).fields;
    const { slug, label, description, icon, category } = type;
    const created = await api('POST', '/schema/block-types', { slug, label, description, icon, category, fields });
    if (!ok(created.status)) throw new Error(`Adding block type ${slug} failed: HTTP ${created.status} ${JSON.stringify(created.data)}`);
    console.log(`Added block type ${slug}`);
  }

  // Page fields added to the seed later (such as the intro button) are added
  // empty; an editor fills them in on pages that already exist.
  const fieldList = await api('GET', `/schema/collections/${COLLECTION}/fields`);
  if (fieldList.status !== 200) throw new Error(`Reading the ${COLLECTION} fields failed: HTTP ${fieldList.status}`);
  const haveFields = new Set((fieldList.data?.items ?? fieldList.data?.fields ?? []).map(item => item.slug));
  for (const seedField of seed.collections.find(item => item.slug === COLLECTION).fields) {
    if (haveFields.has(seedField.slug)) continue;
    const added = await api('POST', `/schema/collections/${COLLECTION}/fields`, seedField);
    if (!ok(added.status)) throw new Error(`Adding the ${COLLECTION} field ${seedField.slug} failed: HTTP ${added.status} ${JSON.stringify(added.data)}`);
    console.log(`Added ${COLLECTION} field ${seedField.slug}`);
  }

  const field = await api('GET', `/schema/collections/${COLLECTION}/fields/${LAYOUT}`);
  if (field.status !== 200) throw new Error(`Reading the ${COLLECTION} ${LAYOUT} field failed: HTTP ${field.status}`);
  const validation = field.data?.item?.validation ?? {};
  const allowed = validation.allowedTypes ?? [];
  const missing = [...used].filter(slug => !allowed.includes(slug));
  if (missing.length) {
    const updated = await api('PUT', `/schema/collections/${COLLECTION}/fields/${LAYOUT}`, { validation: { ...validation, allowedTypes: [...allowed, ...missing] } });
    if (!ok(updated.status)) throw new Error(`Allowing ${missing.join(', ')} in ${COLLECTION} failed: HTTP ${updated.status} ${JSON.stringify(updated.data)}`);
    console.log(`Allowed ${missing.join(', ')} in the ${COLLECTION} ${LAYOUT}`);
  }

  for (const page of pages) {
    const found = await api('GET', `/content/${COLLECTION}/${page.slug}`);
    if (found.status === 200) { console.log(`Kept existing page ${page.slug}`); continue; }
    const created = await api('POST', `/content/${COLLECTION}`, { slug: page.slug, status: 'draft', data: page.data });
    if (!ok(created.status)) throw new Error(`Adding page ${page.slug} failed: HTTP ${created.status} ${JSON.stringify(created.data)}`);
    console.log(`Added draft page ${page.slug}`);
    if (!publish) continue;
    const id = created.data?.item?.id;
    const published = id ? await api('POST', `/content/${COLLECTION}/${id}/publish`) : { status: 0, data: created.data };
    if (!ok(published.status)) throw new Error(`Publishing page ${page.slug} failed: HTTP ${published.status} ${JSON.stringify(published.data)}`);
    console.log(`Published page ${page.slug}`);
  }
}

const { values } = parseArgs({ options: { url: { type: 'string' }, page: { type: 'string', multiple: true }, publish: { type: 'boolean' } } });
if (values.url && values.page?.length) await push(values.url, values.page, values.publish === true);
else {
  console.error('Usage: pages-import.mjs --url <site origin> --page <slug> [--page <slug>] [--publish]');
  process.exit(2);
}
