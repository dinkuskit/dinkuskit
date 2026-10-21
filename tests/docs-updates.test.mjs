import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { articleId, articleMarkdown, selectArticles } from '../src/docs/catalog.ts';
import { docsSite } from '../src/docs/site.ts';
import { entryHash, entryState, exportHash, parseUpdate, sameState, wantedState, renderUpdate, updateData, updateFromExport, updateHash, versionScopeProblem } from '../src/docs/updates.ts';

const seed = JSON.parse(readFileSync(new URL('../seed/seed.json', import.meta.url), 'utf8'));
const seedArticles = selectArticles(docsSite, seed.content.docs.map(entry => ({ id: entry.slug, data: { ...entry.data, status: 'published', updatedAt: '2026-10-20T00:00:00Z' } })));
const exportOf = (article, updated = new Date('2026-10-20T00:00:00Z')) => articleMarkdown(docsSite, { ...article, updated });

const sample = (fields = {}) => ({
  article: 'store-owners/test-order',
  base: `sha256:${'a'.repeat(64)}`,
  title: 'Complete and verify a test order',
  summary: 'Place one TEST order and check it.',
  audience: 'Store owners',
  product: 'Commerce, Payments',
  version_scope: 'Commerce 0.3.0, Payments 0.2.9',
  body: '## Steps\n\n1. Press **Add to cart**.\n2. Press **Checkout**.',
  ...fields,
});

test('an update file round-trips and keeps quotes, colons and numbers', () => {
  const update = sample({ summary: 'Say "yes": then press **Publish**.', section: 'Store owners', order: 40, nav_label: 'Verify a test order' });
  const source = renderUpdate(update);
  assert.match(source, /^---\narticle: store-owners\/test-order\nbase: sha256:a{64}\ntitle: "Complete and verify a test order"\n/);
  assert.deepEqual(parseUpdate(source, 'store-owners/test-order.md'), update);
});

test('a version scope names a release or says Unreleased', () => {
  for (const ok of ['Commerce 0.3.0, Payments 0.2.9', 'Requires Commerce 0.4.0', 'Ship 0.2.0-beta.1', 'Unreleased (on main, after Commerce 0.3.0)', 'unreleased']) assert.equal(versionScopeProblem(ok), null, ok);
  for (const bad of ['Commerce e8eca124 and Payments b92ec308 source', 'latest', 'Commerce 0.3', '']) assert.match(versionScopeProblem(bad), /must name a release/, bad);
  assert.throws(() => parseUpdate(renderUpdate(sample({ version_scope: 'main@e8eca124' }))), /must name a release/);
});

test('bad update files are refused with the reason', () => {
  const cases = [
    ['no frontmatter', 'Just text', /no frontmatter/],
    ['wrong name', renderUpdate(sample()), /must be named store-owners\/test-order\.md/, 'store-owners/other.md'],
    ['bad base', renderUpdate(sample({ base: 'abc' })), /base must be "new"/],
    ['missing field', renderUpdate(sample({ audience: '' })), /audience is required/],
    ['unknown field', renderUpdate(sample()).replace('title:', 'draft: true\ntitle:'), /unknown field draft/],
    ['new without placement', renderUpdate(sample({ base: 'new' })), /section is required for a new article/],
    ['bad order', renderUpdate(sample({ section: 'Store owners' })).replace('section:', 'order: ten\nsection:'), /order must be a whole number/],
    ['bad article', renderUpdate(sample({ article: '../secret' })), /article must be an article ID/],
    ['empty body', renderUpdate(sample()).replace(/\n\n## Steps[\s\S]*$/, '\n'), /body is empty/],
  ];
  for (const [name, source, error, path] of cases) assert.throws(() => parseUpdate(source, path), error, name);
});

test('the export hash ignores the Last updated date and nothing else', () => {
  const [article] = seedArticles;
  const hash = exportHash(exportOf(article));
  assert.equal(exportHash(exportOf(article, new Date('2027-01-01T00:00:00Z'))), hash);
  assert.notEqual(exportHash(exportOf({ ...article, summary: `${article.summary} ` })), hash);
  assert.notEqual(exportHash(exportOf({ ...article, versionScope: 'Commerce 0.3.1' })), hash);
});

test('pulling every seed article gives an update whose own hash is the live hash', () => {
  assert.equal(seedArticles.length, 13);
  for (const article of seedArticles) {
    const markdown = exportOf(article);
    const update = updateFromExport(article.id, markdown);
    assert.equal(update.base, exportHash(markdown), article.id);
    assert.equal(updateHash(docsSite, update), update.base, `${article.id}: an unchanged pull is already live`);
    const stored = seed.content.docs.find(entry => entry.slug === article.id.split('/').at(-1)).data;
    assert.equal(entryHash(docsSite, article.id.split('/').at(-1), stored), update.base, `${article.id}: the API's stored data hashes like the public export`);
    assert.notEqual(updateHash(docsSite, { ...update, body: `${update.body}\n\nOne more line.` }), update.base);
  }
});

test('an update writes only the fields it sets, with the body as Portable Text', () => {
  const data = updateData(sample());
  assert.deepEqual(Object.keys(data), ['title', 'summary', 'audience', 'product', 'version_scope', 'body']);
  assert.equal(data.body[0].style, 'h2');
  const placed = updateData(sample({ base: 'new', section: 'Store owners', order: 45, nav_label: 'Refunds' }));
  assert.deepEqual([placed.section, placed.order, placed.nav_label], ['Store owners', 45, 'Refunds']);
});

test('every committed update file is valid and named for its article', () => {
  const dir = new URL('../docs/updates/', import.meta.url).pathname;
  const files = [];
  const walk = folder => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.md') && !(folder === dir && entry.name === 'README.md')) files.push(path);
    }
  };
  try { walk(dir); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const path of files) {
    const update = parseUpdate(readFileSync(path, 'utf8'), relative(dir, path));
    if (update.section) assert.equal(articleId(docsSite, update.article.split('/').at(-1), update.section), update.article, `${update.article}: section and folder agree`);
  }
});

test('an entry state covers every field an update writes, placement included', () => {
  const live = seed.content.docs.find(entry => entry.slug === 'commerce').data;
  const update = updateFromExport('reference/commerce', exportOf(seedArticles.find(article => article.id === 'reference/commerce')));
  assert.ok(sameState(entryState(live), wantedState(update, live)), 'an unchanged pull is the live state');
  assert.ok(!sameState(entryState(live), wantedState({ ...update, nav_label: 'Commerce plugin' }, live)), 'a sidebar name change is a change');
  assert.ok(!sameState(entryState(live), wantedState({ ...update, order: 999 }, live)), 'an order change is a change');
  assert.ok(!sameState(entryState({ ...live, nav_label: 'Touched' }), wantedState(update, live)), 'an editor change to the sidebar name is noticed');
  assert.equal(wantedState(update, live).section, live.section, 'placement the update leaves out stays as it is');
  assert.deepEqual(wantedState(sample({ base: 'new', section: 'Store owners', order: 45 })).nav_label, '');
});
