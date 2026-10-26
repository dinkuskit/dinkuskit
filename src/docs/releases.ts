/**
 * Reference articles that plugin repositories keep beside their code and
 * publish at a stable release (GrillTrack decision
 * `website-docs-from-plugin-releases-086`).
 *
 * A plugin keeps `docs/website/<article id>.md`: an update file without
 * `base`, reviewed in the same PR as the code it describes. `{{version}}` and
 * `{{release_date}}` stand for the release that ships it. At a stable release
 * the plugin presses **Docs from a plugin release** here, which fills them in,
 * sets `base` from the live article (see `releaseBase`), and pushes the file
 * to `docs/updates/` on main, so the publisher's admin-edit guard still
 * applies. A release never replaces an update that is not live yet. The twice-monthly check compares each live article's version scope
 * with the plugin's latest stable release.
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

/** The previous release's update is not live yet, so a newer one must not replace it. */
export class NotLiveYet extends Error {}

/**
 * The `base` for a release's update, from this repository's current update
 * file for the article (`previous`) and the live article's export hash
 * (`liveHash`, null when it is not published):
 *
 * - live shows `previous`: it was published, so the new update builds on it.
 * - live still matches `previous.base`: `previous` is not live yet (its
 *   publish is waiting, or stopped with an issue). A release must not replace
 *   it, since it would build on text the site never showed: null.
 * - anything else: the article changed in the admin. The update builds on
 *   `previous`, so Docs publish stops with an issue instead of overwriting.
 *
 * An article published without any update file here is refused: start one
 * with `npm run docs:pull` so its live text has been reviewed.
 */
export function releaseBase(site: DocsSite, article: string, previous: DocUpdate | undefined, liveHash: string | null) {
  if (!previous) {
    if (liveHash) throw new Error(`${article} is live but has no docs/updates/${article}.md; run npm run docs:pull -- ${article} and merge it first`);
    return NEW_ARTICLE;
  }
  const published = updateHash(site, previous);
  if (liveHash === published) return published;
  if (liveHash === (previous.base === NEW_ARTICLE ? null : previous.base)) return null;
  return published;
}

/**
 * The update file a stable release publishes for one article, on the base
 * `releaseBase` picks. The same release again returns `previous` as it is,
 * live or not, so a rerun changes nothing. A newer release while `previous`
 * is not live yet throws `NotLiveYet`; the import waits and tries again, and
 * otherwise stops without writing anything.
 */
export function releaseUpdate(input: { site: DocsSite; plugin: PluginName; article: string; source: string; tag: string; date: Date; previous?: DocUpdate; liveHash: string | null }): DocUpdate {
  const { site, plugin, article, source, tag, date, previous, liveHash } = input;
  const docs: PluginDocs = PLUGIN_DOCS[plugin];
  const where = `${docs.repository} ${tag} ${PLUGIN_ARTICLE_DIR}/${article}.md`;
  if (!docs.articles.includes(article)) throw new Error(`${where}: ${plugin} does not publish ${article}`);
  const version = tagVersion(tag);
  if (!version) throw new Error(`${where}: ${tag} is not a stable vX.Y.Z tag`);
  const filled = fillRelease(source, version, date);
  if (!filled.startsWith('---\n')) throw new Error(`${where}: no frontmatter`);
  if (/^base:/m.test(filled.split('\n---\n', 1)[0])) throw new Error(`${where}: leave base out; it is set when the release is published`);
  const withBase = (base: string) => parseUpdate(filled.replace('---\n', `---\nbase: ${base}\n`), `${article}.md`);
  if (previous) {
    let again: DocUpdate | undefined;
    try { again = withBase(previous.base); } catch {}
    if (again && renderUpdate(again) === renderUpdate(previous)) return previous;
  }
  const base = releaseBase(site, article, previous, liveHash);
  const update = withBase(base ?? previous!.base);
  const stated = scopeVersion(update.version_scope, docs.product);
  if (!stated || compareVersions(stated, version) !== 0) {
    throw new Error(`${where}: version_scope "${update.version_scope}" must name ${docs.product} ${versionText(version)}; write "${docs.product} {{version}}"`);
  }
  const published = previous && scopeVersion(previous.version_scope, docs.product);
  if (published && compareVersions(version, published) < 0) {
    throw new Error(`${where}: the site already describes ${docs.product} ${versionText(published)}, which is newer than ${tag}`);
  }
  if (base === null) {
    throw new NotLiveYet(`${article}: docs/updates/${article}.md (${previous!.version_scope}) is not live yet, and ${tag} must not replace text the site never showed. Let Docs publish publish it (if it stopped, its "Docs update stopped" issue says why), then run this release again.`);
  }
  return update;
}

/** An article whose live version scope is older than its plugin's latest stable release. */
export interface BehindArticle {
  plugin: PluginName;
  article: string;
  /** The version the live article names, or null when it is not published or names none. */
  stated: string | null;
  latest: string;
  tag: string;
}

/** The version scope a live Markdown export states, or null when it has none. */
export const exportVersionScope = (markdown: string) => markdown.match(/^Version scope: (.*)$/m)?.[1] ?? null;

/**
 * Compare each plugin article's live version scope with that plugin's latest
 * stable tag. `liveScopes` maps an article ID to its live version scope, or
 * null when it is not published; an article left out could not be read and is
 * skipped, as is a plugin without a stable tag.
 */
export function behindReleases(liveScopes: Readonly<Record<string, string | null>>, latestTags: Partial<Record<PluginName, string>>): BehindArticle[] {
  const behind: BehindArticle[] = [];
  for (const [plugin, docs] of Object.entries(PLUGIN_DOCS) as [PluginName, PluginDocs][]) {
    const tag = latestTags[plugin];
    const latest = tag ? tagVersion(tag) : null;
    if (!tag || !latest) continue;
    for (const article of docs.articles) {
      if (!Object.hasOwn(liveScopes, article)) continue;
      const scope = liveScopes[article];
      const stated = scope ? scopeVersion(scope, docs.product) : null;
      if (!stated || compareVersions(stated, latest) < 0) {
        behind.push({ plugin, article, stated: stated && versionText(stated), latest: versionText(latest), tag });
      }
    }
  }
  return behind;
}
