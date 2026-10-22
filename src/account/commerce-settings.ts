import { shipRecipient, shipDestination, type ShipSandboxRegistration } from './ship-recipient.ts';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { ACCOUNT_ISSUER, COMMERCE_SETTINGS_PASS, COUPONS_ORIGIN, PAYMENTS_ORIGIN, STORE_PASS_SERVICES } from './config.ts';
import { prepareServiceAccess } from './jwt.ts';
import { listPublicJwks, persistPublicJwk } from './store.ts';
import { listStoreSetup } from './store-passes.ts';

/**
 * The checkout settings Set up Commerce gives the owner to paste into Commerce's
 * installedCheckout setting. The shape is Commerce's registry-checkout/v1 schema,
 * which refuses any missing, extra or malformed key.
 */
export const CHECKOUT_SETTINGS_SCHEMA = 'dinkuskit.commerce.registry-checkout/v1';
export const CHECKOUT_PRICING_SCHEMA = 'dinkuskit.commerce.checkout-pricing/v1';
const STATUS_TIMEOUT_MS = 5_000;
const STATUS_MAX_BYTES = 16_384;
const now = () => Math.floor(Date.now() / 1000);
const audience = (service: 'payments' | 'coupons' | 'ship') => STORE_PASS_SERVICES.find(s => s.service === service)!.audience;

export type CommerceChoices = { shippingMode: 'free' | 'flat'; shippingMinor: number; live: boolean };
export type CommerceSettings = CommerceChoices & { shippingRevision: number };

export async function loadCommerceSettings(db: D1Database, siteId: string): Promise<CommerceSettings | null> {
  const row = await db.prepare('SELECT shipping_mode, shipping_minor, shipping_revision, live FROM dinkuskit_commerce_settings WHERE site_id = ?')
    .bind(siteId).first<{ shipping_mode: 'free' | 'flat'; shipping_minor: number; shipping_revision: number; live: number }>();
  return row ? { shippingMode: row.shipping_mode, shippingMinor: Number(row.shipping_minor), shippingRevision: Number(row.shipping_revision), live: Number(row.live) === 1 } : null;
}

/**
 * Saves the owner's choices for a store. The shipping revision goes up only when the
 * charge changes. Returns null unless the actor is the active owner of the store's business.
 */
export async function saveCommerceSettings(db: D1Database, input: {
  subject: string; siteId: string; organizationId: string; actorUserId: string; choices: CommerceChoices;
}): Promise<CommerceSettings | null> {
  const { shippingMode, live } = input.choices;
  const shippingMinor = shippingMode === 'free' ? 0 : input.choices.shippingMinor;
  if ((shippingMode !== 'free' && shippingMode !== 'flat') || !Number.isSafeInteger(shippingMinor) || shippingMinor < 0 || shippingMinor > 100_000_00) return null;
  const result = await db.prepare(`INSERT INTO dinkuskit_commerce_settings
      (site_id, shipping_mode, shipping_minor, shipping_revision, live, updated_by_user_id, updated_at)
    SELECT ?, ?, ?, 1, ?, ?, ? WHERE EXISTS (SELECT 1 FROM dinkuskit_store_identity i WHERE i.site_id = ? AND i.account_subject = ?)
      AND EXISTS (SELECT 1 FROM dinkuskit_membership m JOIN dinkuskit_account a ON a.user_id = m.user_id
        JOIN dinkuskit_organization o ON o.organization_id = m.organization_id
        JOIN dinkuskit_user_selection s ON s.user_id = m.user_id AND s.organization_id = m.organization_id
        WHERE m.organization_id = ? AND m.user_id = ? AND m.role = 'owner' AND m.status = 'active'
          AND a.disabled = 0 AND o.status = 'active' AND o.authority_subject = ?)
    ON CONFLICT(site_id) DO UPDATE SET
      shipping_revision = dinkuskit_commerce_settings.shipping_revision
        + (dinkuskit_commerce_settings.shipping_mode IS NOT excluded.shipping_mode OR dinkuskit_commerce_settings.shipping_minor IS NOT excluded.shipping_minor),
      shipping_mode = excluded.shipping_mode, shipping_minor = excluded.shipping_minor, live = excluded.live,
      updated_by_user_id = excluded.updated_by_user_id, updated_at = excluded.updated_at`)
    .bind(input.siteId, shippingMode, shippingMinor, live ? 1 : 0, input.actorUserId, now(),
      input.siteId, input.subject, input.organizationId, input.actorUserId, input.subject).run() as { meta?: { changes?: number } };
  if ((result.meta?.changes ?? 0) === 0) return null;
  return loadCommerceSettings(db, input.siteId);
}

