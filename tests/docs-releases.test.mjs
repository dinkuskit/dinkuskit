import assert from 'node:assert/strict';
import test from 'node:test';
import { docsSite } from '../src/docs/site.ts';
import { behindReleases, exportVersionScope, fillRelease, releaseBase, releaseDateText, releaseUpdate, scopeVersion, tagVersion } from '../src/docs/releases.ts';
import { NEW_ARTICLE, parseUpdate, renderUpdate, updateHash } from '../src/docs/updates.ts';

// Plugin reference articles published at a stable release (GrillTrack decision
// website-docs-from-plugin-releases-086).
const date = new Date('2026-10-25T16:02:59Z');

const pluginArticle = (fields = {}) => {
  const values = {
    article: 'reference/commerce',
    title: 'Commerce',
    summary: 'Understand catalog identity, prices and orders.',
    audience: 'Store owners and developers',
    product: 'DinkusKit Commerce',
    version_scope: 'Commerce {{version}}',
    ...fields,
  };
  const body = values.body ?? 'This reference describes Commerce `{{version}}`, released on {{release_date}} (tag `v{{version}}`).\n\n- [Changelog](https://github.com/dinkuskit/commerce/blob/v{{version}}/CHANGELOG.md)';
  delete values.body;
  return `---\n${Object.entries(values).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n\n${body}\n`;
};

const published = (version_scope = 'Commerce 0.5.0') => parseUpdate(renderUpdate({
  article: 'reference/commerce',
  base: `sha256:${'b'.repeat(64)}`,
  title: 'Commerce',
  summary: 'Understand catalog identity, prices and orders.',
  audience: 'Store owners and developers',
  product: 'DinkusKit Commerce',
  version_scope,
  body: 'The text the site has now.',
}), 'reference/commerce.md');

// By default the published file is live, as after a publish that went through.
const release = (fields = {}) => {
  const previous = Object.hasOwn(fields, 'previous') ? fields.previous : published();
  const liveHash = previous ? updateHash(docsSite, previous) : null;
  return releaseUpdate({ site: docsSite, plugin: 'commerce', article: 'reference/commerce', source: pluginArticle(), tag: 'v0.6.0', date, liveHash, ...fields, previous });
};

test('only stable vX.Y.Z tags are releases', () => {
  assert.deepEqual(tagVersion('v0.6.0'), [0, 6, 0]);
  for (const tag of ['v0.6.0-beta.1', '0.6.0', 'v0.6', 'latest']) assert.equal(tagVersion(tag), null, tag);
});

test('a version scope is read for its own product', () => {
  assert.deepEqual(scopeVersion('Commerce 0.6.0', 'Commerce'), [0, 6, 0]);
  assert.deepEqual(scopeVersion('EmDash 1.2.0; Commerce 0.10.2; Payments 0.4.0', 'Commerce'), [0, 10, 2]);
  assert.deepEqual(scopeVersion('EmDash 1.2.0; Commerce 0.10.2; Payments 0.4.0', 'Payments'), [0, 4, 0]);
  for (const scope of ['Commerce 0.6.0-beta.1', 'Payments 0.4.0', 'Unreleased', 'Commerce 0.6']) assert.equal(scopeVersion(scope, 'Commerce'), null, scope);
});

test('placeholders are filled and unknown ones refused', () => {
  assert.equal(releaseDateText(date), '25 October 2026');
  assert.equal(fillRelease('v{{version}} on {{release_date}}', [0, 6, 0], date), 'v0.6.0 on 25 October 2026');
  assert.throws(() => fillRelease('{{commit}}', [0, 6, 0], date), /unknown placeholder \{\{commit\}\}/);
});

test('a release builds the update on top of what the site last published', () => {
  const previous = published();
  const update = release({ previous });
  assert.equal(update.base, updateHash(docsSite, previous), 'base is the live article, which is the published file');
  assert.equal(update.version_scope, 'Commerce 0.6.0');
  assert.match(update.body, /describes Commerce `0\.6\.0`, released on 25 October 2026 \(tag `v0\.6\.0`\)/);
  assert.match(update.body, /blob\/v0\.6\.0\/CHANGELOG\.md/);
  assert.deepEqual(parseUpdate(renderUpdate(update), 'reference/commerce.md'), update);
  assert.equal(release({ previous: undefined, source: pluginArticle({ section: 'Reference', order: '40' }) }).base, NEW_ARTICLE, 'with no published file the article is new');
});

