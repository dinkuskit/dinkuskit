import { AsyncLocalStorage } from 'node:async_hooks';

export const CMS_PROOF_ALS = Symbol.for('dinkuskit.cms.proof.als');

export function installCmsProofAls() {
  const global = globalThis;
  if (!global[CMS_PROOF_ALS]) global[CMS_PROOF_ALS] = new AsyncLocalStorage();
  return global[CMS_PROOF_ALS];
}

export function runWithCmsProof(fn) {
  return installCmsProofAls().run(true, fn);
}
