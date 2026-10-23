import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { WORK, resetDatabase, start, unusedPort } from './lib/docs-preview.mjs';

// Drives the one-time page load on the docs preview fixture (its own EmDash
// SQLite database). The fixture starts from the seed as it was before /start,
// the cards' plugin logo and the footer menus, as dinkuskit.com's database is;
// the script adds the block types, the logo field, a draft, the footer menus
// and an empty site title and tagline, a rerun keeps them, and Publish shows
// the page with no rebuild.
const OLD_SEED = new URL('../.emdash/seed.json', import.meta.url);
const START_TYPES = ['plugin_row', 'start_account', 'start_checklist', 'start_step'];

function runImport(base, token, ...extra) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', 'scripts/pages-import.mjs', '--url', base, '--page', 'start', ...extra], {
      env: { ...process.env, EMDASH_TOKEN: token }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', reject);
    child.on('exit', code => resolve({ code, output }));
  });
}

// EmDash reads .emdash/seed.json before seed/seed.json; the copy lacks /start.
assert.ok(!existsSync(OLD_SEED), '.emdash/seed.json already exists; refusing to replace it');
const seed = JSON.parse(readFileSync(new URL('../seed/seed.json', import.meta.url), 'utf8'));
seed.blockTypes = seed.blockTypes.filter(type => !START_TYPES.includes(type.slug));
const layout = seed.collections.find(item => item.slug === 'pages').fields.find(field => field.slug === 'layout');
layout.validation.allowedTypes = layout.validation.allowedTypes.filter(slug => !START_TYPES.includes(slug));
seed.content.pages = seed.content.pages.filter(page => page.slug !== 'start');
const textSection = seed.blockTypes.find(type => type.slug === 'text_section').versions[0];
textSection.fields = textSection.fields.filter(field => field.slug !== 'plugin_logo');
for (const page of seed.content.pages) for (const block of page.data.layout ?? []) delete block.plugin_logo;
delete seed.menus;
delete seed.settings;
mkdirSync(new URL('./', OLD_SEED), { recursive: true });
writeFileSync(OLD_SEED, JSON.stringify(seed));