export type PaymentsBinding =
  | { providerId: 'stripe'; bindingRef: string; stripeAccountId: string; ready: boolean }
  | { providerId: 'authorize_net'; bindingRef: string; ready: boolean };
export type PaymentsStatusFetch = (input: { url: string; token: string; siteId: string }) => Promise<{ status: number; body: unknown }>;
export type PaymentsBindingResult =
  | { ok: true; binding: PaymentsBinding }
  | { ok: false; reason: 'payments_not_connected' | 'payments_not_set_up' | 'payments_unreachable' | 'signing_unavailable' };

/** Reads the store's Payments account from Payments' own status, with a payments:admin pass this site signs. */
async function fetchPaymentsStatus(input: { url: string; token: string; siteId: string }): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);
  try {
    const response = await fetch(input.url, {
      method: 'GET', redirect: 'manual', signal: controller.signal,
      headers: { authorization: `Bearer ${input.token}`, 'x-dinkus-site': input.siteId, accept: 'application/json' },
    });
    const text = await response.text();
    if (text.length > STATUS_MAX_BYTES) throw new Error('payments_status_too_large');
    return { status: response.status, body: JSON.parse(text) };
  } finally {
    clearTimeout(timer);
  }
}

export async function readPaymentsBinding(input: {
  db: D1Database; subject: string; siteId: string; privateJwkJson?: string; fetchStatus?: PaymentsStatusFetch;
}): Promise<PaymentsBindingResult> {
  const grant = await input.db.prepare(`SELECT g.revoked FROM dinkuskit_service_grant g JOIN dinkuskit_store_identity i ON i.site_id = g.site_id
    WHERE g.site_id = ? AND g.service = 'payments' AND i.account_subject = ?`).bind(input.siteId, input.subject).first<{ revoked: number }>();
  if (!grant || grant.revoked !== 0) return { ok: false, reason: 'payments_not_connected' };
  const pass = await prepareServiceAccess({ subject: input.subject, siteId: input.siteId, service: 'payments', privateJwkJson: input.privateJwkJson, backdateSeconds: 2 });
  if (!pass.ok) return { ok: false, reason: 'signing_unavailable' };
  await persistPublicJwk(input.db, pass.kid, pass.publicJwk);
  let answer: { status: number; body: unknown };
  try {
    answer = await (input.fetchStatus ?? fetchPaymentsStatus)({ url: `${PAYMENTS_ORIGIN}/v1/status`, token: pass.token, siteId: input.siteId });
  } catch {
    return { ok: false, reason: 'payments_unreachable' };
  }
  if (answer.status !== 200 || !answer.body || typeof answer.body !== 'object') return { ok: false, reason: 'payments_unreachable' };
  const status = answer.body as Record<string, unknown>;
  const evidence = status.connectionEvidence as Record<string, unknown> | undefined;
  const bindingRef = status.bindingRef;
  if (typeof bindingRef !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(bindingRef) || !evidence || typeof evidence !== 'object') {
    return { ok: false, reason: 'payments_not_set_up' };
  }
  const ready = status.state === 'ready';
  if (evidence.provider === 'stripe' && typeof evidence.accountRef === 'string' && /^acct_[A-Za-z0-9]{1,200}$/.test(evidence.accountRef)) {
    return { ok: true, binding: { providerId: 'stripe', bindingRef, stripeAccountId: evidence.accountRef, ready } };
  }
  if (evidence.provider === 'authorize_net') return { ok: true, binding: { providerId: 'authorize_net', bindingRef, ready } };
  return { ok: false, reason: 'payments_not_set_up' };
}

