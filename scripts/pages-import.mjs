// One-time load of a new seed page into an existing EmDash site.
//
//   node --experimental-strip-types scripts/pages-import.mjs --url <site origin> [--page <slug>]... [--footer] [--publish]
//
// Setup applies seed/seed.json only to a new database, so a page added to the
// seed later (such as /start) reaches a running site through this script, once,
// after the deploy that carries its code. It adds the seed's block types the
// site lacks (and optional fields the seed added to ones it has), lets the
// pages layout field use them, and adds each named page as a draft. It never
// overwrites: anything that already exists is kept as it is.
// With --publish it also publishes the pages it added in this run, and never
// one that was already there; without it an editor presses Publish in the admin.
// With --footer it adds the seed's footer menus the site lacks. A menu the site
// already has keeps every current link and the order an editor chose among
// them. Seed links whose URL is not already in it are inserted at the seed's
// position. The seed's first link, left behind a later seed link when a
// reorder did not finish, is placed on the next run. Other seed links an
// editor reordered stay in that order, and an editor's own link is not pulled
// into the seed sequence. Nothing is renamed or removed. An empty site title
// or tagline is filled from the seed only when this sign-in can read settings.
// The footer shows the title, tagline and those menus.
// Authenticates with EMDASH_TOKEN (an EmDash API token; menus use content:read
// and content:write) or CF_ACCESS_TOKEN (a Cloudflare Access token from
// `cloudflared access token`). Settings stay on the Access session: the
// production gate does not admit an API token to /_emdash/api/settings.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

const SEED = new URL('../seed/seed.json', import.meta.url);
const COLLECTION = 'pages';
const LAYOUT = 'layout';
const BRAND_MEDIA = [
  { file: 'commerce.webp', alt: 'DinkusKit Commerce' },
  { file: 'payments.webp', alt: 'DinkusKit Payments' },
  { file: 'inventory.webp', alt: 'DinkusKit Inventory' },
  { file: 'ship.webp', alt: 'DinkusKit Ship' },
  { file: 'dinkuskit-f3-cube.webp', alt: 'DinkusKit cube mark' },
  { file: 'dinkuskit-f3-trio.webp', alt: 'DinkusKit trio mark' },
];

const ok = status => status === 200 || status === 201;

