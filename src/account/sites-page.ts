import { shipRecipient } from './ship-recipient.ts';
import { MerchantUnavailableError, seeOther, unavailableResponse, COMING_SOON_SERVICES, OWNER_ENABLED_SERVICES, type OwnerEnabledService } from './config.ts';
import { getMerchantEnv } from './bindings.ts';
import { listActiveBindings, listServiceGrants, revokeServiceGrant, type SiteBinding } from './store.ts';
import { rejectCrossOriginMutation } from './origin.ts';
import { authorizeOrganization } from './organizations.ts';
import { listStoreSetup, replaceStoreKey, setOwnerService, type StoreSetup } from './store-passes.ts';
import { checkoutSettingsJson, dollarsToMinor, loadCommerceSettings, readPaymentsBinding, saveCommerceSettings, type CommerceSettings } from './commerce-settings.ts';
import { getInjectedTransports } from './transports.ts';
import type { ResolvedMerchant } from './session.ts';

export type SitesShown = { siteId: string; json?: string; note?: string; error?: string };
export type SitesPageView = {
  showingArchive: boolean;
  businessName: string;
  visibleBindings: SiteBinding[];
  visibleStores: StoreSetup[];
  showArchiveLink: boolean;
  isOwner: boolean;
  formAction: string;
  organizationId: string;
  newKey: { siteId: string; key: string } | null;
  shown: SitesShown | null;
  changedSite: string | null;
  saved: Map<string, CommerceSettings | null>;
};

const SETTINGS_ERROR: Record<string, string> = {
  invalid_amount: 'Enter the flat shipping charge in dollars, like 5 or 5.00.',
  forbidden: 'Only the owner of this business can set up Commerce for this store.',
  payments_not_connected: 'Payments is not connected for this store. Press Connect in the Payments plugin first.',
  payments_not_set_up: 'Payments has not finished setting up this store\'s Stripe or Authorize.net account. Finish it in the Payments plugin, then try again.',
  payments_unreachable: 'DinkusKit could not reach Payments just now. Try again in a minute.',
  signing_unavailable: 'DinkusKit cannot reach Payments right now. Try again later.',
};