/** The exact JSON text for Commerce's installedCheckout setting. Coupons and Ship appear only while on. */
export function checkoutSettingsJson(input: {
  siteId: string; siteOrigin: string; binding: PaymentsBinding; settings: CommerceSettings; coupons: boolean; ship: boolean; registration?: ShipSandboxRegistration;
}): string {
  const { binding, settings } = input;
  const recipient = shipRecipient(input.siteId, input.registration);
  if (recipient && settings.live) throw new Error('ship_test_required');
  const value = {
    schema: CHECKOUT_SETTINGS_SCHEMA,
    enabled: true,
    commerceOrigin: input.siteOrigin,
    siteId: input.siteId,
    issuer: ACCOUNT_ISSUER,
    paymentsOrigin: PAYMENTS_ORIGIN,
    audience: audience('payments'),
    bindingRef: binding.bindingRef,
    providerId: binding.providerId,
    ...(binding.providerId === 'stripe' ? { stripeAccountId: binding.stripeAccountId } : {}),
    mode: settings.live ? 'live' : 'test',
    pricingSchema: CHECKOUT_PRICING_SCHEMA,
    shipping: {
      configurationId: `shipping-${input.siteId}`,
      revision: settings.shippingRevision,
      mode: settings.shippingMode,
      ...(settings.shippingMode === 'flat' ? { amount: { currency: 'USD', minor: String(settings.shippingMinor) } } : {}),
    },
    ...(input.coupons ? { coupons: { origin: COUPONS_ORIGIN, audience: audience('coupons') } } : {}),
    ...(input.ship ? { ship: shipDestination(recipient) } : {}),
  };
  return JSON.stringify(value, null, 2);
}

/** Parses a dollar amount such as "5" or "5.00" into cents; null if it is not a plain amount. */
export function dollarsToMinor(text: string): number | null {
  const match = /^\s*\$?(\d{1,6})(?:\.(\d{1,2}))?\s*$/.exec(text);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '0').padEnd(2, '0'));
}

function answer(status: number, body: string): Response {
  return new Response(body, { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

/**
 * GET /api/commerce-settings: the checkout settings Commerce used to have pasted, read by
 * Commerce itself with a 5-minute commerce:settings pass from its own store key
 * (store-connect-checkout-settings-083). The answer is the same registry-checkout/v1 JSON,
 * so Commerce checks it exactly as it checked a paste, including that it names its own site.
 */
export async function serveCommerceSettings(input: {
  db: D1Database; authorization: string | null; privateJwkJson?: string; registration?: ShipSandboxRegistration; fetchStatus?: PaymentsStatusFetch;
}): Promise<Response> {
  const refuse = (status: number, error: string) => answer(status, JSON.stringify({ error }));
  const token = input.authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token) return refuse(401, 'invalid_pass');
  let siteId: string, subject: string;
  try {
    const { payload } = await jwtVerify(token, createLocalJWKSet(await listPublicJwks(input.db) as Parameters<typeof createLocalJWKSet>[0]), {
      issuer: ACCOUNT_ISSUER, audience: COMMERCE_SETTINGS_PASS.audience, algorithms: ['ES256'], requiredClaims: ['exp', 'iat', 'sub'],
    });
    if (typeof payload.scope !== 'string' || !payload.scope.split(' ').includes(COMMERCE_SETTINGS_PASS.scope) || typeof payload.site_id !== 'string') throw new Error('scope');
    siteId = payload.site_id;
    subject = payload.sub!;
  } catch {
    return refuse(401, 'invalid_pass');
  }
  const store = (await listStoreSetup(input.db, subject)).find(row => row.siteId === siteId);
  if (!store) return refuse(401, 'invalid_pass');
  const settings = await loadCommerceSettings(input.db, siteId);
  if (!settings) return refuse(409, 'commerce_not_set_up');
  const payments = await readPaymentsBinding({ db: input.db, subject, siteId, privateJwkJson: input.privateJwkJson, fetchStatus: input.fetchStatus });
  if (!payments.ok) return refuse(payments.reason === 'signing_unavailable' || payments.reason === 'payments_unreachable' ? 503 : 409, payments.reason);
  try {
    return answer(200, checkoutSettingsJson({
      registration: input.registration, siteId, siteOrigin: store.siteOrigin, binding: payments.binding, settings,
      coupons: store.services.coupons === 'on', ship: store.services.ship === 'on',
    }));
  } catch {
    return refuse(409, 'ship_test_required');
  }
}
