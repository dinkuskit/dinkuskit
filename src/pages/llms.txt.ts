import type { APIRoute } from 'astro';
import { getPublicDocs } from '../docs/content.ts';
import { llmsText } from '../docs/catalog.ts';
import { docsSite } from '../docs/site.ts';

export const GET: APIRoute = async () => {
  const text = llmsText(docsSite, await getPublicDocs());
  if (!text) return new Response('Not found', { status: 404 });
  return new Response(text, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' },
  });
};
