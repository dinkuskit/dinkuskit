import type { APIRoute } from 'astro';
import { getPublicDocs } from '../docs/content.ts';
import type { DocArticle } from '../docs/catalog.ts';
import { sitemapXml } from '../seo.ts';

export const GET: APIRoute = async () => {
  let docs: DocArticle[] = [];
  try {
    docs = await getPublicDocs();
  } catch {
    docs = [];
  }
  return new Response(sitemapXml(docs), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
