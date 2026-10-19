import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { articleMarkdown, publicPageIds, selectDocs, searchRecord } from '../src/docs/catalog.ts';
import { searchDocs } from '../src/docs/search.ts';

const entry = (id, draft, body = '') => ({ id, body, data: {
  title: 'Catalog integration', summary: 'Read public products.', audience: 'Developers',
  product: 'Commerce', version: 'Synthetic fixture', draft,
} });

test('publication requires both explicit selection and non-draft status', () => {
  const entries = [entry('start-here', false), entry('reference/commerce', true), entry('internal-plan', false)];
  assert.deepEqual(selectDocs(entries).map(item => item.id), ['start-here']);
  assert.deepEqual(selectDocs(entries, true).map(item => item.id), ['start-here', 'reference/commerce']);
  assert.deepEqual(selectDocs([entry('../docs/CHARTER', false)]), []);
});

test('Markdown and search retain source body and version context', () => {
  const body = '## Price\n\n```json\n{"minor":"1200"}\n```\n\n| Name | Price |\n| --- | --- |\n| Sample | 12 |\n\n[Guide](/docs/start-here#choose-your-path)';
  const article = entry('reference/commerce', false, body);
  assert.ok(articleMarkdown(article).includes(body));
  assert.equal(searchRecord(article).text, body);
  assert.equal(searchRecord(article).version, 'Synthetic fixture');
  assert.ok(articleMarkdown(article).includes('https://dinkuskit.com/docs/reference/commerce'));
});

test('keyword search uses full text, prefers titles, and bounds results', () => {
  const articles = [
    { id: 'a', title: 'Other', summary: '', url: '/docs/a', text: 'Catalog integration and checkout.' },
    { id: 'b', title: 'Catalog integration', summary: '', url: '/docs/b', text: 'Products.' },
  ];
  assert.deepEqual(searchDocs(articles, 'catalog integration').map(item => item.id), ['b', 'a']);
  assert.deepEqual(searchDocs(articles, 'checkout').map(item => item.id), ['a']);
  assert.deepEqual(searchDocs(articles, '<script>'), []);
  assert.deepEqual(searchDocs(articles, 'catalog nonexistent'), []);
  assert.deepEqual(searchDocs(articles, '!!!'), []);
  assert.equal(searchDocs(Array.from({ length: 20 }, (_, i) => ({ ...articles[0], id: String(i) })), 'catalog').length, 10);
});

test('selected articles have resolvable docs links and portable public link paths', () => {
  const pages = new Map(publicPageIds.map(id => [id, readFileSync(new URL(`../src/content/docs/${id}.md`, import.meta.url), 'utf8')]));
  assert.equal(pages.size, 13);
  for (const [id, source] of pages) {
    assert.match(source, /^---\n/, `${id}: metadata`);
    assert.match(source, /\ndraft: (true|false)\n/, `${id}: explicit publication status`);
    assert.match(source, /\n## /, `${id}: substantive headings`);
    for (const [, href] of source.matchAll(/\]\(([^\s)]+)\)/g)) {
      assert.ok(/^(https:\/\/|\/docs\/|#)/.test(href), `${id}: source-relative or unsafe link ${href}`);
      if (href.startsWith('/docs/')) {
        const target = href.slice('/docs/'.length).split('#')[0];
        assert.ok(pages.has(target), `${id}: unknown article ${target}`);
        if (/\ndraft: false\n/.test(source)) assert.match(pages.get(target), /\ndraft: false\n/, `${id}: published article links to draft ${target}`);
      }
    }
  }
});
