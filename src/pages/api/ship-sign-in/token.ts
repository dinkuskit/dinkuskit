import type { APIRoute } from 'astro';
import { MerchantUnavailableError, unavailableResponse } from '../../../account/config.ts';
import { getMerchantEnv } from '../../../account/bindings.ts';
import { exchangeShipToken } from '../../../account/ship-sign-in.ts';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const env = await getMerchantEnv();
    const body = await context.request.json().catch(() => null);
    return exchangeShipToken({ db: env.MERCHANT_DB, body, registration: env.SHIP_SANDBOX_REGISTRATION, privateJwkJson: env.MERCHANT_JWT_PRIVATE_JWK });
  } catch (error) {
    if (error instanceof MerchantUnavailableError) return unavailableResponse();
    throw error;
  }
};
