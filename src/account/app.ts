import { createMerchantEmailDelivery } from './email.ts';
import { createMerchantAuth, type MerchantAuth } from './auth.ts';
import type { MerchantEnv } from './config.ts';
import type { ProofFetchFn } from './proof-fetch.ts';
import { getInjectedTransports, type MerchantTransports } from './transports.ts';

export type { MerchantTransports };

export type MerchantApp = {
  env: MerchantEnv;
  auth: MerchantAuth;
  proofFetch?: ProofFetchFn;
};

export function createMerchantApp(env: MerchantEnv, transports: MerchantTransports = {}): MerchantApp {
  const injected = getInjectedTransports();
  const email = transports.emailDelivery
    ?? injected.emailDelivery
    ?? createMerchantEmailDelivery({ sendEmail: env.EMAIL });
  return {
    env,
    auth: createMerchantAuth(env, email),
    proofFetch: transports.proofFetch ?? injected.proofFetch,
  };
}
