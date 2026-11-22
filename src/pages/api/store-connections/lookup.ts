import type { APIRoute } from 'astro';
import { MerchantUnavailableError, unavailableResponse } from '../../../account/config.ts';
import { getMerchantEnv } from '../../../account/bindings.ts';
import { lookupStoreConnection } from '../../../account/connect.ts';
import { getInjectedTransports } from '../../../account/transports.ts';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const env = await getMerchantEnv();
    const body = await context.request.json().catch(() => null);
    return lookupStoreConnection(env.MERCHANT_DB, body, { allowExactOrigin: getInjectedTransports().testSiteOrigin });
  } catch (error) {
    if (error instanceof MerchantUnavailableError) return unavailableResponse();
    throw error;
  }
};
