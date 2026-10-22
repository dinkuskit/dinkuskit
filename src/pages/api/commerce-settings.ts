import type { APIRoute } from 'astro';
import { MerchantUnavailableError, unavailableResponse } from '../../account/config.ts';
import { getMerchantEnv } from '../../account/bindings.ts';
import { serveCommerceSettings } from '../../account/commerce-settings.ts';
import { getInjectedTransports } from '../../account/transports.ts';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  try {
    const env = await getMerchantEnv();
    return serveCommerceSettings({
      db: env.MERCHANT_DB,
      authorization: context.request.headers.get('authorization'),
      privateJwkJson: env.MERCHANT_JWT_PRIVATE_JWK,
      registration: env.SHIP_SANDBOX_REGISTRATION,
      fetchStatus: getInjectedTransports().paymentsStatusFetch,
    });
  } catch (error) {
    if (error instanceof MerchantUnavailableError) return unavailableResponse();
    throw error;
  }
};
