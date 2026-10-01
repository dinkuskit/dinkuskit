import type { APIRoute } from 'astro';

export const prerender = false;

/** Merchant-session surface only. Inventory polls /api/store-connections/token. */
export const POST: APIRoute = async () => {
  return Response.json({
    error: 'use_store_connections_token',
    detail: 'Plugins must poll POST /api/store-connections/token with S256 PKCE. This session route does not mint Inventory tokens.',
  }, { status: 403 });
};
