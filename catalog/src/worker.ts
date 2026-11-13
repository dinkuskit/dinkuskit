import { listListedStores } from './listing.ts';
import { agentProfile, handleRpc } from './mcp.ts';
import { workersAiEmbedder, type Meaning, type VectorStore } from './meaning.ts';
import { refreshCatalog } from './sync.ts';
import { LOOKUP_CAPABILITY, SEARCH_CAPABILITY, UCP_VERSION } from './ucp.ts';

/**
 * catalog.dinkuskit.com: one catalog across every listed DinkusKit store, for shoppers'
 * AI agents. It reads each listed store's public feed, answers UCP's catalog tools, and
 * never holds a cart or takes money (GrillTrack agent-catalog-*-20261113).
 */
type RateLimit = { limit(input: { key: string }): Promise<{ success: boolean }> };
export type CatalogEnv = {
  CATALOG_DB: D1Database;
  MERCHANT_DB: D1Database;
  /** Workers AI and the two search indexes: products, and Shopify's category list. Without them the catalog answers by words only. */
  AI?: { run(model: string, input: unknown): Promise<unknown> };
  PRODUCT_INDEX?: VectorStore;
  CATEGORY_INDEX?: VectorStore;
  /** Space-separated store addresses that are never listed: test and playground stores. */
  CATALOG_EXCLUDED_ORIGINS?: string;
  /** Agents that name themselves: 5 requests a second. */
  NAMED_AGENT_LIMIT?: RateLimit;
  /** Agents that do not: a low limit per address. */
  UNNAMED_AGENT_LIMIT?: RateLimit;
};

export function meaningFor(env: CatalogEnv): Meaning | undefined {
  return env.AI && env.PRODUCT_INDEX ? { embed: workersAiEmbedder(env.AI), products: env.PRODUCT_INDEX, categories: env.CATEGORY_INDEX } : undefined;
}

const MCP_PATH = '/api/ucp/mcp', MAX_BODY_BYTES = 12 * 1024 * 1024;
const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers },
});

function profile(origin: string) {
  return {
    ucp: {
      version: UCP_VERSION,
      services: {
        'dev.ucp.shopping': [{
          version: UCP_VERSION, spec: `https://ucp.dev/${UCP_VERSION}/specification/overview`, transport: 'mcp',
          schema: `https://ucp.dev/${UCP_VERSION}/services/shopping/mcp.openrpc.json`, endpoint: `${origin}${MCP_PATH}`,
        }],
      },
      capabilities: {
        [SEARCH_CAPABILITY]: [{ version: UCP_VERSION, spec: `https://ucp.dev/${UCP_VERSION}/specification/shopping/catalog/search`, schema: `https://ucp.dev/${UCP_VERSION}/schemas/shopping/catalog_search.json` }],
        [LOOKUP_CAPABILITY]: [{ version: UCP_VERSION, spec: `https://ucp.dev/${UCP_VERSION}/specification/shopping/catalog/lookup`, schema: `https://ucp.dev/${UCP_VERSION}/schemas/shopping/catalog_lookup.json` }],
      },
      payment_handlers: {},
    },
  };
}

export async function handleRequest(request: Request, env: CatalogEnv): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/.well-known/ucp' && request.method === 'GET') return json(200, profile(url.origin), { 'cache-control': 'public, max-age=300' });
  if (url.pathname !== MCP_PATH) return json(404, { error: 'not_found' });
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' }, { allow: 'POST' });
  if (Number(request.headers.get('content-length') ?? '0') > MAX_BODY_BYTES) return json(413, { error: 'request_too_large' });
  let body: unknown;
  try { body = await request.json(); } catch { return json(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
  if (Array.isArray(body)) return json(400, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Send one request at a time' } });
  const address = request.headers.get('cf-connecting-ip') ?? 'unknown', named = agentProfile(body);
  const limiter = named ? env.NAMED_AGENT_LIMIT : env.UNNAMED_AGENT_LIMIT;
  if (limiter && !(await limiter.limit({ key: named ? `${named}|${address}` : address })).success) {
    return json(429, { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Too many requests. Slow down, or name your agent with meta["ucp-agent"].profile for a higher limit.' } }, { 'retry-after': '10' });
  }
  const answer = await handleRpc(env.CATALOG_DB, body, meaningFor(env));
  return answer ? json(200, answer) : new Response(null, { status: 202 });
}

export default {
  fetch: (request: Request, env: CatalogEnv) => handleRequest(request, env),
  async scheduled(_controller: unknown, env: CatalogEnv) {
    const excluded = (env.CATALOG_EXCLUDED_ORIGINS ?? '').split(/\s+/).filter(Boolean);
    const listed = await listListedStores(env.MERCHANT_DB, excluded);
    await refreshCatalog(env.CATALOG_DB, listed, fetch, Math.floor(Date.now() / 1000), meaningFor(env));
  },
};
