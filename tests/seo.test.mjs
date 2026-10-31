import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import {
  CORE_PUBLIC_PATHS,
  DEFAULT_SOCIAL_IMAGE,
  SITE_NAME,
  SITE_ORIGIN,
  canonicalRedirect,
  canonicalUrl,
  corePageJsonLd,
  docsArticleJsonLd,
  isNoIndexPathname,
  jsonLd,
  metaDescription,
  pageMetaDescription,
  robotsTxt,
  seoTitle,
  sitemapXml,
} from '../src/seo.ts';

test('canonicalRedirect redirects http apex and www to https://dinkuskit.com and leaves canonical/local URLs untouched', () => {
  assert.equal(canonicalRedirect(new URL('https://dinkuskit.com/')), null);
  assert.equal(canonicalRedirect(new URL('https://dinkuskit.com/docs/start-here?tab=cli')), null);
  assert.equal(canonicalRedirect(new URL('http://127.0.0.1:4321/getting-started')), null);
  assert.equal(canonicalRedirect(new URL('http://localhost:8787/start')), null);

  assert.equal(
    canonicalRedirect(new URL('http://dinkuskit.com/getting-started?ref=nav'))?.toString(),
    'https://dinkuskit.com/getting-started?ref=nav',
  );
  assert.equal(
    canonicalRedirect(new URL('https://www.dinkuskit.com/docs/reference/commerce'))?.toString(),
    'https://dinkuskit.com/docs/reference/commerce',
  );
  assert.equal(
    canonicalRedirect(new URL('http://www.dinkuskit.com/start'))?.toString(),
    'https://dinkuskit.com/start',
  );
});

test('metaDescription normalizes whitespace and truncates cleanly within 160 characters', () => {
  assert.equal(metaDescription('  Short   description.  '), 'Short description.');
  const long =
    'A store on your own EmDash site, built from open-source plugins you can add one by one: Commerce for your catalog and cart, Payments for Stripe checkout, Ship for USPS labels, and the agent you choose on the same tools.';
  const clipped = metaDescription(long, 160);
  assert.ok(clipped.length <= 160, `expected <= 160 chars, got ${clipped.length}: ${clipped}`);
  assert.ok(clipped.endsWith('…'));

  for (const path of CORE_PUBLIC_PATHS) {
    const desc = pageMetaDescription(path, '');
    assert.ok(desc.length >= 110 && desc.length <= 160, `${path} meta description length ${desc.length}: ${desc}`);
  }
});

test('seoTitle preserves the page title while adding search context on core and docs routes', () => {
  const homeTitle = 'Run your store yourself, or with the agent you choose.';
  assert.ok(seoTitle(homeTitle, '/').startsWith(`${homeTitle} · ${SITE_NAME}`));
  assert.match(seoTitle(homeTitle, '/'), /Open-Source Commerce for EmDash & Astro/);
  assert.match(seoTitle('How DinkusKit fits together.', '/getting-started'), /Headless Commerce/);
  assert.match(seoTitle('Start your store', '/start'), /EmDash & Astro Store Setup/);
  assert.equal(seoTitle('Complete and verify a test order', '/docs/store-owners/test-order'), 'Complete and verify a test order · DinkusKit Docs');
});

test('isNoIndexPathname flags /404, /account/*, and /_emdash/* while keeping public pages indexable', () => {
  for (const path of ['/', '/getting-started', '/start', '/terms', '/docs/start-here']) {
    assert.equal(isNoIndexPathname(path), false, path);
  }
  for (const path of ['/404', '/account', '/account/sign-in', '/account/signup', '/_emdash', '/_emdash/admin']) {
    assert.equal(isNoIndexPathname(path), true, path);
  }
});

test('corePageJsonLd and docsArticleJsonLd emit valid schema.org objects and escape closing tags', () => {
  const home = corePageJsonLd('/', 'Run your store yourself, or with the agent you choose.', '');
  assert.ok(home);
  assert.equal(home['@context'], 'https://schema.org');
  const graph = home['@graph'];
  assert.ok(Array.isArray(graph));
  assert.deepEqual(
    graph.map(node => node['@type']),
    ['Organization', 'WebSite', 'SoftwareApplication'],
  );

  const guide = corePageJsonLd('/getting-started', 'How DinkusKit fits together.', '');
  assert.equal(guide?.['@type'], 'WebPage');
  assert.equal(guide?.url, 'https://dinkuskit.com/getting-started');
  assert.equal(corePageJsonLd('/account/sign-in', 'Sign in', ''), null);

  const article = docsArticleJsonLd({
    id: 'reference/commerce',
    slug: 'commerce',
    title: 'Commerce plugin reference',
    summary: 'Catalog, cart, checkout sessions, orders, and MCP tools for EmDash stores.',
    audience: 'Developers',
    product: 'DinkusKit Commerce',
    version: 'Commerce 0.1.0',
    updated: '2026-10-30',
    order: 8,
    draft: false,
    body: [],
  });
  assert.equal(article['@type'], 'TechArticle');
  assert.equal(article.url, 'https://dinkuskit.com/docs/reference/commerce');
  assert.equal(article.dateModified, '2026-10-30');
  assert.ok(!jsonLd({ x: '</script><script>' }).includes('</script>'));
});

test('sitemapXml includes core public pages and published docs while excluding drafts and account pages', () => {
  const xml = sitemapXml([
    {
      id: 'store-owners/test-order',
      slug: 'test-order',
      title: 'Complete and verify a test order',
      summary: 'Run a test checkout.',
      audience: 'Store owners',
      product: 'DinkusKit Commerce',
      version: 'Commerce 0.1.0',
      updated: '2026-10-30',
      order: 4,
      draft: false,
      body: [],
    },
    {
      id: 'start-here',
      slug: 'start-here',
      title: 'Start here',
      summary: 'Draft article.',
      audience: 'Both',
      product: 'All DinkusKit',
      version: '0.1.0',
      updated: '2026-10-30',
      order: 1,
      draft: true,
      body: [],
    },
  ]);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  for (const path of CORE_PUBLIC_PATHS) {
    assert.ok(xml.includes(`<loc>${canonicalUrl(path)}</loc>`), `missing ${path}`);
  }
  assert.ok(xml.includes('<loc>https://dinkuskit.com/docs/store-owners/test-order</loc><lastmod>2026-10-30</lastmod>'));
  assert.ok(!xml.includes('start-here'), 'draft doc must not appear in sitemap.xml');
  assert.ok(!xml.includes('/account'), 'account routes must not appear in sitemap.xml');
});

test('robotsTxt and social card assets match production SEO requirements', () => {
  const txt = robotsTxt();
  assert.match(txt, /^User-agent: \*/m);
  assert.match(txt, /^Disallow: \/_emdash\/$/m);
  assert.match(txt, /^Disallow: \/api\/$/m);
  assert.match(txt, /^Sitemap: https:\/\/dinkuskit\.com\/sitemap\.xml$/m);
  assert.equal(SITE_ORIGIN, 'https://dinkuskit.com');
  assert.equal(DEFAULT_SOCIAL_IMAGE, '/social-card.png');
  assert.ok(existsSync(new URL('../public/social-card.png', import.meta.url)));
  assert.ok(existsSync(new URL('../public/social-card.svg', import.meta.url)));
  const layout = readFileSync(new URL('../src/layouts/Site.astro', import.meta.url), 'utf8');
  assert.match(layout, /property="og:image"/);
  assert.match(layout, /name="twitter:card" content="summary_large_image"/);
  assert.match(layout, /type="application\/ld\+json"/);
});
