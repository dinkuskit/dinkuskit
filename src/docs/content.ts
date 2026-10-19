import { getCollection } from 'astro:content';
import { selectDocs } from './catalog.ts';

export async function getPublicDocs() {
  return selectDocs(await getCollection('docs'));
}

// There is deliberately no request parameter or deployment environment override.
// Draft previews exist only in Astro's local development server.
export async function getVisibleDocs() {
  return selectDocs(await getCollection('docs'), import.meta.env.DEV);
}
