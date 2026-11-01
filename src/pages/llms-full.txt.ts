import type { APIRoute } from 'astro';
import { getPublicDocs } from '../docs/content.ts';
import { llmsFullText } from '../docs/catalog.ts';
import { docsSite } from '../docs/site.ts';

export const GET: APIRoute = async () => {
  const text = llmsFullText(docsSite, await getPublicDocs());
  if (!text) return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
