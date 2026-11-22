import type { ListedStore } from './sync.ts';

/**
 * Which stores are listed (GrillTrack agent-catalog-listing-20261113): connected to
 * DinkusKit, its business approved and active, Payments connected, and no service cut
 * off by an operator. The owner's own switch is not here: it lives in the store admin
 * only (agent-catalog-toggle-home-20261113), and while it is off the store's feed lists
 * no products. Test and playground stores are named in `excludedOrigins`.
 */
const LISTED_STORES = `SELECT i.site_id, i.site_origin FROM dinkuskit_store_identity i
  WHERE i.site_origin LIKE 'https://%'
    AND EXISTS (SELECT 1 FROM dinkuskit_organization o JOIN dinkuskit_account a ON a.user_id = o.owner_user_id
      JOIN dinkuskit_membership m ON m.organization_id = o.organization_id AND m.user_id = o.owner_user_id
      WHERE o.authority_subject = i.account_subject AND o.status = 'active' AND o.admission_status <> 'pending_operator'
        AND a.disabled = 0 AND m.role = 'owner' AND m.status = 'active')
    AND EXISTS (SELECT 1 FROM dinkuskit_plugin_key k WHERE k.site_id = i.site_id AND k.plugin = 'payments')
    AND NOT EXISTS (SELECT 1 FROM dinkuskit_service_grant g WHERE g.site_id = i.site_id AND g.revoked = 1 AND g.revoked_by = 'operator')
  ORDER BY i.created_at, i.site_id`;

export async function listListedStores(merchantDb: D1Database, excludedOrigins: readonly string[]): Promise<ListedStore[]> {
  const rows = await merchantDb.prepare(LISTED_STORES).all<{ site_id: string; site_origin: string }>();
  const excluded = new Set(excludedOrigins);
  return (rows.results ?? []).filter(row => !excluded.has(row.site_origin)).map(row => ({ siteId: row.site_id, siteOrigin: row.site_origin }));
}
