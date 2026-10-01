import type { APIRoute } from 'astro';
import { MerchantUnavailableError, unavailableResponse } from '../../../account/config.ts';
import { getMerchantEnv } from '../../../account/bindings.ts';
import { listPublicJwks } from '../../../account/store.ts';

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const env = await getMerchantEnv();
    return new Response(JSON.stringify(await listPublicJwks(env.MERCHANT_DB)), {
      headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=60' },
    });
  } catch (error) {
    if (error instanceof MerchantUnavailableError) return unavailableResponse();
    throw error;
  }
};
