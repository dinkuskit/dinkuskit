import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { marked } from 'marked';
import { articleId, articleMarkdown, docsSections, llmsText, searchRecord, selectArticles } from '../src/docs/catalog.ts';
import { markdownToPortableText, portableTextToMarkdown, headingAnchors } from '../src/docs/portable-text.ts';
import { searchDocs } from '../src/docs/search.ts';

const site = { origin: 'https://docs.example', name: 'Example', description: 'Example docs.', sectionPaths: { Reference: 'reference' } };
const seed = JSON.parse(readFileSync(new URL('../seed/seed.json', import.meta.url), 'utf8'));

const entry = (slug, status, data = {}) => ({ id: slug, data: {
  status, title: 'Catalog integration', summary: 'Read public products.', audience: 'Developers', product: 'Commerce',
  version_scope: 'Synthetic fixture', section: 'Reference', order: 10, updatedAt: new Date('2026-10-19T00:00:00Z'),
  body: markdownToPortableText('## Price\n\nSee [the guide](/docs/start).'), ...data,
} });

test('only published entries are public; drafts appear only when previewing', () => {
  const entries = [entry('commerce', 'published', { order: 20 }), entry('payments', 'draft'), entry('start', 'published', { section: 'Start here', order: 5 })];
  assert.deepEqual(selectArticles(site, entries).map(item => item.id), ['start', 'reference/commerce']);
  assert.deepEqual(selectArticles(site, entries, true).map(item => item.id), ['start', 'reference/payments', 'reference/commerce']);
  assert.deepEqual(selectArticles(site, [entry('archived', 'archived'), entry('scheduled', 'scheduled')]), []);
  assert.deepEqual(selectArticles(site, [entry('no-body', 'published', { body: undefined }), entry('no-section', 'published', { section: '' })]), []);
  const [article] = selectArticles(site, [entry('commerce', 'published', { nav_label: 'Commerce' })]);
  assert.equal(article.navLabel, 'Commerce');
  assert.equal(article.draft, false);
  assert.equal(article.updated.toISOString(), '2026-10-19T00:00:00.000Z');
  assert.equal(selectArticles(site, [entry('commerce', 'published')])[0].navLabel, 'Catalog integration');
});

test('sections keep the order of their first article and folders come from the site', () => {
  assert.equal(articleId(site, 'commerce', 'Reference'), 'reference/commerce');
  assert.equal(articleId(site, 'start', 'Start here'), 'start');
  const articles = selectArticles(site, [entry('b', 'published', { order: 30 }), entry('a', 'published', { section: 'Start here', order: 10 }), entry('c', 'published', { order: 20 })]);
  assert.deepEqual(docsSections(articles).map(section => [section.title, section.pages.map(page => page.id)]), [['Start here', ['a']], ['Reference', ['reference/c', 'reference/b']]]);
});

test('Markdown, search and llms.txt come from the same published list', () => {
  const body = '## Price\n\n```json\n{"minor":"1200"}\n```\n\n| Name | Price |\n| --- | --- |\n| Sample | 12 |\n\n- **Bold** and `code` with [a link](/docs/start)';
  const [article] = selectArticles(site, [entry('commerce', 'published', { body: markdownToPortableText(body) })]);
  const markdown = articleMarkdown(site, article);
  assert.ok(markdown.includes(body));
  assert.ok(markdown.includes('Canonical URL: https://docs.example/docs/reference/commerce'));
  assert.ok(markdown.includes('Version scope: Synthetic fixture'));
  assert.ok(markdown.includes('Last updated: 2026-10-19'));
  assert.equal(searchRecord(site, article).text, body);
  assert.equal(searchRecord(site, article).url, '/docs/reference/commerce');
  assert.ok(llmsText(site, [article]).includes('- [Catalog integration](https://docs.example/docs/markdown/reference/commerce.md): Read public products.'));
  assert.equal(llmsText(site, []), null);
});

test('Portable Text keeps marks, links, tables, code and heading anchors', () => {
  const blocks = markdownToPortableText('## Use **bold** text\n\n1. One `x`\n2. Two\n\n| A | B |\n| --- | --- |\n| [l](https://example.com) | `c` |\n\n## Use bold text');
  assert.deepEqual(blocks[0].children.map(span => [span.text, span.marks]), [['Use ', []], ['bold', ['strong']], [' text', []]]);
  assert.equal(blocks[1].listItem, 'number');
  assert.equal(blocks[3]._type, 'table');
  assert.equal(blocks[3].rows[1].cells[0].markDefs[0].href, 'https://example.com');
  assert.deepEqual([...headingAnchors(blocks).values()].map(heading => heading.slug), ['use-bold-text', 'use-bold-text-1']);
  assert.equal(portableTextToMarkdown(blocks), '## Use **bold** text\n\n1. One `x`\n2. Two\n\n| A | B |\n| --- | --- |\n| [l](https://example.com) | `c` |\n\n## Use bold text');
});

