import assert from 'node:assert/strict';
import test from 'node:test';
import { docsSite } from '../src/docs/site.ts';
import { behindReleases, fillRelease, releaseDateText, releaseUpdate, scopeVersion, tagVersion } from '../src/docs/releases.ts';
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

const release = (fields = {}) => releaseUpdate({ site: docsSite, plugin: 'commerce', article: 'reference/commerce', source: pluginArticle(), tag: 'v0.6.0', date, previous: published(), ...fields });

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
  assert.equal(update.base, updateHash(docsSite, previous), 'base is the hash of the published file, so an admin edit since then stops the publish');
  assert.equal(update.version_scope, 'Commerce 0.6.0');
  assert.match(update.body, /describes Commerce `0\.6\.0`, released on 25 October 2026 \(tag `v0\.6\.0`\)/);
  assert.match(update.body, /blob\/v0\.6\.0\/CHANGELOG\.md/);
  assert.deepEqual(parseUpdate(renderUpdate(update), 'reference/commerce.md'), update);
  assert.equal(release({ previous: undefined, source: pluginArticle({ section: 'Reference', order: '40' }) }).base, NEW_ARTICLE, 'with no published file the article is new');
});

test('the same release again changes nothing', () => {
  const first = release({ previous: published() });
  assert.equal(release({ previous: first }), first);
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

test('articles behind their plugin release are listed', () => {
  const updates = [published('Commerce 0.5.0'), { ...published('Payments 0.4.0'), article: 'reference/payments' }];
  assert.deepEqual(behindReleases(updates, { commerce: 'v0.6.0', payments: 'v0.4.0', ship: 'v0.3.0' }), [
    { plugin: 'commerce', article: 'reference/commerce', stated: '0.5.0', latest: '0.6.0', tag: 'v0.6.0' },
    { plugin: 'ship', article: 'reference/ship', stated: null, latest: '0.3.0', tag: 'v0.3.0' },
  ]);
  assert.deepEqual(behindReleases(updates, { commerce: 'v0.5.0', payments: 'v0.3.9' }), [], 'an article ahead of or at the release is not behind; a plugin without a release is skipped');
});
