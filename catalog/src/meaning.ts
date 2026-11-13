/**
 * Search by meaning, by photo and by "similar to this", and each product's category
 * (GrillTrack agent-catalog-first-version-20261113). One vector per product holds its
 * words and first picture together, so a typed request and a photo are compared against
 * the same thing. All of it is optional: with no model or index bound the catalog still
 * answers by words.
 */
export const EMBEDDING_MODEL = '@cf/google/embeddinggemma-2';
export const VECTOR_DIMENSIONS = 768;
export const TAXONOMY = 'shopify';
const IMAGE_MAX_BYTES = 4 * 1024 * 1024, IMAGE_TIMEOUT_MS = 8000, VECTOR_BATCH = 50;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

export type Picture = { contentType: string; base64: string };
export type EmbedInput = { text?: string; picture?: Picture };
/** Turns words, a picture, or both into one vector each. */
export type Embedder = (inputs: EmbedInput[]) => Promise<number[][]>;
/** The part of a Vectorize index the catalog uses. */
export type VectorStore = {
  upsert(vectors: { id: string; values: number[]; metadata?: Record<string, string> }[]): Promise<unknown>;
  query(vector: number[], options: { topK: number; returnMetadata?: 'none' | 'all' }): Promise<{ matches: { id: string; score: number; metadata?: Record<string, unknown> }[] }>;
  getByIds(ids: string[]): Promise<{ id: string; values?: number[] | Float32Array | Float64Array }[]>;
  deleteByIds(ids: string[]): Promise<unknown>;
};
export type Meaning = { embed: Embedder; products: VectorStore; categories?: VectorStore };

type AiBinding = { run(model: string, input: unknown): Promise<unknown> };

/** Workers AI behind the catalog's embedder. */
export function workersAiEmbedder(ai: AiBinding): Embedder {
  return async inputs => {
    const messages = inputs.map(input => [{
      role: 'user',
      content: input.picture
        ? [
            ...(input.text ? [{ type: 'text', text: input.text }] : []),
            { type: 'image_url', image_url: { url: `data:${input.picture.contentType};base64,${input.picture.base64}` } },
          ]
        : input.text ?? '',
    }]);
    const response = await ai.run(EMBEDDING_MODEL, { messages }) as { data?: { embedding?: number[] }[] };
    const vectors = (response.data ?? []).map(row => row.embedding ?? []);
    if (vectors.length !== inputs.length || vectors.some(vector => vector.length !== VECTOR_DIMENSIONS)) throw new Error('embedding_failed');
    return vectors;
  };
}

export const queryText = (query: string) => `task: search result | query: ${query}`;
export const documentText = (title: string, body: string) => `title: ${title} | text: ${body}`.slice(0, 6000);

async function sha256(text: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** A product picture from the store, or nothing when it is missing, too big or not a picture. */
export async function fetchPicture(url: string, fetcher: typeof fetch): Promise<Picture | null> {
  try {
    const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
    const contentType = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
    if (!response.ok || !IMAGE_TYPES.has(contentType)) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > IMAGE_MAX_BYTES) return null;
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    return { contentType, base64: btoa(binary) };
  } catch {
    return null;
  }
}

type OfferWords = { offer_id: string; title: string; description: string; brand: string | null; highlights: string; images: string; options: string };

/**
 * Brings one store's search vectors in step with its products: new and reworded products
 * get a vector and a category, products that left lose theirs. Returns how many were worked out.
 */
