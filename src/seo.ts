import type { DocArticle } from './docs/catalog.ts';

function isoDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

export const SITE_ORIGIN = 'https://dinkuskit.com';
export const SITE_NAME = 'DinkusKit';
export const DEFAULT_SOCIAL_IMAGE = '/social-card.png';
export const DEFAULT_SOCIAL_IMAGE_ALT =
  'DinkusKit — open-source commerce plugins for EmDash CMS on Astro and Cloudflare Workers';

const CANONICAL_HOST = 'dinkuskit.com';
const WWW_HOST = 'www.dinkuskit.com';

export const CORE_PUBLIC_PATHS = ['/', '/getting-started', '/start', '/terms'] as const;

const CORE_META_DESCRIPTIONS: Readonly<Record<string, string>> = {
  '/': 'Open-source headless commerce plugins for EmDash CMS on Astro: Commerce catalog & cart, Stripe checkout, USPS shipping labels, and agent-ready store tools.',
  '/getting-started':
    'See how DinkusKit fits together on EmDash CMS and Astro: open-source Commerce for catalog and cart, plus optional hosted Payments for Stripe and Ship for USPS.',
  '/start':
    'Launch your open-source EmDash ecommerce store on Cloudflare: try the demo store, deploy the Astro template, connect Payments and Ship, and run a test order.',
  '/terms':
    'Terms of Service for DinkusKit merchant accounts and hosted ecommerce services, including DinkusKit Payments for Stripe checkout and Ship for USPS labels.',
};

const DEFAULT_SEED_SUMMARIES: Readonly<Record<string, string>> = {
  '/': 'A store on your own EmDash site, built from open-source plugins you can add one by one: Commerce for your catalog and cart, Payments for Stripe checkout, Ship for USPS labels, and the agent you choose on the same tools.',
  '/getting-started':
    'Commerce runs the catalog and cart in your EmDash site. Payments and Ship add Stripe checkout and USPS labels when you want them, and an optional DinkusKit account connects them.',
  '/start':
    'Walk the demo store first, or go straight to building yours: start an EmDash store from the template, connect your DinkusKit account, add Payments and Ship, and place a test order.',
  '/terms': 'Effective date: October 17, 2026',
};

export function normalizeCanonicalPathname(pathname: string): string {
  const clean = pathname.replace(/\/{2,}/g, '/');
  if (clean === '/' || clean === '') return '/';
  return clean.replace(/\/+$/, '');
}

export function canonicalUrl(pathname: string, site: URL | string = SITE_ORIGIN): string {
  return new URL(normalizeCanonicalPathname(pathname), site).toString();
}

export function isLocalDevRequest(
  request?: Request,
  envSiteUrl: string | undefined = typeof process !== 'undefined' ? process.env.EMDASH_SITE_URL : undefined,
): boolean {
  if (typeof envSiteUrl === 'string' && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(envSiteUrl)) {
    return true;
  }
  const mfUrl = request?.headers.get('mf-original-url');
  if (mfUrl && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(mfUrl)) {
    return true;
  }
  return false;
}

export function canonicalRedirect(input: URL, request?: Request): URL | null {
  if (isLocalDevRequest(request)) return null;
  const host = input.hostname.toLowerCase();
  if (host !== CANONICAL_HOST && host !== WWW_HOST) return null;
  if (host === CANONICAL_HOST && input.protocol === 'https:' && !input.port) return null;
  const target = new URL(input.toString());
  target.protocol = 'https:';
  target.hostname = CANONICAL_HOST;
  target.port = '';
  return target;
}

export function metaDescription(text: string, limit = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  const slice = clean.slice(0, Math.max(1, limit - 1));
  const lastSpace = slice.lastIndexOf(' ');
  const head = (lastSpace >= Math.floor(limit * 0.6) ? slice.slice(0, lastSpace) : slice).replace(
    /[.,;:!\s-]+$/,
    '',
  );
  return `${head}…`;
}

export function pageMetaDescription(pathname: string, description: string, limit = 160): string {
  const normalized = normalizeCanonicalPathname(pathname);
  const clean = description.replace(/\s+/g, ' ').trim();
  const curated = CORE_META_DESCRIPTIONS[normalized];
  if (curated && (!clean || clean === DEFAULT_SEED_SUMMARIES[normalized])) {
    return metaDescription(curated, limit);
  }
  return metaDescription(clean || curated || SITE_NAME, limit);
}

export function seoTitle(title: string, pathname = '/'): string {
  const clean = title.replace(/\s+/g, ' ').trim();
  const normalized = normalizeCanonicalPathname(pathname);
  if (normalized === '/') {
    return `${clean} · ${SITE_NAME} — Open-Source Commerce for EmDash & Astro`;
  }
  if (normalized === '/getting-started') {
    return `${clean} · ${SITE_NAME} — Headless Commerce for EmDash & Astro`;
  }
  if (normalized === '/start') {
    return `${clean} · ${SITE_NAME} — EmDash & Astro Store Setup`;
  }
  if (normalized.startsWith('/docs/')) {
    return `${clean} · ${SITE_NAME} Docs`;
  }
  return `${clean} · ${SITE_NAME}`;
}

