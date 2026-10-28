import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { handleDocsMcp, MAX_BODY_BYTES } from '../src/docs/mcp.ts';
import { markdownToPortableText } from '../src/docs/portable-text.ts';

const site = { origin: 'https://docs.example', name: 'Example', description: 'Example docs.', sectionPaths: { Reference: 'reference' } };

const article = (id, data = {}) => ({
  id, title: 'Catalog integration', navLabel: 'Catalog', summary: 'Read public products.', audience: 'Developers',
  product: 'Commerce', versionScope: 'Commerce 0.3.0', section: 'Reference', order: 10, draft: false,
  updated: new Date('2026-10-19T00:00:00Z'), body: markdownToPortableText('## Price\n\nThe public catalog is authoritative.'), ...data,
});

const published = article('reference/commerce');
const draft = article('reference/payments', { title: 'Private draft', summary: 'Do not publish this sentence.', draft: true, versionScope: 'secret draft scope' });

async function call(method, params, { articles = [published, draft], http = 'POST', headers = {}, body, id = 1 } = {}) {
  const request = new Request('https://dinkuskit.com/docs/mcp', {
    method: http,
    headers: {
      origin: 'https://claude.ai',
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-protocol-version': '2025-11-25',
      authorization: 'Bearer ec_pat_ignored',
      ...headers,
    },
    body: http === 'GET' || http === 'OPTIONS' ? undefined : body ?? JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const response = await handleDocsMcp(request, articles, site);
  const text = await response.text();
  return { status: response.status, headers: response.headers, text, body: text ? JSON.parse(text) : null };
}

test('the docs MCP is a public search-and-read server with no other tools', async () => {
  const started = await call('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
  assert.equal(started.status, 200);
  assert.equal(started.body.result.serverInfo.name, 'dinkuskit-docs');
  assert.equal(started.body.result.protocolVersion, '2025-11-25');
  assert.deepEqual(started.body.result.capabilities, { tools: { listChanged: false } });
  assert.equal(started.headers.get('mcp-session-id'), null);
  assert.equal((await call('initialize', { protocolVersion: '2025-03-26' })).body.result.protocolVersion, '2025-03-26');
  assert.equal((await call('initialize', { protocolVersion: '2024-11-05' })).body.result.protocolVersion, '2025-11-25');

  const listed = await call('tools/list', {});
  assert.deepEqual(listed.body.result.tools.map(tool => tool.name), ['search_docs', 'get_docs']);
  for (const tool of listed.body.result.tools) {
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.destructiveHint, false);
    assert.equal(tool.annotations.openWorldHint, false);
  }
  assert.equal((await call('resources/list', {})).body.error.code, -32601);
  assert.equal((await call('prompts/list', {})).body.error.code, -32601);
  assert.deepEqual((await call('ping', {})).body.result, {});
});

test('search and read return the published article and nothing for drafts, urls, or unknown ids', async () => {
  const searched = await call('tools/call', { name: 'search_docs', arguments: { query: 'catalog price', max_results: 1 } });
  assert.equal(searched.body.result.isError, undefined);
  assert.deepEqual(searched.body.result.structuredContent.results.map(item => item.id), ['reference/commerce']);
  const hit = searched.body.result.structuredContent.results[0];
  assert.equal(hit.title, 'Catalog integration');
  assert.equal(hit.url, 'https://docs.example/docs/reference/commerce');
  assert.equal(hit.version, 'Commerce 0.3.0');
  assert.match(hit.excerpt, /public catalog/);
  assert.match(searched.body.result.content[0].text, /source="https:\/\/docs\.example\/docs\/reference\/commerce"/);
  assert.equal(JSON.stringify(searched.body).includes('Private draft'), false);
  assert.equal(JSON.stringify(searched.body).includes('Do not publish this sentence'), false);

  const read = await call('tools/call', { name: 'get_docs', arguments: { ids: ['reference/commerce', 'reference/payments', 'https://example.invalid/secret', '../seed/seed.json', '/docs/reference/commerce'] } });
  assert.deepEqual(read.body.result.structuredContent.documents.map(item => item.id), ['reference/commerce']);
  assert.match(read.body.result.structuredContent.documents[0].content, /Version scope: Commerce 0\.3\.0/);
  assert.match(read.body.result.structuredContent.documents[0].content, /Canonical URL: https:\/\/docs\.example\/docs\/reference\/commerce/);
  assert.match(read.body.result.content[0].text, /The public catalog is authoritative/);
  const readText = JSON.stringify(read.body);
  assert.equal(readText.includes('Private draft'), false);
  assert.equal(readText.includes('example.invalid'), false);
  assert.equal(readText.includes('seed.json'), false);

  const missing = await call('tools/call', { name: 'get_docs', arguments: { ids: ['reference/payments'] } });
  assert.deepEqual(missing.body.result.structuredContent.documents, []);
  assert.equal(missing.body.result.content[0].text, 'No published article.');
  const empty = await call('tools/call', { name: 'search_docs', arguments: { query: 'checkout' } }, { articles: [] });
  assert.equal(empty.body.result.content[0].text, 'No matching docs found.');
  assert.deepEqual(empty.body.result.structuredContent.results, []);
});

test('bad tool arguments and protocol mistakes fail closed', async () => {
  const longQuery = await call('tools/call', { name: 'search_docs', arguments: { query: 'a'.repeat(1001) } });
  assert.equal(longQuery.body.result.isError, true);
  const tooMany = await call('tools/call', { name: 'get_docs', arguments: { ids: Array.from({ length: 21 }, (_, index) => `id-${index}`) } });
  assert.equal(tooMany.body.result.isError, true);
  assert.equal((await call('tools/call', { name: 'content_list', arguments: {} })).body.result.isError, true);
  assert.match((await call('tools/call', { name: 'content_list', arguments: {} })).body.result.content[0].text, /published documentation/);

  assert.equal((await call('notifications/initialized', {}, { id: undefined, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) })).status, 202);
  assert.equal((await call('initialize', {}, { body: 'not json' })).body.error.code, -32700);
  assert.equal((await call('initialize', {}, { body: '[]' })).status, 400);
  assert.equal((await call('nope', {})).body.error.code, -32601);
  assert.equal((await call('tools/list', {}, { http: 'GET' })).status, 405);
  assert.equal((await call('tools/list', {}, { http: 'GET' })).headers.get('allow'), 'POST');
  assert.equal((await call('tools/list', {}, { http: 'DELETE' })).status, 405);
  assert.equal((await call('tools/list', {}, { http: 'OPTIONS' })).status, 204);
  assert.equal((await call('tools/list', {}, { headers: { accept: 'application/json' } })).status, 406);
  assert.equal((await call('tools/list', {}, { headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await call('tools/list', {}, { headers: { 'mcp-protocol-version': '2024-11-05' } })).status, 400);
  assert.equal((await call('tools/list', {}, { headers: { origin: 'javascript:alert(1)' } })).status, 403);

  const oversized = await call('tools/list', {}, { body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', pad: 'x'.repeat(70_000) }) });
  assert.equal(oversized.status, 400);
  assert.match(oversized.body.error.message, /too large/);

  const route = readFileSync(new URL('../src/pages/docs/mcp.ts', import.meta.url), 'utf8');
  const handler = readFileSync(new URL('../src/docs/mcp.ts', import.meta.url), 'utf8');
  assert.match(route, /getPublicDocs/);
  assert.doesNotMatch(route, /getVisibleDocs/);
  assert.doesNotMatch(handler, /getVisibleDocs|fetch\(|DINKUSKIT_EMDASH_TOKEN|ec_pat_/);
  assert.doesNotMatch(handler, /request\.text\(/);
});

test('an oversized stream is cancelled before the rest of the body is read', async () => {
  const chunk = new Uint8Array(16 * 1024);
  let pulls = 0;
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) {
      pulls += 1;
      if (pulls > 100) {
        controller.close();
        return;
      }
      controller.enqueue(chunk);
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request('https://dinkuskit.com/docs/mcp', {
    method: 'POST',
    duplex: 'half',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-protocol-version': '2025-11-25',
    },
    body: stream,
  });
  assert.equal(request.headers.get('content-length'), null);
  const response = await handleDocsMcp(request, [], site);
  const payload = await response.json();
  assert.equal(response.status, 400);
  assert.match(payload.error.message, /too large/);
  assert.equal(cancelled, true);
  assert.equal(pulls, Math.floor(MAX_BODY_BYTES / chunk.byteLength) + 1);
});

test('a multibyte body under the character cap is rejected once its bytes pass the limit', async () => {
  const text = '€'.repeat(MAX_BODY_BYTES);
  const encoded = new TextEncoder().encode(text);
  assert.equal(text.length, MAX_BODY_BYTES);
  assert.ok(encoded.byteLength > MAX_BODY_BYTES);
  let sent = 0;
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) {
      if (sent >= encoded.byteLength) {
        controller.close();
        return;
      }
      const next = Math.min(sent + 16 * 1024, encoded.byteLength);
      controller.enqueue(encoded.subarray(sent, next));
      sent = next;
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request('https://dinkuskit.com/docs/mcp', {
    method: 'POST',
    duplex: 'half',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-protocol-version': '2025-11-25',
    },
    body: stream,
  });
  assert.equal(request.headers.get('content-length'), null);
  const response = await handleDocsMcp(request, [], site);
  const payload = await response.json();
  assert.equal(response.status, 400);
  assert.match(payload.error.message, /too large/);
  assert.equal(cancelled, true);
  assert.ok(sent > MAX_BODY_BYTES);
  assert.ok(sent < encoded.byteLength);
});
