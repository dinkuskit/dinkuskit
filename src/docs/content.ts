import { getEmDashCollection } from 'emdash';
import { selectArticles, type DocsEntry } from './catalog.ts';
import { docsSite } from './site.ts';

/** The EmDash collection the seed defines. */
export const DOCS_COLLECTION = 'docs';

async function load(status: 'published' | 'draft') {
  const { entries, error } = await getEmDashCollection(DOCS_COLLECTION, { status });
  // A site without the collection yet has no docs.
  return error ? [] : (entries as unknown as DocsEntry[]);
}

export async function getPublicDocs() {
  return selectArticles(docsSite, await load('published'));
}

// There is deliberately no request parameter or deployment environment override.
// Draft previews exist only in Astro's local development server.
export async function getVisibleDocs() {
  if (!import.meta.env.DEV) return getPublicDocs();
  return selectArticles(docsSite, [...await load('published'), ...await load('draft')], true);
}
