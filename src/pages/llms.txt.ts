import type { APIRoute } from 'astro';
import { getPublicDocs } from '../docs/content.ts';
import { markdownPath } from '../docs/catalog.ts';

export const GET: APIRoute = async () => {
  const entries = await getPublicDocs();
  if (!entries.length) return new Response('Not found', { status: 404 });
  const links = entries.map(entry => `- [${entry.data.title}](https://dinkuskit.com${markdownPath(entry.id)}): ${entry.data.summary}`);
  return new Response(`# DinkusKit\n\n> Documentation for store owners and developers.\n\n## Documentation\n\n${links.join('\n')}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' },
  });
};
