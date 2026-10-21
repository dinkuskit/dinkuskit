/**
 * Doc update files: a reviewed change to one article, merged as
 * `docs/updates/<article id>.md` and published by `scripts/docs-sync.mjs`
 * (GrillTrack decision `website-docs-sync-077`).
 *
 * A file records the article's fields, its body as Markdown, and `base`: the
 * hash of the article's public Markdown export when the update was written
 * (`new` for an article that does not exist yet). The publisher writes only
 * while the live article still matches `base`, so edits made in the admin are
 * never overwritten. Hashes use node:crypto; this file is for the publisher
 * and tests, not the site's runtime.
 */
import { createHash } from 'node:crypto';
import { articleMarkdown, type DocArticle, type DocsSite } from './catalog.ts';
import { markdownToPortableText, portableTextToMarkdown } from './portable-text.ts';

export const NEW_ARTICLE = 'new';

/** Field order in a file; the first group is required, the second only for a new article. */
const REQUIRED = ['title', 'summary', 'audience', 'product', 'version_scope'] as const;
const PLACEMENT = ['nav_label', 'section', 'order'] as const;

export interface DocUpdate {
  /** Article ID, the path under /docs/, such as `store-owners/test-order`. */
  article: string;
  /** `sha256:<hex>` of the live export the update was written against, or `new`. */
  base: string;
  title: string;
  summary: string;
  audience: string;
  product: string;
  version_scope: string;
  nav_label?: string;
  section?: string;
  order?: number;
  /** Article body as Markdown. */
  body: string;
}

/** Why a version scope can't be published, or null. Owners need a release number or a plain "Unreleased". */
export function versionScopeProblem(scope: string) {
  if (/\b\d+\.\d+\.\d+\b/.test(scope) || /\bunreleased\b/i.test(scope)) return null;
  return `version_scope "${scope}" must name a release (such as "Commerce 0.3.0" or "Requires Commerce 0.4.0") or say "Unreleased"`;
}

/** The article's slug: the last part of its ID. */
export const articleSlug = (article: string) => article.split('/').at(-1) ?? article;

function frontmatterValue(raw: string) {
  if (raw.startsWith('"')) return JSON.parse(raw) as string;
  return raw;
}

/** Read and check an update file. `path` is the file's path under the updates folder, such as `store-owners/test-order.md`. */
export function parseUpdate(source: string, path?: string): DocUpdate {
  const match = source.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error(`${path ?? 'update'}: no frontmatter`);
  const data: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const [, key, raw] = line.match(/^(\w+):\s*(.*)$/) ?? [];
    if (!key) throw new Error(`${path ?? 'update'}: cannot read frontmatter line "${line}"`);
    data[key] = frontmatterValue(raw.trim());
  }
  const where = path ?? data.article ?? 'update';
  const known = new Set(['article', 'base', ...REQUIRED, ...PLACEMENT]);
  for (const key of Object.keys(data)) if (!known.has(key)) throw new Error(`${where}: unknown field ${key}`);
  if (!data.article || !/^[a-z0-9-]+(\/[a-z0-9-]+)?$/.test(data.article)) throw new Error(`${where}: article must be an article ID such as store-owners/test-order`);
  if (path && path !== `${data.article}.md`) throw new Error(`${where}: file must be named ${data.article}.md`);
  if (data.base !== NEW_ARTICLE && !/^sha256:[0-9a-f]{64}$/.test(data.base ?? '')) throw new Error(`${where}: base must be "new" or the sha256 that npm run docs:pull wrote`);
  for (const key of REQUIRED) if (!data[key]) throw new Error(`${where}: ${key} is required`);
  if (data.base === NEW_ARTICLE) for (const key of ['section', 'order']) if (!data[key]) throw new Error(`${where}: ${key} is required for a new article`);
  const versionProblem = versionScopeProblem(data.version_scope);
  if (versionProblem) throw new Error(`${where}: ${versionProblem}`);
  if (data.order !== undefined && !/^\d+$/.test(data.order)) throw new Error(`${where}: order must be a whole number`);
  const body = source.slice(match[0].length).trim();
  if (!body) throw new Error(`${where}: body is empty`);
  return {
    article: data.article,
    base: data.base,
    title: data.title,
    summary: data.summary,
    audience: data.audience,
    product: data.product,
    version_scope: data.version_scope,
    ...(data.nav_label ? { nav_label: data.nav_label } : {}),
    ...(data.section ? { section: data.section } : {}),
    ...(data.order ? { order: Number(data.order) } : {}),
    body,
  };
}

/** Write an update file. */
export function renderUpdate(update: DocUpdate) {
  const lines = [`article: ${update.article}`, `base: ${update.base}`];
  for (const key of [...REQUIRED, ...PLACEMENT]) {
    const value = update[key];
    if (value !== undefined) lines.push(`${key}: ${typeof value === 'number' ? value : JSON.stringify(value)}`);
  }
  return `---\n${lines.join('\n')}\n---\n\n${update.body.trim()}\n`;
}

/** The EmDash entry data an update writes. Placement fields are written only when the file sets them. */
export function updateData(update: DocUpdate) {
  const data: Record<string, unknown> = {
    title: update.title,
    summary: update.summary,
    audience: update.audience,
    product: update.product,
    version_scope: update.version_scope,
    body: markdownToPortableText(update.body),
  };
  for (const key of PLACEMENT) if (update[key] !== undefined) data[key] = update[key];
  return data;
}

/** A stable hash of an article's Markdown export, leaving out the "Last updated" date a save changes. */
export function exportHash(markdown: string) {
  const content = markdown.replace(/^Last updated: .*\n/m, '');
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

/** The export hash the article will have once this update is live. */
export function updateHash(site: DocsSite, update: DocUpdate) {
  const article: DocArticle = {
    id: update.article,
    title: update.title,
    navLabel: update.nav_label ?? update.title,
    summary: update.summary,
    audience: update.audience,
    product: update.product,
    versionScope: update.version_scope,
    section: update.section ?? '',
    order: update.order ?? 0,
    draft: false,
    updated: new Date(0),
    body: markdownToPortableText(update.body),
  };
  return exportHash(articleMarkdown(site, article));
}

/** Turn a live Markdown export back into an update file's fields, with `base` set to the export's hash. */
export function updateFromExport(article: string, markdown: string): DocUpdate {
  const match = markdown.match(/^# (.*)\n\n([\s\S]*?)\n\nAudience: (.*)\nProduct: (.*)\nVersion scope: (.*)\nLast updated: .*\nCanonical URL: .*\n\n([\s\S]*)$/);
  if (!match) throw new Error(`${article}: the Markdown export is not in the expected layout`);
  const [, title, summary, audience, product, versionScope, body] = match;
  // Round-trip through Portable Text so the body is exactly what the export renders.
  return {
    article,
    base: exportHash(markdown),
    title,
    summary,
    audience,
    product,
    version_scope: versionScope,
    body: portableTextToMarkdown(markdownToPortableText(body.trim())),
  };
}