export async function indexStore(db: D1Database, meaning: Meaning, siteId: string, fetcher: typeof fetch): Promise<number> {
  const offers = await db.prepare(`SELECT o.offer_id, o.title, o.description, o.brand, o.highlights, o.images, o.options, v.content_hash
    FROM catalog_offer o LEFT JOIN catalog_vector v ON v.offer_id = o.offer_id WHERE o.site_id = ?`).bind(siteId)
    .all<OfferWords & { content_hash: string | null }>();
  const gone = await db.prepare(`SELECT v.offer_id, v.vector_id FROM catalog_vector v
    WHERE v.offer_id LIKE ? ESCAPE '\\' AND NOT EXISTS (SELECT 1 FROM catalog_offer o WHERE o.offer_id = v.offer_id)`)
    .bind(`${siteId.replace(/[\\%_]/g, '\\$&')}|%`).all<{ offer_id: string; vector_id: string }>();
  if (gone.results?.length) {
    await meaning.products.deleteByIds(gone.results.map(row => row.vector_id));
    await db.batch(gone.results.map(row => db.prepare('DELETE FROM catalog_vector WHERE offer_id = ?').bind(row.offer_id)));
  }
  const stale: { offer: OfferWords; hash: string; text: string; image: string | null }[] = [];
  for (const offer of offers.results ?? []) {
    const parse = (text: string): unknown[] => { try { return JSON.parse(text) as unknown[]; } catch { return []; } };
    const image = parse(offer.images).find((item): item is string => typeof item === 'string') ?? null;
    const body = [offer.brand ?? '', offer.description, ...parse(offer.highlights).filter(item => typeof item === 'string')].join(' ').trim();
    const text = documentText(offer.title, body);
    const hash = await sha256(`${EMBEDDING_MODEL}\n${text}\n${image ?? ''}`);
    if (hash !== offer.content_hash) stale.push({ offer, hash, text, image });
  }
  for (let start = 0; start < stale.length; start += VECTOR_BATCH) {
    const batch = stale.slice(start, start + VECTOR_BATCH);
    const inputs: EmbedInput[] = [];
    for (const item of batch) {
      const picture = item.image ? await fetchPicture(item.image, fetcher) : null;
      inputs.push({ text: item.text, ...(picture ? { picture } : {}) });
    }
    const vectors = await meaning.embed(inputs);
    const rows: { id: string; values: number[]; offerId: string; hash: string; category: { id: string; name: string } | null }[] = [];
    for (const [index, item] of batch.entries()) {
      const values = vectors[index]!;
      const top = meaning.categories ? (await meaning.categories.query(values, { topK: 1, returnMetadata: 'all' })).matches[0] : undefined;
      const name = typeof top?.metadata?.name === 'string' ? top.metadata.name : '';
      rows.push({
        id: `dko_${(await sha256(item.offer.offer_id)).slice(0, 32)}`, values, offerId: item.offer.offer_id, hash: item.hash,
        category: top && name ? { id: top.id, name } : null,
      });
    }
    await meaning.products.upsert(rows.map(row => ({ id: row.id, values: row.values, metadata: { site_id: siteId } })));
    await db.batch(rows.map(row => db.prepare(`INSERT INTO catalog_vector (offer_id, vector_id, content_hash, category_id, category_name) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(offer_id) DO UPDATE SET vector_id = excluded.vector_id, content_hash = excluded.content_hash,
        category_id = excluded.category_id, category_name = excluded.category_name`)
      .bind(row.offerId, row.id, row.hash, row.category?.id ?? null, row.category?.name ?? null)));
  }
  return stale.length;
}

/** Every vector of a store that left the catalog. */
export async function forgetStore(db: D1Database, meaning: Meaning, siteId: string): Promise<void> {
  const rows = await db.prepare(`SELECT offer_id, vector_id FROM catalog_vector WHERE offer_id LIKE ? ESCAPE '\\'`)
    .bind(`${siteId.replace(/[\\%_]/g, '\\$&')}|%`).all<{ offer_id: string; vector_id: string }>();
  if (!rows.results?.length) return;
  await meaning.products.deleteByIds(rows.results.map(row => row.vector_id));
  await db.batch(rows.results.map(row => db.prepare('DELETE FROM catalog_vector WHERE offer_id = ?').bind(row.offer_id)));
}

/** Products nearest in meaning to a vector, best first, as universal product ids. */
export async function nearestProducts(db: D1Database, meaning: Meaning, vector: number[], topK = 100): Promise<string[]> {
  const found = await meaning.products.query(vector, { topK });
  const ids = found.matches.map(match => match.id);
  if (!ids.length) return [];
  const rows = await db.prepare(`SELECT v.vector_id, o.upid FROM catalog_vector v JOIN catalog_offer o ON o.offer_id = v.offer_id
    WHERE v.vector_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<{ vector_id: string; upid: string }>();
  const upidOf = new Map((rows.results ?? []).map(row => [row.vector_id, row.upid]));
  return [...new Set(ids.flatMap(id => upidOf.get(id) ?? []))];
}

/** The stored vector of a product, to find others like it. */
export async function productVector(db: D1Database, meaning: Meaning, upid: string): Promise<number[] | null> {
  const row = await db.prepare(`SELECT v.vector_id FROM catalog_vector v JOIN catalog_offer o ON o.offer_id = v.offer_id
    WHERE o.upid = ? ORDER BY o.price_min, o.offer_id LIMIT 1`).bind(upid).first<{ vector_id: string }>();
  if (!row) return null;
  const values = (await meaning.products.getByIds([row.vector_id]))[0]?.values;
  return values ? Array.from(values) : null;
}

/** Two best-first lists as one, so a product found by words and by meaning rises (reciprocal rank fusion). */
export function fuseRanks(lists: string[][]): string[] {
  const score = new Map<string, number>();
  for (const list of lists) list.forEach((id, index) => score.set(id, (score.get(id) ?? 0) + 1 / (60 + index)));
  return [...score.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id]) => id);
}
