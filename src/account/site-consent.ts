/**
 * Inventory published a public store-proof receipt protocol.
 * Website adoption lives on /api/store-connections, /account/connect, and
 * /api/store-connections/token. A posted site_id or origin is still not proof.
 * Production consent reads the store's registered proof route with
 * fetchStoreProofReceipt (redirect: 'manual', redirects refused).
 * Local protocol tests may inject a labeled simulation transport.
 * Hostname prechecks are not a DNS or IP firewall.
 */
export const SITE_ATTESTATION_NOTES = [
  'Plugin site_id is a host-scoped plugin identifier, not a native EmDash installation id.',
  'Website fetch compares every receipt field to the stored transaction.',
  'Grant+origin uniqueness is fail-closed; reinstall or ownership migration is manual.',
  'Consent is never implicit. Lost token responses return already_redeemed and require a fresh Connect.',
  'Production site proof is fetched from the registered proof route; redirects are refused, never followed.',
] as const;
