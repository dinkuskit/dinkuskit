import type { APIRoute } from 'astro';
import { getPublicDocs } from '../../docs/content.ts';
import { handleDocsMcp } from '../../docs/mcp.ts';
import { docsSite } from '../../docs/site.ts';

export const prerender = false;

// Published articles only, including in local development. The same list feeds
// search.json and llms.txt. Draft preview never reaches this route.
export const POST: APIRoute = async ({ request }) => handleDocsMcp(request, await getPublicDocs(), docsSite);

const closed: APIRoute = ({ request }) => handleDocsMcp(request, [], docsSite);
export const GET = closed;
export const DELETE = closed;
export const OPTIONS = closed;
