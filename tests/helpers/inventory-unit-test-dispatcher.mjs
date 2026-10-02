import { createServer } from 'node:http';

const PATH = '/_emdash/api/plugins/dinkus-inventory/store-proof';
const MAX_BYTES = 8192;

export function createInventoryReceiptFixture({ port = 47633 } = {}) {
  const receipts = new Map();
  const requests = [];
  let mode = 'normal';
  let server;
  const dispatch = async (request) => {
    const url = new URL(request.url);
    if (
      request.method !== 'GET' ||
      url.pathname !== PATH ||
      url.searchParams.size !== 1 ||
      !url.searchParams.has('connection_id')
    ) {
      return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
    }
    const receipt = receipts.get(url.searchParams.get('connection_id'));
    if (!receipt) return new Response(JSON.stringify({ error: 'unknown_connection' }), { status: 404 });
    if (mode === 'redirect') return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/foreign' } });
    if (mode === 'delay') await new Promise(resolve => setTimeout(resolve, 3200));
    if (mode === 'oversize') return new Response('x'.repeat(MAX_BYTES + 1), { status: 200 });
    if (mode === 'malformed') return new Response('{', { status: 200 });
    const body = JSON.stringify(receipt);
    return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return {
    origin: `http://127.0.0.1:${port}`,
    dispatch,
    async start() {
      server = createServer(async (request, response) => {
        const url = new URL(request.url, `http://127.0.0.1:${port}`);
        if (
          request.method !== 'GET' ||
          url.pathname !== PATH ||
          url.searchParams.size !== 1 ||
          !url.searchParams.has('connection_id')
        ) {
          request.resume();
          response.writeHead(404);
          response.end();
          return;
        }
        try {
          const chunks = [];
          for await (const chunk of request) chunks.push(chunk);
          const body = Buffer.concat(chunks);
          const forwarded = new Request(`http://127.0.0.1:${port}${request.url}`, {
            method: request.method,
            headers: request.headers,
            body: body.byteLength ? body : undefined,
          });
          requests.push({
            method: request.method,
            url: request.url,
            accept: request.headers.accept ?? '',
            body: '',
          });
          const result = await dispatch(forwarded);
          response.writeHead(result.status, Object.fromEntries(result.headers));
          response.end(Buffer.from(await result.arrayBuffer()));
        } catch {
          response.writeHead(500);
          response.end();
        }
      });
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', resolve);
      });
    },
    port,
    requests,
    async register(receipt) {
      receipts.set(receipt.connection_id, structuredClone(receipt));
    },
    async setMode(next) {
      if (!['normal', 'redirect', 'delay', 'oversize', 'malformed'].includes(next)) {
        throw new Error('invalid_dispatcher_mode');
      }
      mode = next;
    },
    async stop() {
      if (!server) return;
      server.closeAllConnections?.();
      await new Promise(resolve => server.close(resolve));
      server = undefined;
    },
  };
}
