import type { APIRoute } from 'astro';
import { MerchantUnavailableError, unavailableResponse } from '../../../account/config.ts';
import { getMerchantEnv } from '../../../account/bindings.ts';
import { createMerchantRuntime } from '../../../account/auth.ts';

export const prerender = false;

export const ALL: APIRoute = async (context) => {
  try {
    const env = await getMerchantEnv();
    const { auth } = createMerchantRuntime(env);
    return auth.handler(context.request);
  } catch (error) {
    if (error instanceof MerchantUnavailableError) return unavailableResponse();
    throw error;
  }
};
