#!/usr/bin/env node
/**
 * Fills the catalog's category index from Shopify's open Standard Product Taxonomy
 * (MIT licence, github.com/Shopify/product-taxonomy, dist/en/categories.txt), so the
 * catalog can work out each product's category. Run once at set-up and again when the
 * taxonomy version changes. It changes a Cloudflare index: run it only on the owner's go.
 *
 *   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
 *     node catalog/scripts/seed-categories.mjs path/to/categories.txt [index-name]
 */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const MODEL = '@cf/google/embeddinggemma-2', BATCH = 50;

/** `gid://shopify/TaxonomyCategory/aa-1-13 : Apparel & Accessories > Clothing > Clothing Tops` lines as { id, name }. */
export function parseCategories(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    const match = line.match(/^gid:\/\/shopify\/TaxonomyCategory\/([a-z]{2}(?:-\d{1,4}){0,10})\s*:\s*(.+?)\s*$/);
    if (match) rows.push({ id: match[1], name: match[2] });
  }
  return rows;
}

/** The words the model reads for a category: its own name first, then where it sits. */
export const categoryText = (name) => `title: ${name.split(' > ').at(-1)} | text: ${name}`;

async function main() {
  const [file, index = 'dinkuskit-catalog-categories'] = process.argv.slice(2);
  const account = process.env.CLOUDFLARE_ACCOUNT_ID, token = process.env.CLOUDFLARE_API_TOKEN;
  if (!file || !account || !token) {
    console.error('usage: CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... node catalog/scripts/seed-categories.mjs <categories.txt> [index-name]');
    process.exit(2);
  }
  const rows = parseCategories(await readFile(file, 'utf8'));
  if (rows.length < 1000) throw new Error(`only ${rows.length} categories read; is this Shopify's categories.txt?`);
  const api = `https://api.cloudflare.com/client/v4/accounts/${account}`, headers = { authorization: `Bearer ${token}` };
  for (let start = 0; start < rows.length; start += BATCH) {
    const batch = rows.slice(start, start + BATCH);
    const embedded = await fetch(`${api}/ai/run/${MODEL}`, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ input: batch.map(row => categoryText(row.name)) }),
    });
    const body = await embedded.json();
    const vectors = (body.result?.data ?? []).map(row => row.embedding);
    if (!embedded.ok || vectors.length !== batch.length) throw new Error(`embedding failed at ${start}: ${embedded.status}`);
    const ndjson = batch.map((row, at) => JSON.stringify({ id: row.id, values: vectors[at], metadata: { name: row.name } })).join('\n');
    const upserted = await fetch(`${api}/vectorize/v2/indexes/${index}/upsert`, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/x-ndjson' }, body: ndjson,
    });
    if (!upserted.ok) throw new Error(`upsert failed at ${start}: ${upserted.status}`);
    console.log(`${Math.min(start + BATCH, rows.length)} / ${rows.length}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