/** Live Your stores, or the archive of stores with nothing left on. One Commerce setup either way. */
export async function loadSitesPage(input: {
  request: Request;
  url: URL;
  merchant: ResolvedMerchant | null;
  view: 'live' | 'archive';
}): Promise<Response | SitesPageView> {
  const merchant = input.merchant;
  if (!merchant) return seeOther('/account/sign-in');
  let env;
  try {
    env = await getMerchantEnv();
  } catch (error) {
    if (error instanceof MerchantUnavailableError) return unavailableResponse();
    throw error;
  }
  let newKey: { siteId: string; key: string } | null = null;
  let shown: SitesShown | null = null;
  // A store the business still owns, on the live page only while a service is on.
  const homeFor = async (siteId: string) => {
    if (!siteId) return '/account/sites';
    const [active, grants, setups] = await Promise.all([
      listActiveBindings(env.MERCHANT_DB, merchant.subject),
      listServiceGrants(env.MERCHANT_DB, merchant.subject),
      listStoreSetup(env.MERCHANT_DB, merchant.subject),
    ]);
    const known = active.some(binding => binding.siteId === siteId)
      || grants.some(binding => binding.siteId === siteId)
      || setups.some(store => store.siteId === siteId);
    if (!known) return '/account/sites';
    return active.some(binding => binding.siteId === siteId) ? '/account/sites' : '/account/sites/archive';
  };
  if (input.request.method === 'POST') {
    const blocked = rejectCrossOriginMutation(input.request, env.MERCHANT_BASE_URL);
    if (blocked) return blocked;
    const form = await input.request.formData();
    const organizationId = String(form.get('organization_id') ?? '');
    if (organizationId !== merchant.organizationId) return new Response(JSON.stringify({ error: 'stale_organization' }), { status: 409 });
    const mutationMembership = await authorizeOrganization(env.MERCHANT_DB, merchant.userId, organizationId);
    if (!mutationMembership || mutationMembership.role !== 'owner') return new Response(JSON.stringify({ error: 'organization_forbidden' }), { status: 403 });
    const siteId = String(form.get('site_id') ?? '');
    const owner = { subject: merchant.subject, siteId, organizationId, actorUserId: merchant.userId };
    if (form.get('action') === 'revoke') {
      const service = String(form.get('service') ?? 'inventory');
      if (siteId) await revokeServiceGrant(env.MERCHANT_DB, merchant.subject, siteId, service, merchant.userId, organizationId);
    }
    const ownerService = form.get('service') as OwnerEnabledService;
    const turnOn = form.get('on') === '1';
    if (form.get('action') === 'service' && siteId && OWNER_ENABLED_SERVICES.includes(ownerService) && !(turnOn && COMING_SOON_SERVICES.includes(ownerService))) {
      await setOwnerService(env.MERCHANT_DB, { ...owner, service: ownerService, on: turnOn });
      // Commerce only calls the services its pasted settings name, so the owner pastes new ones.
      if (await loadCommerceSettings(env.MERCHANT_DB, siteId)) return seeOther(`${await homeFor(siteId)}?changed=${encodeURIComponent(siteId)}`);
    }
    if (form.get('action') === 'checkout_settings' && siteId) {
      if (shipRecipient(siteId, env.SHIP_SANDBOX_REGISTRATION) && form.get('payments_mode') === 'live') return new Response(JSON.stringify({ error: 'ship_test_required' }), { status: 400, headers: { 'content-type': 'application/json' } });
      const flat = form.get('shipping_mode') === 'flat';
      const minor = flat ? dollarsToMinor(String(form.get('shipping_amount') ?? '')) : 0;
      const settings = minor === null ? null : await saveCommerceSettings(env.MERCHANT_DB, {
        ...owner, choices: { shippingMode: flat ? 'flat' : 'free', shippingMinor: minor, live: form.get('payments_mode') === 'live' },
      });
      if (minor === null || !settings) {
        shown = { siteId, error: SETTINGS_ERROR[minor === null ? 'invalid_amount' : 'forbidden'] };
      } else {
        const payments = await readPaymentsBinding({
          db: env.MERCHANT_DB, subject: merchant.subject, siteId, privateJwkJson: env.MERCHANT_JWT_PRIVATE_JWK,
          fetchStatus: getInjectedTransports().paymentsStatusFetch,
        });
        if (!payments.ok) {
          shown = { siteId, error: SETTINGS_ERROR[payments.reason] };
        } else {
          const store = (await listStoreSetup(env.MERCHANT_DB, merchant.subject)).find(row => row.siteId === siteId);
          shown = store ? {
            siteId,
            json: checkoutSettingsJson({ registration: env.SHIP_SANDBOX_REGISTRATION, siteId, siteOrigin: store.siteOrigin, binding: payments.binding, settings, coupons: store.services.coupons === 'on', ship: store.services.ship === 'on' }),
            note: payments.binding.ready ? undefined : 'Payments says this account still needs attention, so checkouts may be refused until it is finished in the Payments plugin.',
          } : { siteId, error: SETTINGS_ERROR.forbidden };
        }
      }
    }
    if (form.get('action') === 'store_key' && siteId) {
      // The key is shown on this response only; it is never stored or put in a URL.
      const key = await replaceStoreKey(env.MERCHANT_DB, owner);
      if (key) newKey = { siteId, key };
    }
    if (!newKey && !shown) return seeOther(await homeFor(siteId));
  }
  const readMembership = await authorizeOrganization(env.MERCHANT_DB, merchant.userId, merchant.organizationId);
  if (!readMembership || (readMembership.role !== 'owner' && !readMembership.permissions.includes('site:view'))) return new Response(null, { status: 403 });
  const activeBindings = await listActiveBindings(env.MERCHANT_DB, merchant.subject);
  const grants = await listServiceGrants(env.MERCHANT_DB, merchant.subject);
  const stores = await listStoreSetup(env.MERCHANT_DB, merchant.subject);
  const saved = new Map(await Promise.all(stores.map(async store => [store.siteId, await loadCommerceSettings(env.MERCHANT_DB, store.siteId)] as const)));
  const organizationId = input.url.searchParams.get('organization_id') ?? merchant.organizationId;
  if (organizationId !== merchant.organizationId) return new Response(JSON.stringify({ error: 'stale_organization' }), { status: 409 });
  if (!await authorizeOrganization(env.MERCHANT_DB, merchant.userId, organizationId)) return new Response(JSON.stringify({ error: 'organization_forbidden' }), { status: 403 });
  const activeSiteIds = new Set(activeBindings.map(binding => binding.siteId));
  const archivedStores = stores.filter(store => !activeSiteIds.has(store.siteId));
  const focusId = newKey?.siteId ?? shown?.siteId ?? null;
  const showingArchive = focusId ? !activeSiteIds.has(focusId) : input.view === 'archive';
  return {
    showingArchive,
    businessName: readMembership.name,
    visibleBindings: showingArchive ? grants.filter(binding => !activeSiteIds.has(binding.siteId)) : activeBindings,
    visibleStores: showingArchive ? archivedStores : stores.filter(store => activeSiteIds.has(store.siteId)),
    showArchiveLink: !showingArchive && archivedStores.length > 0,
    isOwner: readMembership.role === 'owner',
    formAction: showingArchive ? '/account/sites/archive' : '/account/sites',
    organizationId,
    newKey,
    shown,
    changedSite: input.url.searchParams.get('changed'),
    saved,
  };
}
