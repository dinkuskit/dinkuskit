import { FEED_PATH, parseAgentCatalogFeed, type ParsedFeed } from './feed.ts';
import { offerId, universalProductId, variantId } from './ids.ts';
import { forgetStore, indexStore, type Meaning } from './meaning.ts';

/**
 * Keeps the catalog in step with each listed store (GrillTrack
 * agent-catalog-freshness-20261113): every listed store's feed is re-read on a
 * short timer, and a store whose feed has not been read and found valid within
 * FRESH_SECONDS leaves the catalog, so a price or availability here is never more
 * than 10 minutes old, whether a store went quiet or the timer itself stopped.
 */
export const REFRESH_SECONDS = 300, FRESH_SECONDS = 600;
const FEED_TIMEOUT_MS = 10_000, FEED_MAX_BYTES = 8 * 1024 * 1024;
/** Full product detail re-reads a store's feed unless it was read this recently; at most this many stores, each given this long. */
export const LIVE_SECONDS = 30;
const LIVE_STORES = 8, LIVE_TIMEOUT_MS = 3000;

export type ListedStore = { siteId: string; siteOrigin: string };
export type StoredVariant = {
  id: string; storeItemId: string; title: string; options: { name: string; label: string }[]; priceMinor: number; sellable: boolean;
};