await resetDatabase();
mkdirSync(WORK, { recursive: true });
const development = start('development', await unusedPort());
try {
  await development.ready();
  const bypass = await (await development.request('/_emdash/api/setup/dev-bypass?token=1', { method: 'POST' })).json();
  const token = bypass.data?.token;
  assert.ok(token, `dev setup returned an API token: ${JSON.stringify(bypass).slice(0, 300)}`);
  const api = (path, options = {}) => development.request(`/_emdash/api${path}`, {
    ...options, headers: { authorization: `Bearer ${token}`, 'x-emdash-request': '1', ...options.headers },
  });
  assert.equal((await development.request('/start')).status, 503, 'an older database has no start page');

  const imported = await runImport(development.base, token, '--footer', '--publish');
  assert.equal(imported.code, 0, imported.output);
  for (const slug of START_TYPES) assert.match(imported.output, new RegExp(`^Added block type ${slug}$`, 'm'));
  assert.match(imported.output, /^Added plugin_logo to block type text_section$/m);
  assert.match(imported.output, /^Allowed plugin_row, start_account, start_checklist, start_step in the pages layout$/m);
  assert.match(imported.output, /^Added draft page start$/m);
  assert.match(imported.output, /^Published page start$/m);
  assert.match(imported.output, /^Added menu footer-get-started with 3 links$/m);
  assert.match(imported.output, /^Added menu footer-plugins with 3 links$/m);
  assert.match(imported.output, /^Added menu footer-dinkuskit with 4 links$/m);
  assert.match(imported.output, /^Set site title "DinkusKit"$/m);
  assert.match(imported.output, /^Set site tagline "Built with EmDash\. Growing in the open\."$/m);

  // An editor's later wording survives a rerun, even one asking to publish.
  const found = await (await api('/content/pages/start')).json();
  const entry = found.data?.item;
  assert.ok(entry?.id, 'entry found by slug');
  // The new logo field reaches pages too: the editor also picks one for the text section.
  const edited = { ...entry.data, title: 'Edited in the admin', layout: entry.data.layout.map(block => block._type === 'text_section' ? { ...block, plugin_logo: 'Commerce' } : block) };
  assert.equal((await api(`/content/pages/${entry.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: edited, _rev: found.data?._rev }) })).status, 200);
  assert.equal((await api(`/content/pages/${entry.id}/publish`, { method: 'POST' })).status, 200);
  // An editor's footer link and tagline survive a rerun too.
  assert.equal((await api('/menus/footer-dinkuskit/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'custom', label: 'Status', customUrl: '/health' }) })).status, 201);
  assert.equal((await api('/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tagline: 'Edited tagline' }) })).status, 200);
  const again = await runImport(development.base, token, '--footer', '--publish');
  assert.equal(again.code, 0, again.output);
  assert.equal(again.output.match(/^Kept existing /gm)?.length, 9, again.output);
  assert.match(again.output, /^Kept site tagline "Edited tagline"$/m);
  assert.doesNotMatch(again.output, /Added|Allowed|Published|Set site/);
  console.log('PASS import script: added four block types and the card logo field, allowed them, added and published /start, added the footer menus and site title and tagline; a rerun keeps everything');


  const response = await development.request('/start');
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Edited in the admin/);
  assert.equal(html.match(/class="text-section-logo"/g)?.length, 1, 'the text section shows the picked logo');
  assert.match(html, /<img class="text-section-logo" src="\/brand\/commerce\.webp" alt="DinkusKit Commerce"/);
  assert.equal(html.match(/class="start-step"/g)?.length, 4, 'four steps');
  assert.match(html, /<section class="plugin-row">.*<h2>Three plugins make the shop<\/h2>/s);
  assert.deepEqual([...html.matchAll(/<li><img src="\/brand\/(\w+)\.webp" alt=""/g)].map(match => match[1]), ['commerce', 'payments', 'ship'], 'the plugin row shows the picked plugins in order');
  assert.match(html, /data-start-bar aria-hidden="true" hidden/);
  assert.equal(html.match(/data-start-hint[^>]*hidden/g)?.length, 4, 'four hidden step hints for disabled checkboxes');
  assert.doesNotMatch(html, /data-start-check[^>]*disabled/, 'checkboxes work with no JavaScript');
  assert.match(html, /data-start-progress="\{done\} of \{total\} done"/);
  assert.match(html, /<summary>Don(&#39;|')t have one yet\?<\/summary>/);
  assert.match(html, /href="\/account\/signup">Create account</);
  assert.match(html, /href="https:\/\/playground\.dinkuskit\.com\/">Back to the playground</);
  assert.doesNotMatch(html, /Your stores</);
  // The footer (pick 3B): title and tagline from Settings, the dither strip, a column per footer menu.
  const footer = html.match(/<footer class="site-footer">.*<\/footer>/s)?.[0] ?? '';
  assert.match(footer, /<p class="site-footer-name">DinkusKit<\/p>/);
  assert.match(footer, /<p class="site-footer-tagline">Edited tagline<\/p>/);
  assert.match(footer, /<div class="fx-strip" aria-hidden="true"><\/div>/);
  assert.deepEqual([...footer.matchAll(/<h2>([^<]+)<\/h2>/g)].map(match => match[1]), ['Get started', 'Plugins', 'DinkusKit']);
  assert.deepEqual([...footer.matchAll(/<img src="\/brand\/(\w+)\.webp" alt="" width="20" height="20"/g)].map(match => match[1]), ['commerce', 'payments', 'ship'], 'plugin links show their logos');
  assert.match(footer, /href="\/docs\/reference\/commerce"/);
  assert.match(footer, /href="\/health"[^>]*>\s*Status/, 'the editor\'s link shows');
  assert.doesNotMatch(footer, /dinkuskit-f3/, 'no DinkusKit logo in the footer');
  const signedIn = await (await development.request('/start?as=owner%40example.com')).text();
  assert.match(signedIn, /Signed in as <strong>owner@example\.com<\/strong>/);
  assert.match(signedIn, /href="\/account\/sites">Your stores</);
  assert.doesNotMatch(signedIn, /href="\/account\/signup"/);
  console.log('PASS development: /start is drawn from the CMS with no rebuild, and keeps the editor\'s wording and logo pick; the footer shows the menus and settings');
} finally {
  await development.stop();
  rmSync(OLD_SEED, { force: true });
}
