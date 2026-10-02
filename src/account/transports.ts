import { AsyncLocalStorage } from 'node:async_hooks';
import type { MerchantEmailDelivery } from './email.ts';
import type { ProofFetchFn } from './proof-fetch.ts';

export type MerchantTransports = {
  emailDelivery?: MerchantEmailDelivery;
  proofFetch?: ProofFetchFn;
  /** Exact request-scoped loopback origin admission for a test entry only. */
  testSiteOrigin?: string;
};

const ALS = Symbol.for('dinkuskit.merchant.transports.als');

function storage(): AsyncLocalStorage<MerchantTransports> {
  const global = globalThis as Record<symbol, AsyncLocalStorage<MerchantTransports> | undefined>;
  if (!global[ALS]) global[ALS] = new AsyncLocalStorage<MerchantTransports>();
  return global[ALS];
}

/** Test entry may install request-scoped transports. Production never enters this store. */
export function getInjectedTransports(): MerchantTransports {
  return storage().getStore() ?? {};
}

export function runWithMerchantTransports<T>(transports: MerchantTransports, fn: () => T): T {
  return storage().run(transports, fn);
}
