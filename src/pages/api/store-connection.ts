import type { APIRoute } from 'astro';
import { MerchantUnavailableError, unavailableResponse } from '../../account/config.ts';
import { getMerchantEnv } from '../../account/bindings.ts';
import { serveStoreConnection } from '../../account/store-passes.ts';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  try {
    const env = await getMerchantEnv();
    return serveStoreConnection({ db: env.MERCHANT_DB, authorization: context.request.headers.get('authorization') });
  } catch (error) {
    if (error instanceof MerchantUnavailableError) return unavailableResponse();
    throw error;
  }
};
