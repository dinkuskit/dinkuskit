import type { APIRoute } from 'astro';
import { MerchantUnavailableError, unavailableResponse } from '../../../account/config.ts';
import { getMerchantEnv } from '../../../account/bindings.ts';
import { createMerchantApp } from '../../../account/app.ts';
import { finishStoreSetup } from '../../../account/connect.ts';
import { getInjectedTransports } from '../../../account/transports.ts';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const env = await getMerchantEnv();
    const app = createMerchantApp(env);
    const body = await context.request.json().catch(() => null);
    return finishStoreSetup({
      db: env.MERCHANT_DB,
      body,
      jwtPrivateJwk: env.MERCHANT_JWT_PRIVATE_JWK,
      proofFetch: app.proofFetch,
      noticeEmail: getInjectedTransports().noticeEmail ?? env.EMAIL,
      baseUrl: env.MERCHANT_BASE_URL,
    });
  } catch (error) {
    if (error instanceof MerchantUnavailableError) return unavailableResponse();
    throw error;
  }
};
