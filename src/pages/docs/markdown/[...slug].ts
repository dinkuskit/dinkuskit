import type { APIRoute } from 'astro';
import { getVisibleDocs } from '../../../docs/content.ts';
import { articleMarkdown } from '../../../docs/catalog.ts';

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug?.endsWith('.md') ? params.slug.slice(0, -3) : null;
  const article = (await getVisibleDocs()).find(entry => entry.id === slug);
  if (!article) return new Response('Not found', { status: 404 });
  return new Response(articleMarkdown(article), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      ...(article.data.draft ? { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' } : {}),
    },
  });
};
