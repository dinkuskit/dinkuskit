export const docsSections = [
  { title: 'Start here', pages: ['start-here'] },
  { title: 'Store owners', pages: ['store-owners/setup', 'store-owners/first-product', 'store-owners/test-order'] },
  { title: 'Developers', pages: ['developers/integrate', 'developers/add-on', 'developers/contribute'] },
  { title: 'Product reference', pages: ['reference/commerce', 'reference/payments', 'reference/inventory', 'reference/ship'] },
  { title: 'Troubleshooting and upgrades', pages: ['troubleshooting'] },
  { title: 'Using AI assistants', pages: ['ai-assistants'] },
] as const;

export const pageLabels: Record<string, string> = {
  'start-here': 'Choose your path',
  'store-owners/setup': 'Set up a store',
  'store-owners/first-product': 'Add your first product',
  'store-owners/test-order': 'Verify a test order',
  'developers/integrate': 'Build a site',
  'developers/add-on': 'Extend DinkusKit',
  'developers/contribute': 'Contribute',
  'reference/commerce': 'Commerce',
  'reference/payments': 'Payments',
  'reference/inventory': 'Inventory',
  'reference/ship': 'Ship',
  troubleshooting: 'Troubleshooting and upgrades',
  'ai-assistants': 'Read docs with your assistant',
};

export const publicPageIds: readonly string[] = docsSections.flatMap(section => [...section.pages]);
export const docsPath = (id: string) => `/docs/${id}`;
export const canonicalDocsUrl = (id: string) => `https://dinkuskit.com${docsPath(id)}`;
export const markdownPath = (id: string) => `/docs/markdown/${id}.md`;

export interface DocRecord {
  id: string;
  data: { title: string; summary: string; audience: string; product: string; version: string; draft: boolean };
  body?: string;
}

/** The allowlist and draft flag apply together, even if another file enters the collection. */
export function selectDocs<T extends DocRecord>(entries: T[], preview = false): T[] {
  return publicPageIds.flatMap(id => {
    const entry = entries.find(item => item.id === id);
    return entry && (!entry.data.draft || preview) ? [entry] : [];
  });
}

export function searchRecord(entry: DocRecord) {
  return {
    id: entry.id,
    title: entry.data.title,
    summary: entry.data.summary,
    url: docsPath(entry.id),
    canonicalUrl: canonicalDocsUrl(entry.id),
    product: entry.data.product,
    version: entry.data.version,
    text: entry.body ?? '',
  };
}

/** Authoring accepts root-relative public links and absolute URLs, so no source paths leak. */
export function articleMarkdown(entry: DocRecord) {
  return `# ${entry.data.title}\n\n${entry.data.summary}\n\nAudience: ${entry.data.audience}\nProduct: ${entry.data.product}\nVersion scope: ${entry.data.version}\nCanonical URL: ${canonicalDocsUrl(entry.id)}\n\n${entry.body ?? ''}`;
}
