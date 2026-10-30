import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { resetDatabase, start, unusedPort } from './lib/docs-preview.mjs';

// Drives the docs preview fixture (its own EmDash SQLite database) through the
// real publish switch: seed the thirteen drafts, reload them with the one-time
// import script, publish one article through the EmDash API, then check what
// local development and a production build each serve from that database.
const ARTICLES = [
  'start-here', 'store-owners/setup', 'store-owners/first-product', 'store-owners/test-order',
  'developers/integrate', 'developers/add-on', 'developers/contribute',
  'reference/commerce', 'reference/payments', 'reference/inventory', 'reference/ship', 'troubleshooting', 'ai-assistants',
];
const PUBLISHED = 'store-owners/test-order';

async function page(server, path) {
  const response = await server.request(path);
  return { status: response.status, headers: response.headers, body: await response.text() };
}

async function mcp(server, method, params) {
  const response = await server.request('/docs/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-11-25',
      authorization: 'Bearer ec_pat_preview',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  assert.equal(response.status, 200, `docs MCP ${method}`);
  const body = await response.json();
  assert.equal(body.error, undefined, JSON.stringify(body.error));
  return body.result;
}

async function assertDocsMcp(server, published) {
  const tools = await mcp(server, 'tools/list', {});
  assert.deepEqual(tools.tools.map(tool => tool.name), ['search_docs', 'get_docs']);
  const searched = await mcp(server, 'tools/call', { name: 'search_docs', arguments: { query: 'test order' } });
  const read = await mcp(server, 'tools/call', { name: 'get_docs', arguments: { ids: [PUBLISHED, 'start-here', 'https://example.invalid/secret', '../seed/seed.json'] } });
  const dumped = JSON.stringify({ searched, read });
  assert.equal(dumped.includes('Choose your path and check requirements'), false, 'draft article stays out of the docs MCP');
  assert.equal(dumped.includes('example.invalid'), false);
  if (published) {
    assert.deepEqual(searched.structuredContent.results.map(item => item.id), [PUBLISHED]);
    assert.equal(searched.structuredContent.results[0].url, `https://dinkuskit.com/docs/${PUBLISHED}`);
    assert.equal(searched.structuredContent.results[0].title, 'Complete and verify a test order');
    assert.match(searched.structuredContent.results[0].version, /Commerce/);
    assert.deepEqual(read.structuredContent.documents.map(item => item.id), [PUBLISHED]);
    assert.match(read.structuredContent.documents[0].content, /What counts as success/);
    assert.match(read.content[0].text, /Canonical URL: https:\/\/dinkuskit\.com\/docs\/store-owners\/test-order/);
  } else {
    assert.deepEqual(searched.structuredContent.results, []);
    assert.deepEqual(read.structuredContent.documents, []);
    assert.equal(dumped.includes('What counts as success'), false);
  }
  assert.equal((await server.request('/docs/mcp')).status, 405);
}

async function publicCorpus(server) {
  const search = await page(server, '/docs/search.json');
  assert.equal(search.status, 200);
  const llms = await page(server, '/llms.txt');
  return { search: JSON.parse(search.body).map(item => item.id), llms };
}

function runImport(base, token) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', 'scripts/docs-import.mjs', 'push', '--url', base], {
      env: { ...process.env, EMDASH_TOKEN: token }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', reject);
    child.on('exit', code => resolve({ code, output }));
  });
}

