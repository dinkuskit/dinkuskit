/** Proof-labeled DinkusKit identity and JWT bridge. Not a production auth platform. */
export { canonicalAccountId, PROOF_ISSUER, SERVICE_SCOPES, type ServiceAudience, type ServiceScope } from './identity.ts';
export { createProofServiceIssuer, type ProofServiceIssuer } from './issuer.ts';
export { createInventoryCompatibilityVerifier, createPaymentsCompatibilityVerifier } from './verifiers.ts';