test('literal text typed in the CMS stays literal in the Markdown export', () => {
  const span = text => ({ _type: 'span', _key: text, text, marks: [] });
  const block = (text, extra = {}) => ({ _type: 'block', _key: text, style: 'normal', markDefs: [], children: [span(text)], ...extra });
  const blocks = [
    block('Fields marked *required* use snake_case, `ticks` and [brackets] with a \\ backslash.'),
    block('Use <widget> &copy; here.'),
    block('# not a heading'),
    block('- not a list'),
    block('1. not a numbered list'),
    block('> not a quote'),
    { _type: 'block', _key: 'code', style: 'normal', markDefs: [], children: [{ _type: 'span', _key: 'c', text: '*kept*', marks: ['code'] }] },
  ];
  const markdown = portableTextToMarkdown(blocks);
  assert.equal(markdown, [
    'Fields marked \\*required\\* use snake\\_case, \\`ticks\\` and \\[brackets\\] with a \\\\ backslash.',
    'Use \\<widget\\> \\&copy; here.',
    '\\# not a heading', '\\- not a list', '1\\. not a numbered list', '\\> not a quote', '`*kept*`',
  ].join('\n\n'));
  const reparsed = markdownToPortableText(markdown);
  assert.deepEqual(reparsed.map(item => [item.style, item.listItem, item.children.map(child => [child.text, child.marks])]), blocks.map(item => [
    'normal', undefined, item.children.map(child => [child.text, child.marks]),
  ]));
});

test('code and nested lists render as written in an independent Markdown renderer', () => {
  const span = (text, marks = []) => ({ _type: 'span', _key: text, text, marks });
  const block = (children, extra = {}) => ({ _type: 'block', _key: children[0].text, style: 'normal', markDefs: [], children, ...extra });
  const blocks = [
    block([span('Run '), span('a `b` c', ['code']), span(' and '), span('`tick', ['code']), span(' or '), span('``', ['code']), span(' then '), span(' padded ', ['code'])]),
    { _type: 'code', _key: 'fence', language: 'md', code: 'Before\n```js\nx\n```\nAfter' },
    block([span('Parent')], { listItem: 'number', level: 1 }),
    block([span('Child')], { listItem: 'bullet', level: 2 }),
    block([span('Grandchild')], { listItem: 'number', level: 3 }),
    block([span('Second')], { listItem: 'number', level: 1 }),
  ];
  const markdown = portableTextToMarkdown(blocks);
  const html = marked.parse(markdown).replace(/\n/g, '');
  assert.ok(html.includes('<p>Run <code>a `b` c</code> and <code>`tick</code> or <code>``</code> then <code> padded </code></p>'), html);
  assert.ok(html.includes('<pre><code class="language-md">Before```jsx```After</code></pre>'), html);
  assert.ok(html.includes('<ol><li>Parent<ul><li>Child<ol><li>Grandchild</li></ol></li></ul></li><li>Second</li></ol>'), html);
  const reparsed = markdownToPortableText(markdown);
  assert.deepEqual(reparsed.map(item => item._type === 'code' ? [item.code, item.language] : [item.listItem, item.level, item.children.map(child => [child.text, child.marks])]),
    blocks.map(item => item._type === 'code' ? [item.code, item.language] : [item.listItem, item.level, item.children.map(child => [child.text, child.marks])]));
  assert.equal(portableTextToMarkdown(reparsed), markdown);
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

test('the seed defines the docs collection and holds the thirteen articles as drafts', async () => {
  const { docsSite } = await import('../src/docs/site.ts');
  const collection = seed.collections.find(item => item.slug === 'docs');
  assert.deepEqual(collection.supports, ['drafts', 'revisions']);
  assert.deepEqual(collection.fields.map(field => [field.slug, field.type]), [
    ['title', 'string'], ['nav_label', 'string'], ['summary', 'text'], ['audience', 'string'], ['product', 'string'],
    ['version_scope', 'string'], ['section', 'select'], ['order', 'integer'], ['body', 'portableText'],
  ]);
  const sections = collection.fields.find(field => field.slug === 'section').validation.options;
  assert.equal(sections.length, 6);
  for (const folder of Object.keys(docsSite.sectionPaths)) assert.ok(sections.includes(folder), `${folder}: a seed section`);

  const entries = seed.content.docs;
  assert.equal(entries.length, 13);
  const articles = selectArticles(docsSite, entries.map(item => ({ id: item.slug, data: { ...item.data, status: item.status } })), true);
  assert.equal(articles.length, 13);
  assert.ok(entries.every(item => item.status === 'draft'), 'every imported article starts unpublished');
  assert.deepEqual(articles.map(article => article.id), [
    'start-here', 'store-owners/setup', 'store-owners/first-product', 'store-owners/test-order',
    'developers/integrate', 'developers/add-on', 'developers/contribute',
    'reference/commerce', 'reference/payments', 'reference/inventory', 'reference/ship', 'troubleshooting', 'ai-assistants',
  ]);
  const ids = new Set(articles.map(article => article.id));
  for (const article of articles) {
    const markdown = portableTextToMarkdown(article.body);
    assert.equal(portableTextToMarkdown(markdownToPortableText(markdown)), markdown, `${article.id}: stable Markdown`);
    assert.match(markdown, /^## /m, `${article.id}: substantive headings`);
    for (const [, href] of markdown.matchAll(/\]\(([^\s)]+)\)/g)) {
      assert.ok(/^(https:\/\/|\/docs\/|#)/.test(href), `${article.id}: source-relative or unsafe link ${href}`);
      if (href.startsWith('/docs/')) assert.ok(ids.has(href.slice('/docs/'.length).split('#')[0]), `${article.id}: unknown article ${href}`);
    }
  }
});
