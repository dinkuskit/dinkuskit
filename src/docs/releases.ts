/**
 * Reference articles that plugin repositories keep beside their code and
 * publish at a stable release (GrillTrack decision
 * `website-docs-from-plugin-releases-086`).
 *
 * A plugin keeps `docs/website/<article id>.md`: an update file without
 * `base`, reviewed in the same PR as the code it describes. `{{version}}` and
 * `{{release_date}}` stand for the release that ships it. At a stable release
 * the plugin presses **Docs from a plugin release** here, which fills them in,
 * sets `base` to what this repository last published for the article, and
 * pushes the file to `docs/updates/` on main, so the publisher's admin-edit
 * guard still applies. The twice-monthly check compares each article's
 * `version_scope` with the plugin's latest stable release.
 */
import type { DocsSite } from './catalog.ts';
import { NEW_ARTICLE, parseUpdate, renderUpdate, updateHash, type DocUpdate } from './updates.ts';

export interface PluginDocs {
  /** GitHub repository, owner/name. */
  repository: string;
  /** The name `version_scope` uses, such as "Commerce 0.6.0". */
  product: string;
  /** The article IDs this plugin may publish. */
  articles: readonly string[];
}

export const PLUGIN_DOCS = {
  commerce: { repository: 'dinkuskit/commerce', product: 'Commerce', articles: ['reference/commerce'] },
  payments: { repository: 'dinkuskit/payments', product: 'Payments', articles: ['reference/payments'] },
  ship: { repository: 'dinkuskit/ship', product: 'Ship', articles: ['reference/ship'] },
} as const satisfies Record<string, PluginDocs>;

export type PluginName = keyof typeof PLUGIN_DOCS;

export const isPluginName = (name: string): name is PluginName => Object.hasOwn(PLUGIN_DOCS, name);

/** Where a plugin repository keeps its articles. */
export const PLUGIN_ARTICLE_DIR = 'docs/website';

type Version = readonly [number, number, number];

/** The version of a stable tag such as `v0.6.0`, or null for anything else (betas included). */
export function tagVersion(tag: string): Version | null {
  const match = tag.match(/^v(\d+)\.(\d+)\.(\d+)$/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** The stable version a scope names for this product ("Commerce 0.6.0" names 0.6.0), or null. */
export function scopeVersion(scope: string, product: string): Version | null {
  const escaped = product.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = scope.match(new RegExp(`\\b${escaped} (\\d+)\\.(\\d+)\\.(\\d+)(?![-.\\d])`));
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function compareVersions(a: Version, b: Version) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

export const versionText = (version: Version) => version.join('.');

/** A release date as articles write it, such as "25 October 2026". */
export const releaseDateText = (date: Date) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);

/** Fill in `{{version}}` and `{{release_date}}`; any other `{{…}}` is refused. */
export function fillRelease(source: string, version: Version, date: Date) {
  const filled = source.replaceAll('{{version}}', versionText(version)).replaceAll('{{release_date}}', releaseDateText(date));
  const left = filled.match(/\{\{[^}]*\}\}/);
  if (left) throw new Error(`unknown placeholder ${left[0]}; only {{version}} and {{release_date}} are filled in`);
  return filled;
}

/**
 * The update file a stable release publishes for one article. `previous` is
 * this repository's current update file for it, if any: its content is what
 * the publisher last made live, so its hash becomes `base`, and an admin edit
 * made since then stops the publish instead of being overwritten. A release
 * that changes nothing returns `previous` as it is.
 */
export function releaseUpdate(input: { site: DocsSite; plugin: PluginName; article: string; source: string; tag: string; date: Date; previous?: DocUpdate }): DocUpdate {
  const { site, plugin, article, source, tag, date, previous } = input;
  const docs: PluginDocs = PLUGIN_DOCS[plugin];
  const where = `${docs.repository} ${tag} ${PLUGIN_ARTICLE_DIR}/${article}.md`;
  if (!docs.articles.includes(article)) throw new Error(`${where}: ${plugin} does not publish ${article}`);
  const version = tagVersion(tag);
  if (!version) throw new Error(`${where}: ${tag} is not a stable vX.Y.Z tag`);
  const filled = fillRelease(source, version, date);
  if (!filled.startsWith('---\n')) throw new Error(`${where}: no frontmatter`);
  if (/^base:/m.test(filled.split('\n---\n', 1)[0])) throw new Error(`${where}: leave base out; it is set when the release is published`);
  const base = previous ? updateHash(site, previous) : NEW_ARTICLE;
  const update = parseUpdate(filled.replace('---\n', `---\nbase: ${base}\n`), `${article}.md`);
  const stated = scopeVersion(update.version_scope, docs.product);
  if (!stated || compareVersions(stated, version) !== 0) {
    throw new Error(`${where}: version_scope "${update.version_scope}" must name ${docs.product} ${versionText(version)}; write "${docs.product} {{version}}"`);
  }
  if (previous) {
    const published = scopeVersion(previous.version_scope, docs.product);
    if (published && compareVersions(version, published) < 0) {
      throw new Error(`${where}: the site already describes ${docs.product} ${versionText(published)}, which is newer than ${tag}`);
    }
    if (renderUpdate({ ...update, base: previous.base }) === renderUpdate(previous)) return previous;
  }
  return update;
}

/** An article whose version scope is older than its plugin's latest stable release. */
export interface BehindArticle {
  plugin: PluginName;
  article: string;
  /** The version the update file names, or null when there is no file or it names none. */
  stated: string | null;
  latest: string;
  tag: string;
}

/** Compare each plugin article's update file with that plugin's latest stable tag. Plugins without a tag are skipped. */
export function behindReleases(updates: readonly DocUpdate[], latestTags: Partial<Record<PluginName, string>>): BehindArticle[] {
  const behind: BehindArticle[] = [];
  for (const [plugin, docs] of Object.entries(PLUGIN_DOCS) as [PluginName, PluginDocs][]) {
    const tag = latestTags[plugin];
    const latest = tag ? tagVersion(tag) : null;
    if (!tag || !latest) continue;
    for (const article of docs.articles) {
      const update = updates.find(item => item.article === article);
      const stated = update ? scopeVersion(update.version_scope, docs.product) : null;
      if (!stated || compareVersions(stated, latest) < 0) {
        behind.push({ plugin, article, stated: stated && versionText(stated), latest: versionText(latest), tag });
      }
    }
  }
  return behind;
}