test('the base follows what is live', () => {
  const previous = published();
  const shown = updateHash(docsSite, previous);
  assert.equal(releaseBase(docsSite, 'reference/commerce', previous, shown), shown, 'the previous update is live: build on it');
  assert.equal(releaseBase(docsSite, 'reference/commerce', previous, previous.base), previous.base, 'the previous update never published: replace it on its own base, so the publisher can still apply it');
  const edited = `sha256:${'c'.repeat(64)}`;
  assert.equal(releaseBase(docsSite, 'reference/commerce', previous, edited), shown, 'edited in the admin: build on the previous update, so Docs publish stops instead of overwriting the edit');
  assert.equal(releaseBase(docsSite, 'reference/commerce', previous, null), shown, 'unpublished in the admin: Docs publish stops too');
  assert.equal(releaseBase(docsSite, 'reference/commerce', undefined, null), NEW_ARTICLE);
  assert.throws(() => releaseBase(docsSite, 'reference/commerce', undefined, edited), /is live but has no docs\/updates\/reference\/commerce\.md; run npm run docs:pull/);
});

test('two releases while the first is still unpublished', () => {
  const live = published();
  const first = release({ previous: live });
  // Its publish failed, so the site still shows the article from before it.
  const second = release({ previous: first, liveHash: updateHash(docsSite, live), tag: 'v0.7.0' });
  assert.equal(second.base, first.base, 'the second release keeps the base the site still matches');
  assert.equal(second.version_scope, 'Commerce 0.7.0');
});

test('the same release again changes nothing', () => {
  const first = release({ previous: published() });
  assert.equal(release({ previous: first }), first, 'published');
  assert.equal(release({ previous: first, liveHash: first.base }), first, 'still waiting to publish');
});

test('a release is refused when its article is wrong for it', () => {
  assert.throws(() => release({ tag: 'v0.6.0-beta.1' }), /not a stable vX\.Y\.Z tag/);
  assert.throws(() => release({ article: 'reference/ship' }), /commerce does not publish reference\/ship/);
  assert.throws(() => release({ plugin: 'ship' }), /ship does not publish reference\/commerce/);
  assert.throws(() => release({ source: pluginArticle({ version_scope: 'Commerce 0.5.0' }) }), /must name Commerce 0\.6\.0; write "Commerce \{\{version\}\}"/);
  assert.throws(() => release({ source: pluginArticle({ base: 'new' }) }), /leave base out/);
  assert.throws(() => release({ source: pluginArticle({ article: 'reference/ship' }) }), /file must be named reference\/ship\.md/);
  assert.throws(() => release({ previous: published('Commerce 0.7.0') }), /already describes Commerce 0\.7\.0, which is newer than v0\.6\.0/);
});

test('live articles behind their plugin release are listed', () => {
  const live = { 'reference/commerce': 'Commerce 0.5.0', 'reference/payments': 'Payments 0.4.0', 'reference/ship': null };
  assert.deepEqual(behindReleases(live, { commerce: 'v0.6.0', payments: 'v0.4.0', ship: 'v0.3.0' }), [
    { plugin: 'commerce', article: 'reference/commerce', stated: '0.5.0', latest: '0.6.0', tag: 'v0.6.0' },
    { plugin: 'ship', article: 'reference/ship', stated: null, latest: '0.3.0', tag: 'v0.3.0' },
  ], 'an unpublished article is behind');
  assert.deepEqual(behindReleases(live, { commerce: 'v0.5.0', payments: 'v0.3.9' }), [], 'an article ahead of or at the release is not behind; a plugin without a release is skipped');
  assert.deepEqual(behindReleases({ 'reference/payments': 'Payments 0.4.0' }, { commerce: 'v0.6.0', payments: 'v0.4.0' }), [], 'an article that could not be read is neither behind nor caught up');
});

test('the version scope is read from a live Markdown export', () => {
  const markdown = '# Commerce\n\nSummary.\n\nAudience: Store owners\nProduct: DinkusKit Commerce\nVersion scope: Commerce 0.6.0\nLast updated: 2026-10-25\nCanonical URL: https://dinkuskit.com/docs/reference/commerce\n\nBody.\n';
  assert.equal(exportVersionScope(markdown), 'Commerce 0.6.0');
  assert.equal(exportVersionScope('# No scope\n'), null);
});
