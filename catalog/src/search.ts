import { toProduct, type OfferRow, type UcpProduct } from './ucp.ts';

/**
 * Finding products (GrillTrack agent-catalog-ranking-20261113): best match first,
 * only products that can be bought now unless the agent asks otherwise, no paid
 * placement and no cap per store.
 */
export const DEFAULT_LIMIT = 10, MAX_LIMIT = 50, MAX_DEPTH = 1000, MAX_LOOKUP_IDS = 50;

const OFFER_COLUMNS = `o.offer_id, o.upid, o.upid_basis, o.site_id, o.store_product_id, o.title, o.description, o.url, o.brand, o.gtin, o.mpn,
  o.images, o.options, o.variants, o.highlights, o.price_min, o.price_max, o.currency, o.sellable, o.updated_at,
  s.site_origin, s.store_name, s.policies`;

export type SearchInput = {
  query?: string;
  available: boolean;
  priceMin?: number;
  priceMax?: number;
  shops?: string[];
  limit: number;
  offset: number;
};
export type SearchOutput = { products: UcpProduct[]; hasNextPage: boolean; nextOffset: number; totalCount: number };

/** Words from the shopper's request as a full-text query; nothing they type reaches the query language. */
export function matchExpression(query: string): string | null {
  const words = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [])].slice(0, 12);
  return words.length ? words.map(word => `"${word}"`).join(' OR ') : null;
}

async function rowsForUpids(db: D1Database, upids: string[]): Promise<Map<string, OfferRow[]>> {
  const grouped = new Map<string, OfferRow[]>();
  if (!upids.length) return grouped;
  const rows = await db.prepare(`SELECT ${OFFER_COLUMNS} FROM catalog_offer o JOIN catalog_store s ON s.site_id = o.site_id
    WHERE o.upid IN (${upids.map(() => '?').join(',')}) ORDER BY o.price_min, o.offer_id`).bind(...upids).all<OfferRow>();
  for (const row of rows.results ?? []) grouped.set(row.upid, [...(grouped.get(row.upid) ?? []), row]);
  return grouped;
}

export async function searchCatalog(db: D1Database, input: SearchInput): Promise<SearchOutput> {
  const where: string[] = [], values: unknown[] = [];
  const match = input.query ? matchExpression(input.query) : null;
  if (input.query && !match) return { products: [], hasNextPage: false, nextOffset: input.offset, totalCount: 0 };
  if (input.available) where.push('o.sellable = 1');
  if (input.priceMin !== undefined) { where.push('o.price_max >= ?'); values.push(input.priceMin); }
  if (input.priceMax !== undefined) { where.push('o.price_min <= ?'); values.push(input.priceMax); }
  if (input.shops?.length) { where.push(`o.site_id IN (${input.shops.map(() => '?').join(',')})`); values.push(...input.shops); }
  const filter = where.length ? `AND ${where.join(' AND ')}` : '';
  // The title counts most, then the brand, then the description.
  const ranked = match
    ? `SELECT o.upid AS upid, MIN(hit.score) AS score
        FROM (SELECT offer_id, bm25(catalog_text, 0.0, 8.0, 4.0, 1.0) AS score FROM catalog_text WHERE catalog_text MATCH ? LIMIT 5000) hit
        JOIN catalog_offer o ON o.offer_id = hit.offer_id
        WHERE 1 = 1 ${filter} GROUP BY o.upid ORDER BY score, o.upid`
    : `SELECT o.upid AS upid, MAX(o.updated_at) AS score FROM catalog_offer o WHERE 1 = 1 ${filter} GROUP BY o.upid ORDER BY score DESC, o.upid`;
  const bound = match ? [match, ...values] : values;
  const count = await db.prepare(`SELECT COUNT(*) AS total FROM (${ranked})`).bind(...bound).first<{ total: number }>();
  const page = await db.prepare(`${ranked} LIMIT ? OFFSET ?`).bind(...bound, input.limit + 1, input.offset).all<{ upid: string }>();
  const upids = (page.results ?? []).map(row => row.upid);
  const grouped = await rowsForUpids(db, upids.slice(0, input.limit));
  const products = upids.slice(0, input.limit).flatMap(upid => toProduct(grouped.get(upid) ?? [], input.available) ?? []);
  const nextOffset = input.offset + input.limit;
  return { products, hasNextPage: upids.length > input.limit && nextOffset < MAX_DEPTH, nextOffset, totalCount: count?.total ?? 0 };
}

export type LookupOutput = { products: UcpProduct[]; notFound: string[] };

/** Products for universal product ids, variant ids, or a listed store's product page address. */
export async function lookupCatalog(db: D1Database, ids: string[], available: boolean): Promise<LookupOutput> {
  const wanted = new Map<string, { id: string; match: 'exact' | 'featured' }[]>(), notFound: string[] = [], order: string[] = [];
  const note = (upid: string, id: string, match: 'exact' | 'featured') => {
    if (!wanted.has(upid)) { wanted.set(upid, []); order.push(upid); }
    wanted.get(upid)!.push({ id, match });
  };
  for (const id of ids) {
    if (id.startsWith('dkp_')) {
      const row = await db.prepare('SELECT upid FROM catalog_offer WHERE upid = ? LIMIT 1').bind(id).first<{ upid: string }>();
      if (row) note(row.upid, id, 'featured'); else notFound.push(id);
    } else if (id.startsWith('dkv_')) {
      const row = await db.prepare('SELECT o.upid FROM catalog_variant v JOIN catalog_offer o ON o.offer_id = v.offer_id WHERE v.variant_id = ?')
        .bind(id).first<{ upid: string }>();
      if (row) note(row.upid, id, 'exact'); else notFound.push(id);
    } else if (/^https:\/\//.test(id)) {
      const row = await db.prepare('SELECT upid FROM catalog_offer WHERE url = ? LIMIT 1').bind(id.split(/[?#]/)[0]).first<{ upid: string }>();
      if (row) note(row.upid, id, 'featured'); else notFound.push(id);
    } else notFound.push(id);
  }
  const grouped = await rowsForUpids(db, order);
  const products: UcpProduct[] = [];
  for (const upid of order) {
    const product = toProduct(grouped.get(upid) ?? [], available);
    const inputs = wanted.get(upid) ?? [];
    if (!product) { notFound.push(...inputs.map(input => input.id)); continue; }
    const exact = new Set(inputs.filter(input => input.match === 'exact').map(input => input.id));
    const featured = inputs.filter(input => input.match === 'featured');
    const lead = product.variants.find(variant => variant.availability.available) ?? product.variants[0];
    product.variants = product.variants.map(variant => {
      const own = [
        ...(exact.has(variant.id) ? [{ id: variant.id, match: 'exact' as const }] : []),
        ...(variant === lead ? featured : []),
      ];
      return own.length ? { ...variant, inputs: own } : variant;
    }).filter(variant => !exact.size || featured.length || variant.inputs);
    products.push(product);
  }
  return { products, notFound };
}
