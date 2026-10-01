/** Proof-labeled issuer used by the prior helper-only compatibility checks. */
export const PROOF_ISSUER = 'https://accounts.dinkuskit.invalid';
export { ACCOUNT_ISSUER } from './config.ts';

export type ServiceAudience = 'inventory' | 'dinkus-payments';
export type ServiceScope = 'inventory:admin' | 'payments:admin' | 'payments:checkout';

export const SERVICE_SCOPES: Record<ServiceAudience, readonly ServiceScope[]> = {
  inventory: ['inventory:admin'],
  'dinkus-payments': ['payments:admin', 'payments:checkout'],
};

export function canonicalAccountId(issuer: string, subject: string): string {
  if (!issuer.trim() || !subject.trim()) throw new Error('invalid_identity');
  if (issuer.length > 200 || subject.length > 200) throw new Error('invalid_identity');
  return JSON.stringify([issuer, subject]);
}

export function assertServicePair(audience: ServiceAudience, scope: ServiceScope): void {
  if (!SERVICE_SCOPES[audience]?.includes(scope)) throw new Error('invalid_service_pair');
}