export function isNoIndexPathname(pathname: string): boolean {
  const normalized = normalizeCanonicalPathname(pathname);
  return (
    normalized === '/404'
    || normalized === '/account'
    || normalized.startsWith('/account/')
    || normalized === '/_emdash'
    || normalized.startsWith('/_emdash/')
  );
}

export function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function corePageJsonLd(
  pathname: string,
  title: string,
  description: string,
): Record<string, unknown> | null {
  const normalized = normalizeCanonicalPathname(pathname);
  if (isNoIndexPathname(normalized)) return null;
  const url = canonicalUrl(normalized);
  const desc = pageMetaDescription(normalized, description);
  const organization = {
    '@type': 'Organization',
    '@id': `${SITE_ORIGIN}/#organization`,
    name: SITE_NAME,
    url: SITE_ORIGIN,
    logo: `${SITE_ORIGIN}/brand/dinkuskit-f3-cube.webp`,
    sameAs: [
      'https://github.com/dinkuskit',
      'https://github.com/dinkuskit/dinkuskit',
      'https://discord.gg/7yHZGj8p88',
    ],
  };
  if (normalized === '/') {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        organization,
        {
          '@type': 'WebSite',
          '@id': `${SITE_ORIGIN}/#website`,
          url: SITE_ORIGIN,
          name: SITE_NAME,
          description: desc,
          publisher: { '@id': `${SITE_ORIGIN}/#organization` },
        },
        {
          '@type': 'SoftwareApplication',
          '@id': `${SITE_ORIGIN}/#software`,
          name: SITE_NAME,
          applicationCategory: 'BusinessApplication',
          applicationSubCategory: 'EcommerceApplication',
          operatingSystem: 'Cloudflare Workers, Node.js, Web',
          url: SITE_ORIGIN,
          description: desc,
          license: 'https://opensource.org/licenses/MIT',
          publisher: { '@id': `${SITE_ORIGIN}/#organization` },
          offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'USD',
          },
          featureList: [
            'DinkusKit Commerce: open-source catalog, cart, orders, REST API, and MCP tools for EmDash CMS',
            'DinkusKit Payments: Stripe Checkout and webhook verification for EmDash stores',
            'DinkusKit Ship: USPS shipping rates and label printing for EmDash stores',
          ],
        },
      ],
    };
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description: desc,
    url,
    isPartOf: {
      '@type': 'WebSite',
      '@id': `${SITE_ORIGIN}/#website`,
      name: SITE_NAME,
      url: SITE_ORIGIN,
    },
    publisher: organization,
  };
}

export function docsArticleJsonLd(article: DocArticle): Record<string, unknown> {
  const url = canonicalUrl(`/docs/${article.id}`);
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: article.title,
    name: article.title,
    description: metaDescription(article.summary),
    dateModified: isoDate(article.updated),
    url,
    mainEntityOfPage: url,
    image: `${SITE_ORIGIN}${DEFAULT_SOCIAL_IMAGE}`,
    proficiencyLevel: article.audience,
    about: {
      '@type': 'SoftwareApplication',
      name: article.product,
      applicationCategory: 'BusinessApplication',
    },
    author: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_ORIGIN,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_ORIGIN,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_ORIGIN}/brand/dinkuskit-f3-cube.webp`,
      },
    },
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function sitemapXml(docs: readonly DocArticle[] = []): string {
  const entries: Array<{ loc: string; lastmod?: string }> = CORE_PUBLIC_PATHS.map(path => ({
    loc: canonicalUrl(path),
  }));
  const seen = new Set(entries.map(item => item.loc));
  for (const article of docs) {
    if (article.draft) continue;
    const loc = canonicalUrl(`/docs/${article.id}`);
    if (seen.has(loc)) continue;
    seen.add(loc);
    const lastmod = article.updated ? isoDate(article.updated) : '';
    entries.push({
      loc,
      ...(/^\d{4}-\d{2}-\d{2}$/.test(lastmod) ? { lastmod } : {}),
    });
  }
  const body = entries
    .map(entry =>
      entry.lastmod
        ? `  <url><loc>${escapeXml(entry.loc)}</loc><lastmod>${escapeXml(entry.lastmod)}</lastmod></url>`
        : `  <url><loc>${escapeXml(entry.loc)}</loc></url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function robotsTxt(): string {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /_emdash/',
    'Disallow: /api/',
    '',
    `Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
    '',
  ].join('\n');
}
