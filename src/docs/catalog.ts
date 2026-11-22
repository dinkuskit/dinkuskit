import { portableTextToMarkdown, type PortableTextBlock } from './portable-text.ts';

/** One article as every docs surface sees it, whatever store it came from. */
export interface DocArticle {
  /** Path under /docs/, such as `store-owners/setup`. */
  id: string;
  title: string;
  navLabel: string;
  summary: string;
  audience: string;
  product: string;
  versionScope: string;
  section: string;
  order: number;
  draft: boolean;
  updated: Date;
  body: PortableTextBlock[];
}

export interface DocsPlatformLink {
  title: string;
  url: string;
  summary: string;
}

export interface DocsMcpDescriptor {
  endpoint: string;
  protocols: ReadonlyArray<string>;
  tools: ReadonlyArray<{ name: string; summary: string }>;
}

/** What a site supplies: its public origin, its name, and URL folders for sections. */
export interface DocsSite {
  origin: string;
  name: string;
  description: string;
  platformLinks?: ReadonlyArray<DocsPlatformLink>;
  mcp?: DocsMcpDescriptor;
  /** Section name to URL folder; a section without one puts its articles directly under /docs/. */
  sectionPaths: Record<string, string>;
}

export const docsPath = (id: string) => `/docs/${id}`;
export const markdownPath = (id: string) => `/docs/markdown/${id}.md`;
export const canonicalDocsUrl = (site: DocsSite, id: string) => `${site.origin}${docsPath(id)}`;

export function articleId(site: DocsSite, slug: string, section: string) {
  const folder = site.sectionPaths[section];
  return folder ? `${folder}/${slug}` : slug;
}

/** Sidebar and reading order: by `order`, then title. */
export function sortArticles<T extends Pick<DocArticle, 'order' | 'title'>>(articles: T[]): T[] {
  return [...articles].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

/** Sections in the order their first article appears. */
export function docsSections<T extends Pick<DocArticle, 'section'>>(articles: T[]) {
  const sections = new Map<string, T[]>();
  for (const article of articles) sections.set(article.section, [...(sections.get(article.section) ?? []), article]);
  return [...sections].map(([title, pages]) => ({ title, pages }));
}

export function searchRecord(site: DocsSite, article: DocArticle) {
  return {
    id: article.id,
    title: article.title,
    summary: article.summary,
    url: docsPath(article.id),
    canonicalUrl: canonicalDocsUrl(site, article.id),
    product: article.product,
    version: article.versionScope,
    text: portableTextToMarkdown(article.body),
  };
}

export function articleMarkdown(site: DocsSite, article: DocArticle) {
  return `# ${article.title}\n\n${article.summary}\n\nAudience: ${article.audience}\nProduct: ${article.product}\nVersion scope: ${article.versionScope}\nLast updated: ${article.updated.toISOString().slice(0, 10)}\nCanonical URL: ${canonicalDocsUrl(site, article.id)}\n\n${portableTextToMarkdown(article.body)}\n`;
}

/** The llms.txt index of published articles, or null when there are none. */
export function llmsText(site: DocsSite, articles: DocArticle[]) {
  if (!articles.length) return null;
  const sections: string[] = [`# ${site.name}\n\n> ${site.description}`];
  if (site.platformLinks?.length) {
    const platform = site.platformLinks.map(item => `- [${item.title}](${item.url}): ${item.summary}`);
    sections.push(`## Platform & Quick Links\n\n${platform.join('\n')}`);
  }
  if (site.mcp) {
    const protocols = site.mcp.protocols.map(protocol => `\`${protocol}\``).join(' and ');
    const tools = site.mcp.tools.map(tool => `- \`${tool.name}\`: ${tool.summary}`);
    sections.push(
      `## Docs MCP Server\n\nConnect any MCP-capable AI assistant to \`${site.mcp.endpoint}\` (\`POST\`, stateless Streamable HTTP, protocols ${protocols}, no auth token required):\n\n${tools.join('\n')}`,
    );
  }
  const links = articles.map(article => `- [${article.title}](${site.origin}${markdownPath(article.id)}): ${article.summary}`);
  sections.push(`## Documentation\n\n${links.join('\n')}`);
  return `${sections.join('\n\n')}\n`;
}

/** The llms-full.txt single-file Markdown corpus of published articles, or null when there are none. */
export function llmsFullText(site: DocsSite, articles: DocArticle[]) {
  if (!articles.length) return null;
  const index = llmsText(site, articles)?.trimEnd() ?? `# ${site.name}\n\n> ${site.description}`;
  const bodies = articles.map(article => articleMarkdown(site, article).trimEnd());
  return `${index}\n\n---\n\n${bodies.join('\n\n---\n\n')}\n`;
}

export interface DocsEntry {
  id: string;
  data: Record<string, unknown> & { status?: string; updatedAt?: Date | string };
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** Map stored entries to articles; only published ones unless previewing drafts. */
export function selectArticles(site: DocsSite, entries: DocsEntry[], preview = false): DocArticle[] {
  const articles = entries.flatMap(entry => {
    const data = entry.data;
    const draft = data.status !== 'published';
    if (draft && !preview) return [];
    const title = text(data.title);
    const section = text(data.section);
    if (!title || !section || !Array.isArray(data.body)) return [];
    return [{
      id: articleId(site, entry.id, section),
      title,
      navLabel: text(data.nav_label) || title,
      summary: text(data.summary),
      audience: text(data.audience),
      product: text(data.product),
      versionScope: text(data.version_scope),
      section,
      order: typeof data.order === 'number' ? data.order : Number.MAX_SAFE_INTEGER,
      draft,
      updated: new Date(data.updatedAt ?? 0),
      body: data.body as PortableTextBlock[],
    }];
  });
  return sortArticles(articles);
}
