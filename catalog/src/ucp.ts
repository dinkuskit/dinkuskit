import type { FeedPolicy } from './feed.ts';
import type { StoredVariant } from './sync.ts';

/** Catalog rows in UCP's product shape (UCP catalog capability 2026-08-25). */
export const UCP_VERSION = '2026-08-25';
export const SEARCH_CAPABILITY = 'dev.ucp.shopping.catalog.search';
export const LOOKUP_CAPABILITY = 'dev.ucp.shopping.catalog.lookup';

export type OfferRow = {
  offer_id: string; upid: string; upid_basis: string; site_id: string; store_product_id: string;
  title: string; description: string; url: string; brand: string | null; gtin: string | null; mpn: string | null;
  images: string; options: string; variants: string; highlights: string;
  price_min: number; price_max: number; currency: string; sellable: number; updated_at: number;
  site_origin: string; store_name: string; policies: string;
  category_id: string | null; category_name: string | null;
};

export type UcpVariant = {
  id: string; title: string; description: { plain: string }; url: string;
  price: { amount: number; currency: string };
  availability: { available: boolean };
  options: { name: string; label: string }[];
  seller: { id: string; name: string; domain: string; url: string; links: FeedPolicy[] };
  inputs?: { id: string; match: 'exact' | 'featured' }[];
};
export type UcpProduct = {
  id: string; title: string; description: { plain: string }; url: string;
  categories?: { value: string; taxonomy: string }[];
  price_range: { min: { amount: number; currency: string }; max: { amount: number; currency: string } };
  media: { type: 'image'; url: string; alt_text: string }[];
  options: { name: string; values: { label: string; available?: boolean; exists?: boolean }[] }[];
  variants: UcpVariant[];
  selected?: { name: string; label: string }[];
  metadata: Record<string, unknown>;
};

export const envelope = (capability: string, status?: 'error') => ({
  version: UCP_VERSION,
  ...(status ? { status } : {}),
  capabilities: { [capability]: [{ version: UCP_VERSION }] },
});

const parse = <T>(text: string, fallback: T): T => { try { return JSON.parse(text) as T; } catch { return fallback; } };

function offerVariants(row: OfferRow): UcpVariant[] {
  const seller = {
    id: row.site_id, name: row.store_name, domain: new URL(row.site_origin).hostname, url: row.site_origin,
    links: parse<FeedPolicy[]>(row.policies, []),
  };
  return parse<StoredVariant[]>(row.variants, []).map(variant => ({
    id: variant.id, title: variant.title, description: { plain: variant.title }, url: row.url,
    price: { amount: variant.priceMinor, currency: row.currency },
    availability: { available: variant.sellable },
    options: variant.options, seller,
  }));
}

/**
 * One product from the rows that share its universal id. The first row supplies the
 * words and pictures; every row supplies its store's offers, so one product can list
 * several sellers. `availableOnly` leaves out variants that cannot be bought now.
 */
export function toProduct(rows: OfferRow[], availableOnly: boolean): UcpProduct | null {
  const lead = rows[0];
  if (!lead) return null;
  const variants = rows.flatMap(offerVariants).filter(variant => !availableOnly || variant.availability.available);
  if (!variants.length) return null;
  const prices = variants.map(variant => variant.price.amount);
  const options: UcpProduct['options'] = [];
  for (const row of rows) for (const option of parse<{ name: string; values: string[] }[]>(row.options, [])) {
    const known = options.find(item => item.name === option.name) ?? options[options.push({ name: option.name, values: [] }) - 1]!;
    for (const label of option.values) if (!known.values.some(value => value.label === label)) known.values.push({ label });
  }
  const sellers = new Set(rows.map(row => row.site_id));
  return {
    id: lead.upid, title: lead.title, description: { plain: lead.description }, url: lead.url,
    ...(lead.category_id ? { categories: [{ value: lead.category_id, taxonomy: 'shopify' }] } : {}),
    price_range: { min: { amount: Math.min(...prices), currency: lead.currency }, max: { amount: Math.max(...prices), currency: lead.currency } },
    media: parse<string[]>(lead.images, []).map(url => ({ type: 'image' as const, url, alt_text: lead.title })),
    options, variants,
    metadata: {
      ...(lead.brand ? { brand: lead.brand } : {}),
      ...(lead.gtin ? { gtin: lead.gtin } : {}),
      ...(lead.mpn ? { mpn: lead.mpn } : {}),
      ...(parse<string[]>(lead.highlights, []).length ? { highlights: parse<string[]>(lead.highlights, []) } : {}),
      // The category is worked out by the catalog from the product's words and picture, not set by the store.
      ...(lead.category_id && lead.category_name ? { category: { id: lead.category_id, name: lead.category_name, inferred: true } } : {}),
      seller_count: sellers.size,
      // Words and pictures come from each store and are not checked by DinkusKit.
      content_trust: 'untrusted_merchant_content',
    },
  };
}

/** `get_product`: marks each option value as existing and buyable given the chosen options, relaxing from the end of `preferences`. */
export function narrowProduct(product: UcpProduct, selected: { name: string; label: string }[], preferences: string[]): UcpProduct {
  const matches = (variant: UcpVariant, picks: { name: string; label: string }[]) =>
    picks.every(pick => variant.options.some(option => option.name === pick.name && option.label === pick.label));
  let picks = selected.filter(pick => product.options.some(option => option.name === pick.name));
  const order = [...preferences.filter(name => picks.some(pick => pick.name === name)), ...picks.map(pick => pick.name).filter(name => !preferences.includes(name))];
  while (picks.length && !product.variants.some(variant => matches(variant, picks))) {
    const drop = order.pop();
    picks = picks.filter(pick => pick.name !== drop);
  }
  const options = product.options.map(option => ({
    name: option.name,
    values: option.values.map(value => {
      const others = picks.filter(pick => pick.name !== option.name);
      const candidates = product.variants.filter(variant => matches(variant, [...others, { name: option.name, label: value.label }]));
      return { label: value.label, exists: candidates.length > 0, available: candidates.some(variant => variant.availability.available) };
    }),
  }));
  return { ...product, options, selected: picks, variants: product.variants.filter(variant => matches(variant, picks)) };
}
