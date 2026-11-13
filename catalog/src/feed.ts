/**
 * Reads a store's public JSON catalog feed (`/feeds/agent-catalog.json`,
 * schema `dinkuskit.commerce.agent-catalog-feed/v1`) into the rows the catalog keeps.
 * Everything in a feed is the store's own words: it is checked, cut to size and
 * kept as plain text, never trusted.
 */
export const FEED_SCHEMA = 'dinkuskit.commerce.agent-catalog-feed/v1';
export const FEED_PATH = '/feeds/agent-catalog.json';
const MAX_PRODUCTS = 5000, MAX_VARIANTS = 250, MAX_IMAGES = 12;

export type FeedVariant = {
  storeItemId: string;
  title: string;
  options: { name: string; label: string }[];
  priceMinor: number;
  sellable: boolean;
};
export type FeedOffer = {
  storeProductId: string;
  title: string;
  description: string;
  url: string;
  brand: string | null;
  gtin: string | null;
  mpn: string | null;
  images: string[];
  options: { name: string; values: string[] }[];
  variants: FeedVariant[];
  highlights: string[];
  currency: 'USD';
};
export type FeedPolicy = { type: string; url: string };
export type ParsedFeed = { storeName: string; siteOrigin: string; offers: FeedOffer[]; policies: FeedPolicy[]; skipped: number };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Plain text only: tags and control characters removed, whitespace folded, cut to a limit. */
export function plainText(value: unknown, limit: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

/** An https address on the store's own site, or null. */
function ownUrl(value: unknown, origin: string): string | null {
  if (typeof value !== 'string' || value.length > 2000) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === origin && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function httpsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2000) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function minor(value: unknown): number | null {
  if (!isRecord(value) || value.currency !== 'USD' || typeof value.minor !== 'string' || !/^\d{1,10}$/.test(value.minor)) return null;
  return Number(value.minor);
}

const identifier = (value: unknown, pattern: RegExp): string | null => {
  const text = plainText(value, 80);
  return pattern.test(text) ? text : null;
};

function policyType(slug: string): string {
  if (slug.includes('return') || slug.includes('refund')) return 'refund_policy';
  if (slug.includes('shipping')) return 'shipping_policy';
  if (slug.includes('privacy')) return 'privacy_policy';
  if (slug.includes('terms')) return 'terms_of_service';
  return 'policy';
}

function readOffer(row: unknown, origin: string): FeedOffer | null {
  if (!isRecord(row)) return null;
  const storeProductId = plainText(row.id, 120), title = plainText(row.title, 300), url = ownUrl(row.canonicalUrl, origin);
  if (!storeProductId || !title || !url) return null;
  const sellable = isRecord(row.availability) && row.availability.sellable === true;
  const members = isRecord(row.variants) && Array.isArray(row.variants.members) ? row.variants.members.slice(0, MAX_VARIANTS) : [];
  const variants: FeedVariant[] = [];
  for (const member of members) {
    if (!isRecord(member)) continue;
    const storeItemId = plainText(member.catalogItemId, 120), priceMinor = minor(member.price);
    if (!storeItemId || priceMinor === null) continue;
    const options = (Array.isArray(member.selections) ? member.selections : []).flatMap(selection => {
      if (!isRecord(selection)) return [];
      const name = plainText(selection.optionLabel, 80), label = plainText(selection.valueLabel, 80);
      return name && label ? [{ name, label }] : [];
    });
    variants.push({
      storeItemId, priceMinor, options,
      title: options.map(option => option.label).join(' / ') || title,
      sellable: isRecord(member.availability) && member.availability.sellable === true,
    });
  }
  if (!variants.length) {
    const priceMinor = minor(row.price);
    if (priceMinor === null) return null;
    variants.push({ storeItemId: storeProductId, title, options: [], priceMinor, sellable });
  }
  const options: FeedOffer['options'] = [];
  for (const variant of variants) for (const option of variant.options) {
    const known = options.find(item => item.name === option.name);
    if (!known) options.push({ name: option.name, values: [option.label] });
    else if (!known.values.includes(option.label)) known.values.push(option.label);
  }
  const projection = isRecord(row.aiProjection) ? row.aiProjection : {};
  const highlights = (Array.isArray(projection.highlights) ? projection.highlights : [])
    .map(item => plainText(item, 200)).filter(Boolean).slice(0, 10);
  const summary = plainText(projection.summary, 600);
  return {
    storeProductId, title, url, options, variants, highlights, currency: 'USD',
    description: plainText(row.description, 4000) || summary,
    brand: plainText(row.brand, 120) || null,
    gtin: identifier(row.gtin, /^\d{8,14}$/),
    mpn: identifier(row.mpn, /^[A-Za-z0-9][A-Za-z0-9 ._\/-]{0,69}$/),
    images: (Array.isArray(row.imageUrls) ? row.imageUrls : []).flatMap(image => httpsUrl(image) ?? []).slice(0, MAX_IMAGES),
  };
}

/** The feed as rows, or a reason it was refused. `siteOrigin` is the address DinkusKit holds for the store. */
export function parseAgentCatalogFeed(body: unknown, siteOrigin: string): ParsedFeed | { error: string } {
  if (!isRecord(body) || body.schema !== FEED_SCHEMA) return { error: 'not_a_catalog_feed' };
  if (body.siteOrigin !== siteOrigin) return { error: 'feed_is_for_another_site' };
  if (!Array.isArray(body.products)) return { error: 'not_a_catalog_feed' };
  const offers: FeedOffer[] = [], seen = new Set<string>();
  let skipped = Math.max(0, body.products.length - MAX_PRODUCTS);
  for (const row of body.products.slice(0, MAX_PRODUCTS)) {
    const offer = readOffer(row, siteOrigin);
    if (!offer || seen.has(offer.storeProductId)) { skipped += 1; continue; }
    seen.add(offer.storeProductId);
    offers.push(offer);
  }
  const policies = (Array.isArray(body.policies) ? body.policies : []).flatMap(policy => {
    if (!isRecord(policy)) return [];
    const url = ownUrl(policy.url, siteOrigin), slug = plainText(policy.slug, 80).toLowerCase();
    return url && slug ? [{ type: policyType(slug), url }] : [];
  }).slice(0, 10);
  return { storeName: plainText(body.storeName, 120) || new URL(siteOrigin).hostname, siteOrigin, offers, policies, skipped };
}