async function sha256(text: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Writes one store's feed over what the catalog held for that store. */
export async function storeFeed(db: D1Database, store: ListedStore, feed: ParsedFeed, feedHash: string, now: number): Promise<number> {
  const statements: D1PreparedStatement[] = [
    db.prepare(`INSERT INTO catalog_store (site_id, site_origin, store_name, policies, feed_hash, read_at, validated_at, changed_at, last_error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(site_id) DO UPDATE SET site_origin = excluded.site_origin, store_name = excluded.store_name,
        policies = excluded.policies, feed_hash = excluded.feed_hash, read_at = excluded.read_at,
        validated_at = excluded.validated_at, changed_at = excluded.changed_at, last_error = NULL`)
      .bind(store.siteId, store.siteOrigin, feed.storeName, JSON.stringify(feed.policies), feedHash, now, now, now),
    db.prepare('DELETE FROM catalog_text WHERE offer_id IN (SELECT offer_id FROM catalog_offer WHERE site_id = ?)').bind(store.siteId),
    db.prepare('DELETE FROM catalog_variant WHERE offer_id IN (SELECT offer_id FROM catalog_offer WHERE site_id = ?)').bind(store.siteId),
    db.prepare('DELETE FROM catalog_offer WHERE site_id = ?').bind(store.siteId),
  ];
  for (const offer of feed.offers) {
    const id = offerId(store.siteId, offer.storeProductId);
    const { upid, basis } = await universalProductId({ ...offer, siteId: store.siteId });
    const variants: StoredVariant[] = [];
    for (const variant of offer.variants) variants.push({ ...variant, id: await variantId(store.siteId, variant.storeItemId) });
    const prices = variants.map(variant => variant.priceMinor);
    statements.push(
      db.prepare(`INSERT INTO catalog_offer (offer_id, upid, upid_basis, site_id, store_product_id, title, description, url, brand, gtin, mpn,
          images, options, variants, highlights, price_min, price_max, currency, sellable, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, upid, basis, store.siteId, offer.storeProductId, offer.title, offer.description, offer.url, offer.brand, offer.gtin, offer.mpn,
          JSON.stringify(offer.images), JSON.stringify(offer.options), JSON.stringify(variants), JSON.stringify(offer.highlights),
          Math.min(...prices), Math.max(...prices), offer.currency, variants.some(variant => variant.sellable) ? 1 : 0, now),
      db.prepare('INSERT INTO catalog_text (offer_id, title, brand, body) VALUES (?, ?, ?, ?)')
        .bind(id, offer.title, offer.brand ?? '', [offer.description, ...offer.highlights, ...offer.options.flatMap(option => option.values)].join(' ')),
      ...variants.map(variant => db.prepare('INSERT OR REPLACE INTO catalog_variant (variant_id, offer_id) VALUES (?, ?)').bind(variant.id, id)),
    );
  }
  await db.batch(statements);
  return feed.offers.length;
}

/** A store that is no longer listed leaves the catalog at once. */
export async function removeStore(db: D1Database, siteId: string): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM catalog_text WHERE offer_id IN (SELECT offer_id FROM catalog_offer WHERE site_id = ?)').bind(siteId),
    db.prepare('DELETE FROM catalog_variant WHERE offer_id IN (SELECT offer_id FROM catalog_offer WHERE site_id = ?)').bind(siteId),
    db.prepare('DELETE FROM catalog_offer WHERE site_id = ?').bind(siteId),
    db.prepare('DELETE FROM catalog_store WHERE site_id = ?').bind(siteId),
  ]);
}

export type RefreshResult = { siteId: string; outcome: 'updated' | 'unchanged' | 'failed'; products?: number; error?: string };

/**
 * Stores whose feed has not been read and found valid within FRESH_SECONDS leave the
 * catalog. Run before every answer, so nothing older is ever shown; the store returns
 * with its next good read.
 */
export async function expireStale(db: D1Database, now: number, meaning?: Meaning): Promise<string[]> {
  const stale = await db.prepare('SELECT site_id FROM catalog_store WHERE validated_at IS NULL OR validated_at < ?')
    .bind(now - FRESH_SECONDS).all<{ site_id: string }>();
  const gone = (stale.results ?? []).map(row => row.site_id);
  for (const siteId of gone) {
    await removeStore(db, siteId);
    if (meaning) await forgetStore(db, meaning, siteId).catch(() => undefined);
  }
  return gone;
}

/**
 * Reads one store's feed. A store that cannot be read keeps its last good products, for
 * at most FRESH_SECONDS since its last good read, and records why.
 */
export async function refreshStore(db: D1Database, store: ListedStore, fetcher: typeof fetch, now: number, timeoutMs = FEED_TIMEOUT_MS): Promise<RefreshResult> {
  const fail = async (error: string): Promise<RefreshResult> => {
    await db.prepare(`INSERT INTO catalog_store (site_id, site_origin, store_name, read_at, last_error) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(site_id) DO UPDATE SET read_at = excluded.read_at, last_error = excluded.last_error`)
      .bind(store.siteId, store.siteOrigin, new URL(store.siteOrigin).hostname, now, error).run();
    return { siteId: store.siteId, outcome: 'failed', error };
  };
  let text: string;
  try {
    const response = await fetcher(`${store.siteOrigin}${FEED_PATH}`, {
      headers: { accept: 'application/json', 'user-agent': 'DinkusKitCatalog/1.0 (+https://catalog.dinkuskit.com)' },
      // A feed that moved is not followed: the answer is then not `ok` and the read fails. (Workers has no redirect: 'error'.)
      redirect: 'manual', signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return fail(`feed_status_${response.status}`);
    text = await response.text();
  } catch {
    return fail('feed_unreachable');
  }
  if (text.length > FEED_MAX_BYTES) return fail('feed_too_large');
  const feedHash = await sha256(text);
  const known = await db.prepare('SELECT feed_hash FROM catalog_store WHERE site_id = ? AND site_origin = ?')
    .bind(store.siteId, store.siteOrigin).first<{ feed_hash: string | null }>();
  if (known?.feed_hash === feedHash) {
    await db.prepare('UPDATE catalog_store SET read_at = ?, validated_at = ?, last_error = NULL WHERE site_id = ?').bind(now, now, store.siteId).run();
    return { siteId: store.siteId, outcome: 'unchanged' };
  }
  let body: unknown;
  try { body = JSON.parse(text); } catch { return fail('feed_not_json'); }
  const feed = parseAgentCatalogFeed(body, store.siteOrigin);
  if ('error' in feed) return fail(feed.error);
  return { siteId: store.siteId, outcome: 'updated', products: await storeFeed(db, store, feed, feedHash, now) };
}

/** One pass over every listed store; stores that left the list are removed. With `meaning`, search vectors and categories follow. */
export async function refreshCatalog(db: D1Database, listed: ListedStore[], fetcher: typeof fetch, now: number, meaning?: Meaning): Promise<RefreshResult[]> {
  const held = await db.prepare('SELECT site_id FROM catalog_store').all<{ site_id: string }>();
  const keep = new Set(listed.map(store => store.siteId));
  for (const row of held.results ?? []) {
    if (keep.has(row.site_id)) continue;
    await removeStore(db, row.site_id);
    if (meaning) await forgetStore(db, meaning, row.site_id).catch(() => undefined);
  }
  const results: RefreshResult[] = [];
  for (const store of listed) {
    const result = await refreshStore(db, store, fetcher, now);
    // A product that could not get its vector this time is tried again on the next pass; word search already has it.
    if (meaning && result.outcome !== 'failed') await indexStore(db, meaning, store.siteId, fetcher).catch(() => undefined);
    results.push(result);
  }
  await expireStale(db, now, meaning);
  return results;
}

/**
 * The check behind full product detail: each store selling the product is looked up
 * again in the list of listed stores and its feed read again, unless it was read within
 * LIVE_SECONDS. A store that is no longer listed leaves at once; one that cannot be read
 * keeps its last good products until they expire.
 */
export async function recheckStores(db: D1Database, listed: ListedStore[], siteIds: string[], fetcher: typeof fetch, now: number): Promise<void> {
  const wanted = [...new Set(siteIds)].slice(0, LIVE_STORES);
  if (!wanted.length) return;
  const held = await db.prepare(`SELECT site_id, validated_at FROM catalog_store WHERE site_id IN (${wanted.map(() => '?').join(',')})`)
    .bind(...wanted).all<{ site_id: string; validated_at: number | null }>();
  const readAt = new Map((held.results ?? []).map(row => [row.site_id, row.validated_at ?? 0]));
  const stores = new Map(listed.map(store => [store.siteId, store]));
  await Promise.all(wanted.map(async siteId => {
    const store = stores.get(siteId);
    if (!store) return removeStore(db, siteId);
    if ((readAt.get(siteId) ?? 0) > now - LIVE_SECONDS) return;
    await refreshStore(db, store, fetcher, now, LIVE_TIMEOUT_MS);
  }));
}
