/** DinkusKit merchant identity, Better Auth runtime, and service JWT boundary. */
export { canonicalAccountId, ACCOUNT_ISSUER, PROOF_ISSUER, SERVICE_SCOPES, type ServiceAudience, type ServiceScope } from './identity.ts';
export { createProofServiceIssuer, type ProofServiceIssuer } from './issuer.ts';
export { createInventoryCompatibilityVerifier, createPaymentsCompatibilityVerifier } from './verifiers.ts';
export { createMerchantAuth, createMerchantRuntime } from './auth.ts';
export { createMerchantApp } from './app.ts';
export { SITE_ATTESTATION_NOTES } from './site-consent.ts';
