import type { APIRoute } from 'astro';
import { getPublicDocs } from '../../docs/content.ts';
import { searchRecord } from '../../docs/catalog.ts';
import { docsSite } from '../../docs/site.ts';

export const GET: APIRoute = async () => Response.json((await getPublicDocs()).map(article => searchRecord(docsSite, article)));
