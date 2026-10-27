import type { APIRoute } from 'astro';
const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
export const GET: APIRoute = ({ url }) => url.pathname.endsWith('/config')
  ? new Response(JSON.stringify({ enabled: true, maxQuestionCharacters: 2000, timeoutMs: 1200 }), { headers })
  : new Response('{}', { status: 405, headers });
export const POST: APIRoute = async ({ request, url }) => {
  if (!url.pathname.endsWith('/ask')) return new Response('{}', { status: 405, headers });
  const { question } = await request.json();
  if (typeof question !== 'string' || [...question].length > 2000) return new Response(JSON.stringify({ error: 'too_large' }), { status: 413, headers });
  if (question === 'unavailable') return new Response(JSON.stringify({ error: 'unavailable' }), { status: 503, headers });
  if (question === 'overloaded') return new Response(JSON.stringify({ error: 'overloaded' }), { status: 429, headers });
  if (question === 'slow') await new Promise((resolve) => setTimeout(resolve, 2500));
  if (question === 'wait') await new Promise((resolve) => setTimeout(resolve, 500));
  return new Response(JSON.stringify({ status: 'answered', answer: `Synthetic answer: ${question}`,
    citations: question === 'unsafe-link' ? ['javascript:alert(1)'] : [`https://github.com/dinkuskit/dinkus-guide/blob/${'d8eb8bb7d5877ee120a1d6ff5d4045712c91a03e'}/README.md#L1-L10`] }), { headers });
};
