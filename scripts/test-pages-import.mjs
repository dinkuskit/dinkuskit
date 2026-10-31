import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { WORK, resetDatabase, start, unusedPort } from './lib/docs-preview.mjs';

// Drives the one-time page load on the docs preview fixture (its own EmDash
// SQLite database). The fixture starts from the seed as it was before /start,
// the cards' plugin logo and the footer menus, as dinkuskit.com's database is;
// the script adds the block types, the logo field, a draft, the footer menus
// and an empty site title and tagline. Get started already exists, as on
// dinkuskit.com, with an editor link and without Demo store. The editor has
// put Docs ahead of Start your store, Plugins as Payments then Commerce then
// Ship, and Account last in DinkusKit. The script inserts Demo store first and
// leaves those orders alone. A follow-up run also pulls Demo store back when a
// reorder stopped after the link was created at the end, and does not reorder
// the other columns. A later rerun keeps the menus, and Publish shows the page
// with no rebuild.
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

  // dinkuskit.com already has the footer menus. Get started has no Demo store.
  // Plugins and DinkusKit are complete, in an order the editor chose.
  async function addMenu(name, label, items) {
    const created = await api('/menus', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, label }),
    });
    assert.ok(created.status === 200 || created.status === 201, `create menu ${name} HTTP ${created.status}`);
    for (const [sortOrder, item] of items.entries()) {
      const added = await api(`/menus/${name}/items`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'custom', label: item.label, customUrl: item.customUrl, sortOrder }),
      });
      assert.equal(added.status, 201, `add ${item.label} to ${name}`);
    }
  }
  const pluginOrder = [
    ['Payments', '/docs/reference/payments'],
    ['Commerce', '/docs/reference/commerce'],
    ['Ship', '/docs/reference/ship'],
  ];
  const dinkusOrder = [
    ['Terms of Service', '/terms'],
    ['GitHub', 'https://github.com/dinkuskit'],
    ['Website source', 'https://github.com/dinkuskit/dinkuskit'],
    ['Account', '/account'],
  ];
  const DISCORD = 'https://discord.gg/7yHZGj8p88';
  const dinkusImported = [...dinkusOrder.slice(0, 2), ['Discord', DISCORD], ...dinkusOrder.slice(2)];
  await addMenu('footer-get-started', 'Get started', [
    { label: 'Docs', customUrl: '/docs' },
    { label: 'Start your store', customUrl: '/start' },
    { label: 'How it works', customUrl: '/getting-started' },
    { label: 'Office hours', customUrl: '/hours' },
  ]);
  await addMenu('footer-plugins', 'Plugins', pluginOrder.map(([label, customUrl]) => ({ label, customUrl })));
  await addMenu('footer-dinkuskit', 'DinkusKit', dinkusOrder.map(([label, customUrl]) => ({ label, customUrl })));
  const menuOrder = async name => (await (await api(`/menus/${name}`)).json()).data?.items?.map(item => [item.label, item.customUrl]);

  const imported = await runImport(development.base, token, '--footer', '--publish');
  assert.equal(imported.code, 0, imported.output);
  for (const slug of START_TYPES) assert.match(imported.output, new RegExp(`^Added block type ${slug}$`, 'm'));
  assert.match(imported.output, /^Added plugin_logo to block type text_section$/m);
  assert.match(imported.output, /^Allowed plugin_row, start_account, start_checklist, start_step in the pages layout$/m);
  for (const file of ['commerce.webp', 'payments.webp', 'inventory.webp', 'ship.webp', 'dinkuskit-f3-cube.webp', 'dinkuskit-f3-trio.webp']) {
    assert.match(imported.output, new RegExp(`^Uploaded media ${file.replace(/\./g, '\\.')}$`, 'm'));
  }
  assert.match(imported.output, /^Added draft page start$/m);
  assert.match(imported.output, /^Published page start$/m);
  assert.match(imported.output, /^Added Demo store to menu footer-get-started$/m);
  // The live GitHub link predates its logo: the import marks it, nothing else.
  assert.match(imported.output, /^Marked GitHub in menu footer-dinkuskit as social-github$/m);
  assert.equal(imported.output.match(/^Marked /gm)?.length, 1, imported.output);
  // Discord is new: it goes in after GitHub, already marked.
  assert.match(imported.output, /^Added Discord to menu footer-dinkuskit$/m);
  const marked = (await (await api('/menus/footer-dinkuskit')).json()).data?.items ?? [];
  assert.deepEqual(marked.filter(item => item.cssClasses).map(item => [item.label, item.cssClasses]), [['GitHub', 'social-github'], ['Discord', 'social-discord']]);
  assert.doesNotMatch(imported.output, /Added menu footer-get-started/);
  const getStarted = await (await api('/menus/footer-get-started')).json();
  const editedOrder = [
    ['Demo store', 'https://playground.dinkuskit.com/'],
    ['Docs', '/docs'],
    ['Start your store', '/start'],
    ['How it works', '/getting-started'],
    ['Office hours', '/hours'],
  ];
  assert.deepEqual((getStarted.data?.items ?? []).map(item => [item.label, item.customUrl]), editedOrder);
  // The link was created, then the reorder never landed: Demo store is last.
  const appended = [...(getStarted.data?.items ?? [])];
  const demo = appended.shift();
  appended.push(demo);
  const interrupted = await api('/menus/footer-get-started/reorder', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ items: appended.map((item, sortOrder) => ({ id: item.id, parentId: item.parentId ?? null, sortOrder })) }),
  });
  assert.ok(interrupted.status === 200 || interrupted.status === 201, `interrupt reorder HTTP ${interrupted.status}`);
  const recovered = await runImport(development.base, token, '--footer');
  assert.equal(recovered.code, 0, recovered.output);
  assert.match(recovered.output, /^Placed Demo store in menu footer-get-started$/m);
  assert.match(recovered.output, /^Kept existing menu footer-plugins$/m);
  assert.match(recovered.output, /^Kept existing menu footer-dinkuskit$/m);
  assert.doesNotMatch(recovered.output, /Added Demo store|Placed .+ footer-plugins|Placed .+ footer-dinkuskit|Marked/);
  const restored = await (await api('/menus/footer-get-started')).json();
  assert.deepEqual((restored.data?.items ?? []).map(item => [item.label, item.customUrl]), editedOrder);
  assert.deepEqual(await menuOrder('footer-plugins'), pluginOrder);
  assert.deepEqual(await menuOrder('footer-dinkuskit'), dinkusImported);
  assert.match(imported.output, /^Kept existing menu footer-plugins$/m);
  assert.doesNotMatch(imported.output, /Placed|Added menu footer-/);
  assert.deepEqual(await menuOrder('footer-plugins'), pluginOrder);
  assert.deepEqual(await menuOrder('footer-dinkuskit'), dinkusImported);
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
  // So does the editor's choice to open Discord in a new tab.
  const discordItem = (await (await api('/menus/footer-dinkuskit')).json()).data.items.find(item => item.customUrl === DISCORD);
  assert.equal((await api(`/menus/footer-dinkuskit/items/${discordItem.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ target: '_blank' }) })).status, 200);
  assert.equal((await api('/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tagline: 'Edited tagline' }) })).status, 200);
  const again = await runImport(development.base, token, '--footer', '--publish');
  assert.equal(again.code, 0, again.output);
  assert.equal(again.output.match(/^Kept existing /gm)?.length, 9, again.output);
  assert.equal(again.output.match(/^Kept media /gm)?.length, 6, again.output);
  assert.match(again.output, /^Kept site tagline "Edited tagline"$/m);
  assert.doesNotMatch(again.output, /Added|Allowed|Marked|Published|Set site|Uploaded/);

  const mediaResponse = await api('/media');
  assert.equal(mediaResponse.status, 200);
  const mediaList = await mediaResponse.json();
  const mediaItems = mediaList.data?.items ?? [];
  assert.deepEqual(
    mediaItems.map(item => item.filename).sort(),
    ['commerce.webp', 'dinkuskit-f3-cube.webp', 'dinkuskit-f3-trio.webp', 'inventory.webp', 'payments.webp', 'ship.webp'],
    '/_emdash/admin Media Library lists all 6 brand and plugin 2D .webp assets',
  );
  for (const item of mediaItems) {
    assert.equal(item.mimeType, 'image/webp');
    assert.equal(item.status, 'ready');
    assert.ok(item.width > 0 && item.height > 0, `${item.filename} has dimensions`);
    assert.ok(item.alt?.startsWith('DinkusKit '), `${item.filename} has descriptive alt text`);
    assert.match(item.contentHash ?? '', /^sha1:/, `${item.filename} has SHA-1 contentHash`);
    assert.match(item.url ?? '', /^\/_emdash\/api\/media\/file\//, `${item.filename} has Media Library file URL`);
  }
  const commerceMedia = mediaItems.find(item => item.filename === 'commerce.webp');
  const commerceFileResponse = await development.request(commerceMedia.url);
  assert.equal(commerceFileResponse.status, 200);
  assert.equal(commerceFileResponse.headers.get('content-type'), 'image/webp');
  console.log('PASS import script: added four block types and the card logo field, allowed them, registered six brand .webp media items in /_emdash/api/media, added and published /start, inserted Demo store into the existing Get started menu, kept the edited Plugins and DinkusKit menus, and set the site title and tagline; a rerun keeps everything');


  const response = await development.request('/start');
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Edited in the admin/);
  assert.equal(html.match(/class="text-section-logo"/g)?.length, 1, 'the text section shows the picked logo');
  assert.match(html, /<img class="text-section-logo" src="\/brand\/commerce\.webp" alt="DinkusKit Commerce"/);
  assert.equal(html.match(/class="start-step"/g)?.length, 4, 'four steps');
  assert.match(html, /<section class="plugin-row">.*<h2>Three plugins make the shop<\/h2>/s);
  assert.deepEqual([...html.matchAll(/<li><img src="\/brand\/(\w+)\.webp" alt=""/g)].map(match => match[1]), ['commerce', 'payments', 'ship'], 'the plugin row shows the picked plugins in order');
  assert.deepEqual([...html.matchAll(/data-plugin-cube="(\w+)"/g)].map(match => match[1]), ['Commerce', 'Payments', 'Ship'], 'the plugin row mounts rotatable 3D .glb cube slots for the picked plugins');
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
  assert.deepEqual([...footer.matchAll(/<img src="\/brand\/(\w+)\.webp" alt="" width="20" height="20"/g)].map(match => match[1]), ['payments', 'commerce', 'ship'], 'plugin links keep the editor order');
  const plugins = footer.match(/<h2>Plugins<\/h2>\s*<ul>([\s\S]*?)<\/ul>/)?.[1] ?? '';
  const dinkuskit = footer.match(/<h2>DinkusKit<\/h2>\s*<ul>([\s\S]*?)<\/ul>/)?.[1] ?? '';
  const columnLinks = list => [...list.matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(match => [match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(), match[1]]);
  assert.deepEqual(columnLinks(plugins), pluginOrder, 'the edited Plugins menu stays');
  const withoutLogos = dinkusOrder.filter(([label]) => label !== 'GitHub');
  assert.deepEqual(columnLinks(dinkuskit), [...withoutLogos, ['Status', '/health']], 'the edited DinkusKit menu stays, with the editor link at the end and the logo links out of the column');
  // Discord and GitHub as logos (issue #106): the same links, names and tab
  // choice beside the tagline and in the header, in the menu's order.
  const logoLinks = part => [...(part.match(/<ul class="social-links">([\s\S]*?)<\/ul>/)?.[1] ?? '').matchAll(/<a class="social-link" href="([^"]+)"([^>]*)>\s*<svg[^>]*aria-hidden="true"[\s\S]*?<\/svg>\s*<span class="visually-hidden">([^<]+)<\/span>/g)]
    .map(match => [match[1], match[3].trim(), /target="_blank"/.test(match[2]) && /rel="noopener noreferrer"/.test(match[2])]);
  const logos = [
    ['https://github.com/dinkuskit', 'DinkusKit on GitHub', false],
    [DISCORD, 'Join DinkusKit on Discord (opens in a new tab)', true],
  ];
  const head = footer.match(/<div class="site-footer-head">([\s\S]*?)<div class="fx-strip"/)?.[1] ?? '';
  assert.deepEqual(logoLinks(head), logos, 'footer logos');
  const header = html.match(/<header>[\s\S]*?<\/header>/)?.[0] ?? '';
  assert.deepEqual(logoLinks(header), logos, 'header logos');
  assert.doesNotMatch(header, />GitHub</, 'no GitHub text link in the header');
  assert.equal(html.split(`href="${DISCORD}"`).length - 1, 2, 'Discord shows once in each place');
  assert.match(footer, /href="\/docs\/reference\/commerce"/);
  assert.match(footer, /href="\/health"[^>]*>\s*Status/, 'the editor\'s link shows');
  const started = footer.match(/<h2>Get started<\/h2>\s*<ul>([\s\S]*?)<\/ul>/)?.[1] ?? '';
  assert.deepEqual([...started.matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(match => [match[2].replace(/\s+/g, ' ').trim(), match[1]]), [
    ['Demo store', 'https://playground.dinkuskit.com/'],
    ['Docs', '/docs'],
    ['Start your store', '/start'],
    ['How it works', '/getting-started'],
    ['Office hours', '/hours'],
  ], 'Demo store is first under Get started and the editor order stays');
  assert.equal(started.match(/playground\.dinkuskit\.com/g)?.length, 1, 'Demo store is not duplicated');
  assert.doesNotMatch(footer, /dinkuskit-f3/, 'no DinkusKit logo in the footer');
  const signedIn = await (await development.request('/start?as=owner%40example.com')).text();
  assert.match(signedIn, /Signed in as <strong>owner@example\.com<\/strong>/);
  assert.match(signedIn, /href="\/account\/sites">Your stores</);
  assert.doesNotMatch(signedIn, /href="\/account\/signup"/);
  console.log('PASS development: /start is drawn from the CMS with no rebuild, and keeps the editor\'s wording and logo pick; the footer shows the menus and settings');

  // Verify pullLiveSeed mirrors live CMS edits (page, menus, settings) into a seed file,
  // and --sync-pages updates an existing published page using _rev while refusing if an admin draft is waiting.
  process.env.EMDASH_TOKEN = token;
  const { pullLiveSeed } = await import('./pages-import.mjs');
  const tempSeed = new URL('./temp-seed.json', WORK);
  writeFileSync(tempSeed, readFileSync(new URL('../seed/seed.json', import.meta.url), 'utf8'));
  const driftCheck = await pullLiveSeed(development.base, { seedUrl: tempSeed, check: true });
  assert.equal(driftCheck.inSync, false, 'pullLiveSeed --check detects drift after admin edits');
  process.exitCode = 0;
  const pulled = await pullLiveSeed(development.base, { seedUrl: tempSeed });
  assert.equal(pulled.inSync, true);
  assert.ok(pulled.changed.includes('page:start'), 'pulled page:start');
  assert.ok(pulled.changed.includes('setting:tagline'), 'pulled setting:tagline');
  const pulledJson = JSON.parse(readFileSync(tempSeed, 'utf8'));
  assert.equal(pulledJson.content.pages.find(p => p.slug === 'start').data.title, 'Edited in the admin');
  assert.equal(pulledJson.settings.tagline, 'Edited tagline');
  const cleanCheck = await pullLiveSeed(development.base, { seedUrl: tempSeed, check: true });
  assert.equal(cleanCheck.inSync, true, 'pullLiveSeed --check passes after pull');

  // Stage an unpublished draft in the admin: --sync-pages must refuse to overwrite it.
  const beforeDraft = await (await api('/content/pages/start')).json();
  assert.equal(
    (await api(`/content/pages/${beforeDraft.data.item.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: { ...beforeDraft.data.item.data, title: 'Unpublished admin draft' }, _rev: beforeDraft.data._rev }),
    })).status,
    200,
  );
  const refusedSync = await runImport(development.base, token, '--sync-pages', '--publish');
  assert.notEqual(refusedSync.code, 0, '--sync-pages refuses when an unpublished admin draft is waiting');
  assert.match(refusedSync.output, /unpublished edits waiting in the admin/);

  // Publish the admin draft, then run --sync-pages --publish to sync seed/seed.json's /start back and publish.
  const afterDraft = await (await api('/content/pages/start')).json();
  assert.equal((await api(`/content/pages/${afterDraft.data.item.id}/publish`, { method: 'POST' })).status, 200);
  const synced = await runImport(development.base, token, '--sync-pages', '--publish');
  assert.equal(synced.code, 0, synced.output);
  assert.match(synced.output, /^Updated page start$/m);
  assert.match(synced.output, /^Published page start$/m);
  const syncedHtml = await (await development.request('/start')).text();
  assert.match(syncedHtml, /Now run your own\./, '--sync-pages --publish updated /start to seed/seed.json copy');

  // Verify a pulled seed restores edited pages, footer menu headings, and settings into a fresh EmDash database.
  pulledJson.menus.find(m => m.name === 'footer-plugins').label = 'Shop plugins';
  writeFileSync(OLD_SEED, `${JSON.stringify(pulledJson, null, 2)}\n`);
  await development.stop();
  await resetDatabase();
  const restoredServer = start('development', await unusedPort());
  try {
    await restoredServer.ready();
    const restoredBypass = await (await restoredServer.request('/_emdash/api/setup/dev-bypass?token=1', { method: 'POST' })).json();
    assert.ok(restoredBypass.data?.token, 'fresh database restored from pulled seed');
    const restoredHtml = await (await restoredServer.request('/start')).text();
    assert.match(restoredHtml, /Edited in the admin/, 'restored database renders pulled page title');
    assert.match(restoredHtml, /<p class="site-footer-tagline">Edited tagline<\/p>/, 'restored database renders pulled tagline');
    assert.match(restoredHtml, /<h2>Shop plugins<\/h2>/, 'restored database renders pulled footer menu heading');
  } finally {
    await restoredServer.stop();
  }
  rmSync(tempSeed, { force: true });
  console.log('PASS seed sync: pullLiveSeed mirrors live admin edits to seed.json, restores into a fresh EmDash DB, and --sync-pages updates published pages with _rev while refusing to clobber waiting admin drafts');
} finally {
  await development.stop();
  rmSync(OLD_SEED, { force: true });
}
