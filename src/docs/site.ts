import type { DocsSite } from './catalog.ts';

/** The only site-specific docs setting. Section names match the seed's `section` options. */
export const docsSite: DocsSite = {
  origin: 'https://dinkuskit.com',
  name: 'DinkusKit',
  description:
    'Enterprise business tools. Zero enterprise bloat. So easy a Dinkus could do it. Open-source, agentic and composable commerce and business operating system plugins for EmDash CMS on Astro and Cloudflare Workers: merchant-owned storefronts, catalog and cart (DinkusKit Commerce), online payment processing and Stripe checkout (DinkusKit Payments; Authorize.Net planned), and order fulfillment software for USPS shipping labels (DinkusKit Ship), with stock ledger (DinkusKit Inventory) planned after v1 alongside standalone plugins for promotions (DinkusKit Coupons) and AI bookkeeping / small business bookkeeping software (DinkusKit Books). Manage your store from the EmDash admin or with the AI agent you choose through the same tools.',
  platformLinks: [
    {
      title: 'DinkusKit Home',
      url: 'https://dinkuskit.com/',
      summary:
        'Enterprise business tools, zero enterprise bloat—open-source commerce and business OS plugins for EmDash CMS on Astro, managed in the admin or with the agent you choose.',
    },
    {
      title: 'How DinkusKit Works',
      url: 'https://dinkuskit.com/getting-started',
      summary:
        'Architecture overview of standalone EmDash plugins (Commerce, Payments, Ship, plus planned Inventory, Coupons and Books) and scoped agent access.',
    },
    {
      title: 'Start Your Store',
      url: 'https://dinkuskit.com/start',
      summary: 'Four-step setup checklist from a new EmDash site to your first verified test order.',
    },
    {
      title: 'Live Demo Store Playground',
      url: 'https://playground.dinkuskit.com/',
      summary:
        'Interactive EmDash + DinkusKit reference storefront where every visitor gets a disposable demo store.',
    },
    {
      title: 'Full Documentation Corpus (llms-full.txt)',
      url: 'https://dinkuskit.com/llms-full.txt',
      summary:
        'Single-file Markdown export of all published DinkusKit documentation for full-context LLM ingestion.',
    },
  ],
  mcp: {
    endpoint: 'https://dinkuskit.com/docs/mcp',
    protocols: ['2025-11-25', '2025-03-26'],
    tools: [
      {
        name: 'search_docs',
        summary:
          'Search published DinkusKit documentation by keyword; returns article ID, title, canonical URL, version scope, and excerpt.',
      },
      {
        name: 'get_docs',
        summary:
          'Fetch full Markdown for one or more published documentation article IDs returned by search_docs (for example `store-owners/test-order`).',
      },
    ],
  },
  sectionPaths: {
    'Store owners': 'store-owners',
    Developers: 'developers',
    'Product reference': 'reference',
  },
};