async function checkDraftPage(server, id, draft) {
  const response = await page(server, `/docs/${id}`);
  assert.equal(response.status, 200, `development: ${id}`);
  assert.equal(response.body.includes('Draft for review.'), draft, `${id}: draft notice`);
  assert.equal(response.headers.get('x-robots-tag'), draft ? 'noindex, nofollow' : null, `${id}: robots header`);
  assert.equal(response.headers.get('cache-control'), draft ? 'no-store' : null, `${id}: cache header`);
  assert.ok(response.body.includes(`https://dinkuskit.com/docs/${id}`), `${id}: canonical URL`);
  assert.match(response.body, /aria-current="page"/);
  assert.match(response.body, /class="docs-page-actions"/);
  assert.match(response.body, /<time datetime="\d{4}-\d{2}-\d{2}">/);
  assert.match(response.body, /<h2 id="[a-z0-9-]+">/, `${id}: heading anchors`);
  assert.ok(response.body.includes(`data-copy-markdown="/docs/markdown/${id}.md"`));
  assert.ok(response.body.includes(`href="/docs/markdown/${id}.md">View as Markdown</a>`));
  const embedded = response.body.match(/id="docs-search-data"[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(embedded, `${id}: local search data`);
  assert.equal(JSON.parse(embedded[1]).length, ARTICLES.length);
  const markdown = await page(server, `/docs/markdown/${id}.md`);
  assert.equal(markdown.status, 200, `development Markdown: ${id}`);
  assert.equal(markdown.headers.get('content-type'), 'text/markdown; charset=utf-8');
  assert.equal(markdown.headers.get('x-robots-tag'), draft ? 'noindex, nofollow' : null);
  assert.match(markdown.body, /^# /);
  assert.match(markdown.body, /\n## /);
  assert.match(markdown.body, /Last updated: \d{4}-\d{2}-\d{2}/);
  assert.ok(markdown.body.includes(`Canonical URL: https://dinkuskit.com/docs/${id}`));
}

await resetDatabase();

const development = start('development', await unusedPort());
try {
  await development.ready();
  const bypass = await (await development.request('/_emdash/api/setup/dev-bypass?token=1', { method: 'POST' })).json();
  const token = bypass.data?.token;
  assert.ok(token, `dev setup returned an API token: ${JSON.stringify(bypass).slice(0, 300)}`);
  const api = (path, options = {}) => development.request(`/_emdash/api${path}`, {
    ...options, headers: { authorization: `Bearer ${token}`, 'x-emdash-request': '1', ...options.headers },
  });
  for (const id of ARTICLES) await checkDraftPage(development, id, true);
  let corpus = await publicCorpus(development);
  assert.deepEqual(corpus.search, [], 'drafts never enter the public search index');
  assert.equal(corpus.llms.status, 404, 'llms.txt waits for a published article');
  await assertDocsMcp(development, false);
  console.log('PASS development: the seed loads 13 drafts, previewed with noindex/no-store and kept out of search, llms.txt and the docs MCP');

  // The one-time import: remove the collection, then rebuild it and the drafts through the EmDash API.
  assert.equal((await api('/schema/collections/docs?force=true', { method: 'DELETE' })).status, 200);
  assert.equal((await page(development, `/docs/${PUBLISHED}`)).status, 404, 'no collection, no docs');
  let imported;
  for (let attempt = 0; attempt < 30; attempt++) {
    imported = await runImport(development.base, token);
    if (!imported.output.includes('is being deleted')) break;
    await delay(1000);
  }
  assert.equal(imported.code, 0, imported.output);
  assert.match(imported.output, /Created the docs collection/);
  assert.equal(imported.output.match(/^Added draft /gm)?.length, ARTICLES.length, imported.output);
  const again = await runImport(development.base, token);
  assert.equal(again.code, 0, again.output);
  assert.equal(again.output.match(/^Kept existing /gm)?.length, ARTICLES.length, 'a second import changes nothing');
  for (const id of ARTICLES) assert.equal((await page(development, `/docs/${id}`)).status, 200, `imported: ${id}`);
  console.log('PASS import script: created the collection, its fields and 13 drafts through the EmDash API; a rerun keeps them');

  // Publish one article the way the admin's Publish button does.
  const slug = PUBLISHED.split('/').at(-1);
  const found = await (await api(`/content/docs/${slug}`)).json();
  const entryId = found.data?.item?.id;
  assert.ok(entryId, 'draft entry found by slug');
  assert.equal((await api(`/content/docs/${entryId}/publish`, { method: 'POST' })).status, 200);
  await checkDraftPage(development, PUBLISHED, false);
  corpus = await publicCorpus(development);
  assert.deepEqual(corpus.search, [PUBLISHED]);
  assert.equal(corpus.llms.status, 200);
  await assertDocsMcp(development, true);
  console.log('PASS development: Publish through the EmDash API makes one article public, including the docs MCP, with no rebuild');
} finally {
  await development.stop();
}

const production = start('production', await unusedPort());
try {
  await production.ready();
  for (const id of ARTICLES) {
    const response = await page(production, `/docs/${id}`);
    const markdown = await page(production, `/docs/markdown/${id}.md`);
    if (id === PUBLISHED) {
      assert.equal(response.status, 200, `production: ${id}`);
      assert.ok(!response.body.includes('Draft for review.'));
      assert.equal(response.headers.get('x-robots-tag'), null);
      assert.ok(!response.body.includes('name="robots"'));
      assert.match(response.body, /<h2 id="what-counts-as-success">What counts as success<\/h2>/);
      // A fresh seed draws its marked links as logos in the header, then the footer (issue #106).
      const seedLogos = [['https://github.com/dinkuskit', 'DinkusKit on GitHub'], ['https://discord.gg/7yHZGj8p88', 'Join DinkusKit on Discord']];
      const logos = [...response.body.matchAll(/<a class="social-link" href="([^"]+)"[^>]*>[\s\S]*?<span class="visually-hidden">([^<]+)<\/span>/g)].map(match => [match[1], match[2]]);
      assert.deepEqual(logos, [...seedLogos, ...seedLogos]);
      const column = response.body.match(/<h2>DinkusKit<\/h2>\s*<ul>([\s\S]*?)<\/ul>/)?.[1] ?? '';
      assert.match(column, /href="https:\/\/github\.com\/dinkuskit\/dinkuskit"[^>]*>\s*Website source/, 'Website source stays in its column');
      assert.doesNotMatch(column, /href="https:\/\/github\.com\/dinkuskit"/, 'the GitHub link is out of its column');
      const embedded = JSON.parse(response.body.match(/id="docs-search-data"[^>]*>([\s\S]*?)<\/script>/)[1]);
      assert.deepEqual(embedded.map(item => item.id), [PUBLISHED], 'the page embeds only published articles');
      assert.equal(markdown.status, 200);
      assert.ok(markdown.body.startsWith('# Complete and verify a test order\n'));
      assert.ok(markdown.body.includes('| `recorded` | Commerce acknowledged the checkout; independently verify the corresponding Orders entry. |'));
    } else {
      assert.equal(response.status, 404, `production draft: ${id}`);
      assert.ok(!response.body.includes('Draft for review.'), 'no draft body');
      assert.ok(!response.body.includes('id="docs-search-data"'), 'no draft index');
      assert.equal(markdown.status, 404, `production draft Markdown: ${id}`);
    }
  }
  const corpus = await publicCorpus(production);
  assert.deepEqual(corpus.search, [PUBLISHED]);
  assert.equal(corpus.llms.status, 200);
  assert.equal((corpus.llms.body.match(/^- \[/gm) ?? []).length, 1);
  assert.ok(corpus.llms.body.includes(`(https://dinkuskit.com/docs/markdown/${PUBLISHED}.md)`));
  await assertDocsMcp(production, true);
  assert.equal((await page(production, '/docs')).headers.get('location'), `/docs/${PUBLISHED}`);
  assert.equal((await page(production, '/docs/internal-plan')).status, 404);
  assert.equal((await page(production, '/docs/markdown/internal-plan.md')).status, 404);
  assert.equal((await page(production, '/docs/start-here?preview=1')).status, 404);
  assert.equal((await page(production, '/docs/markdown/start-here.md?preview=1')).status, 404);
  assert.equal((await production.request('/_emdash/api/setup/dev-bypass', { method: 'POST' })).status, 403);
  console.log('PASS production: only the published article is served (HTML, Markdown, search, llms.txt, docs MCP); 12 drafts and unknown IDs are 404; query parameters cannot preview');
} finally {
  await production.stop();
}