async function push(origin, { slugs, footer, publish }) {
  const base = new URL(origin);
  if (base.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(base.hostname)) throw new Error('Use an https site origin');
  const authHeaders = { 'x-emdash-request': '1' };
  if (process.env.EMDASH_TOKEN) authHeaders.authorization = `Bearer ${process.env.EMDASH_TOKEN}`;
  if (process.env.CF_ACCESS_TOKEN) authHeaders['cf-access-token'] = process.env.CF_ACCESS_TOKEN;
  const headers = { 'content-type': 'application/json', ...authHeaders };
  const api = async (method, path, body) => {
    const response = await fetch(new URL(`/_emdash/api${path}`, base), {
      method, headers, redirect: 'manual', body: body && JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    return { status: response.status, data: payload?.data ?? payload };
  };
  const seed = JSON.parse(readFileSync(SEED, 'utf8'));
  if (footer) await pushFooter(api, seed);
  if (!slugs.length) return;
  const pages = slugs.map(slug => {
    const page = seed.content[COLLECTION].find(entry => entry.slug === slug);
    if (!page) throw new Error(`seed/seed.json has no ${COLLECTION} entry "${slug}"`);
    return page;
  });
  // Only the block types the named pages use.
  const used = new Set(pages.flatMap(page => (page.data[LAYOUT] ?? []).map(block => block._type)));

  const listed = await api('GET', '/schema/block-types');
  if (listed.status !== 200) throw new Error(`Reading block types failed: HTTP ${listed.status} (check the sign-in token)`);
  const have = new Map((listed.data?.items ?? []).map(type => [type.slug, type]));
  for (const type of seed.blockTypes.filter(type => used.has(type.slug))) {
    const fields = type.versions.find(version => version.version === type.currentVersion).fields;
    const existing = have.get(type.slug);
    if (existing) {
      // Optional fields added to the seed later (such as a card's plugin logo)
      // join the site's active version; its other fields are kept as they are.
      const active = existing.versions.find(version => version.version === existing.currentVersion);
      const known = new Set(active.fields.map(field => field.slug));
      const added = fields.filter(field => !known.has(field.slug) && !field.required);
      if (!added.length) { console.log(`Kept existing block type ${type.slug}`); continue; }
      const updated = await api('PUT', `/schema/block-types/${type.slug}`, { expectedFingerprint: active.fingerprint, fields: [...active.fields, ...added] });
      if (!ok(updated.status)) throw new Error(`Adding ${added.map(field => field.slug).join(', ')} to block type ${type.slug} failed: HTTP ${updated.status} ${JSON.stringify(updated.data)}`);
      console.log(`Added ${added.map(field => field.slug).join(', ')} to block type ${type.slug}`);
      continue;
    }
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

  // Register the 2D brand and plugin poster .webp assets in /_emdash/api/media
  // (deduplicated by SHA-1 contentHash) so /_emdash/admin Media Library lists them.
  for (const { file, alt } of BRAND_MEDIA) {
    const bytes = readFileSync(new URL(`../public/brand/${file}`, import.meta.url));
    const form = new FormData();
    form.set('file', new File([bytes], file, { type: 'image/webp' }));
    form.set('alt', alt);
    form.set('deduplicate', 'true');
    const response = await fetch(new URL('/_emdash/api/media', base), {
      method: 'POST', headers: authHeaders, redirect: 'manual', body: form,
    });
    const payload = await response.json().catch(() => null);
    const data = payload?.data ?? payload;
    if (!ok(response.status)) throw new Error(`Uploading media ${file} failed: HTTP ${response.status} ${JSON.stringify(data)}`);
    console.log(data?.deduplicated ? `Kept media ${file}` : `Uploaded media ${file}`);
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

// Where a seed link belongs among `items`, which must not already contain it.
// The seed's next existing link is the anchor. A link the seed lists before
// every existing seed link goes first, so editor links that currently lead
// the menu follow it. Otherwise it sits immediately before that anchor, or
// just after the previous seed link when nothing in the seed follows it.
function footerInsertionIndex(items, seedItems, url) {
  const myIndex = seedItems.findIndex(item => item.url === url);
  let anchor = -1;
  for (let i = myIndex + 1; i < seedItems.length; i++) {
    const at = items.findIndex(item => item.customUrl === seedItems[i].url);
    if (at !== -1) { anchor = at; break; }
  }
  const earlierExists = seedItems.slice(0, myIndex).some(item => items.some(existing => existing.customUrl === item.url));
  if (!earlierExists) return 0;
  if (anchor !== -1) return anchor;
  for (let i = myIndex - 1; i >= 0; i--) {
    const at = items.findIndex(item => item.customUrl === seedItems[i].url);
    if (at !== -1) return at + 1;
  }
  return items.length;
}

function menuLink(item, url = item.customUrl) {
  return { id: item.id, parentId: item.parentId ?? null, customUrl: url };
}

// The seed's first link is the one this import adds in front. When a create
// succeeded and the reorder did not, that link is still behind a later seed
// link. Pull it forward. Do not move any other seed link: an editor may have
// ordered those, and this must not put them back into seed order.
function firstSeedLinkLeftBehind(items, seedItems) {
  const first = seedItems[0];
  if (!first) return -1;
  const currentIndex = items.findIndex(item => item.customUrl === first.url);
  if (currentIndex === -1) return -1;
  const behind = seedItems.slice(1).some(item => {
    const at = items.findIndex(existing => existing.customUrl === item.url);
    return at !== -1 && at < currentIndex;
  });
  return behind ? currentIndex : -1;
}

// Existing links keep their relative order, including seed links an editor
// has moved earlier. Links in `createdByUrl` are inserted at the seed's
// position. The seed's first link, left behind by an interrupted reorder, is
// placed on the next run. Editor links stay where that insertion leaves them.
export function reconcileFooterOrder(existing, seedItems, createdByUrl) {
  const created = new Map(createdByUrl);
  const items = existing.filter(item => !created.has(item.customUrl)).map(item => menuLink(item));
  const leftBehind = firstSeedLinkLeftBehind(items, seedItems);
  if (leftBehind !== -1) {
    const [item] = items.splice(leftBehind, 1);
    items.splice(footerInsertionIndex(items, seedItems, item.customUrl), 0, item);
  }
  for (const seedItem of seedItems) {
    if (!created.has(seedItem.url)) continue;
    const createdItem = created.get(seedItem.url);
    if (!createdItem?.id) throw new Error(`Adding ${seedItem.label} did not return an item id`);
    items.splice(footerInsertionIndex(items, seedItems, seedItem.url), 0, menuLink(createdItem, seedItem.url));
  }
  return items;
}

async function insertMissingFooterLinks(api, menu) {
  const current = await api('GET', `/menus/${menu.name}`);
  if (current.status !== 200) throw new Error(`Reading menu ${menu.name} failed: HTTP ${current.status} ${JSON.stringify(current.data)}`);
  const existing = [...(current.data?.items ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const have = new Set(existing.map(item => item.customUrl));
  const missing = menu.items.filter(item => !have.has(item.url));
  const createdByUrl = new Map();
  for (const item of missing) {
    const added = await api('POST', `/menus/${menu.name}/items`, { type: 'custom', label: item.label, customUrl: item.url });
    if (!ok(added.status)) throw new Error(`Adding ${item.label} to menu ${menu.name} failed: HTTP ${added.status} ${JSON.stringify(added.data)}`);
    createdByUrl.set(item.url, { id: added.data?.id, parentId: added.data?.parentId ?? null, customUrl: item.url });
  }
  const ordered = reconcileFooterOrder(existing, menu.items, createdByUrl);
  const same = ordered.length === existing.length && ordered.every((item, index) => item.id === existing[index]?.id);
  if (same) { console.log(`Kept existing menu ${menu.name}`); return; }
  const reordered = await api('POST', `/menus/${menu.name}/reorder`, {
    items: ordered.map((item, sortOrder) => ({ id: item.id, parentId: item.parentId ?? null, sortOrder })),
  });
  if (!ok(reordered.status)) throw new Error(`Reordering menu ${menu.name} failed: HTTP ${reordered.status} ${JSON.stringify(reordered.data)}`);
  if (missing.length) console.log(`Added ${missing.map(item => item.label).join(', ')} to menu ${menu.name}`);
  // A neighbor that only shifts when another link is inserted is not placed.
  // Placed means an existing seed link moved earlier past another seed link,
  // which is how a created-but-unordered Demo store is recovered.
  const placed = menu.items.filter(item => {
    if (createdByUrl.has(item.url)) return false;
    const before = existing.findIndex(entry => entry.customUrl === item.url);
    const after = ordered.findIndex(entry => entry.customUrl === item.url);
    if (before === -1 || after === -1 || after >= before) return false;
    return menu.items.some(other => {
      if (other.url === item.url) return false;
      const otherBefore = existing.findIndex(entry => entry.customUrl === other.url);
      const otherAfter = ordered.findIndex(entry => entry.customUrl === other.url);
      return otherBefore !== -1 && otherBefore < before && otherAfter > after;
    });
  });
  if (placed.length) console.log(`Placed ${placed.map(item => item.label).join(', ')} in menu ${menu.name}`);
}

// A missing footer menu is added whole. One the site already has keeps its
// links; seed links whose URL is absent are inserted at the seed's position.
// Site title and tagline are filled only when settings are readable.
async function pushFooter(api, seed) {
  const listed = await api('GET', '/menus');
  if (listed.status !== 200) throw new Error(`Reading menus failed: HTTP ${listed.status} (check the sign-in token)`);
  const have = new Set((Array.isArray(listed.data) ? listed.data : listed.data?.items ?? []).map(menu => menu.name));
  for (const menu of seed.menus.filter(item => item.name.startsWith('footer-'))) {
    if (have.has(menu.name)) { await insertMissingFooterLinks(api, menu); continue; }
    const created = await api('POST', '/menus', { name: menu.name, label: menu.label });
    if (!ok(created.status)) throw new Error(`Adding menu ${menu.name} failed: HTTP ${created.status} ${JSON.stringify(created.data)}`);
    for (const [sortOrder, item] of menu.items.entries()) {
      const added = await api('POST', `/menus/${menu.name}/items`, { type: 'custom', label: item.label, customUrl: item.url, sortOrder });
      if (!ok(added.status)) throw new Error(`Adding ${item.label} to menu ${menu.name} failed: HTTP ${added.status} ${JSON.stringify(added.data)}`);
    }
    console.log(`Added menu ${menu.name} with ${menu.items.length} links`);
  }
  await fillEmptySiteText(api, seed);
}

// Settings are outside the API-token lane. A 404 here means the sign-in can
// update menus and cannot read settings; the menu change still stands.
export async function fillEmptySiteText(api, seed) {
  const settings = await api('GET', '/settings');
  if (settings.status === 404) {
    console.log('Left site title and tagline unchanged; settings need an Access session');
    return;
  }
  if (settings.status !== 200) throw new Error(`Reading site settings failed: HTTP ${settings.status}`);
  for (const key of ['title', 'tagline']) {
    const current = settings.data?.[key]?.trim();
    if (current) { console.log(`Kept site ${key} "${current}"`); continue; }
    const updated = await api('POST', '/settings', { [key]: seed.settings[key] });
    if (!ok(updated.status)) throw new Error(`Setting the site ${key} failed: HTTP ${updated.status} ${JSON.stringify(updated.data)}`);
    console.log(`Set site ${key} "${seed.settings[key]}"`);
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const { values } = parseArgs({ options: { url: { type: 'string' }, page: { type: 'string', multiple: true }, footer: { type: 'boolean' }, publish: { type: 'boolean' } } });
  if (values.url && (values.page?.length || values.footer)) await push(values.url, { slugs: values.page ?? [], footer: values.footer === true, publish: values.publish === true });
  else {
    console.error('Usage: pages-import.mjs --url <site origin> [--page <slug>]... [--footer] [--publish]');
    process.exit(2);
  }
}
