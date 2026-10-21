// Publishes merged doc updates (docs/updates/<article id>.md) to the site's
// EmDash docs collection without overwriting edits made in the admin.
// GrillTrack decision website-docs-sync-077; see docs/documentation-authoring.md.
//
//   node --experimental-strip-types scripts/docs-sync.mjs pull <article id> [--url <site origin>]
//     Writes docs/updates/<article id>.md from the article's live Markdown
//     export, with base set to that export's hash. Edit it and open a PR.
//
//   node --experimental-strip-types scripts/docs-sync.mjs publish [--url <site origin>] [--report]
//     For every update file: already live, skip; live article still matches
//     base and no admin draft waits, save it with EmDash's _rev and Publish;
//     changed on the site after the file was merged, leave it (superseded);
//     anything else, stop for that article. Then check the article page, its
//     Markdown, search.json and llms.txt, and try an article once more if they
//     don't match. Authenticates with CF_ACCESS_CLIENT_ID and
//     CF_ACCESS_CLIENT_SECRET (an Access service token) or EMDASH_TOKEN.
//     --report opens a GitHub issue per stopped article and closes it once the
//     article is right (GITHUB_TOKEN, GITHUB_REPOSITORY), and exits 0 when
//     every problem was reported.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { markdownPath, searchRecord } from '../src/docs/catalog.ts';
import { docsSite } from '../src/docs/site.ts';
import { NEW_ARTICLE, articleSlug, entryHash, exportHash, parseUpdate, renderUpdate, updateArticle, updateData, updateFromExport, updateHash } from '../src/docs/updates.ts';

const COLLECTION = 'docs';
const ISSUE_PREFIX = 'Docs update stopped: ';
const checkTries = Number(process.env.DOCS_SYNC_CHECK_TRIES ?? 6);
const checkWaitMs = Number(process.env.DOCS_SYNC_CHECK_WAIT_MS ?? 5000);

function siteOrigin(url) {
  const base = new URL(url ?? docsSite.origin);
  if (base.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(base.hostname)) throw new Error('Use an https site origin');
  return base;
}

const fresh = path => `${path}${path.includes('?') ? '&' : '?'}fresh=${Date.now()}`;

async function live(base, article) {
  const response = await fetch(new URL(fresh(markdownPath(article)), base), { redirect: 'manual' });
  if (response.status === 404) return { status: 404, hash: null, markdown: null };
  if (response.status !== 200) throw new Error(`${article}: the Markdown export answered HTTP ${response.status}`);
  const markdown = await response.text();
  return { status: 200, hash: exportHash(markdown), markdown };
}

function updateFiles(dir) {
  const files = [];
  const walk = folder => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.md') && !(folder === dir && entry.name === 'README.md')) files.push(path);
    }
  };
  try { walk(dir); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return files.sort();
}

/** When this version of the file reached the checked-out branch: the newest first-parent commit that touched it. */
function mergedAt(path) {
  try {
    const stamp = execFileSync('git', ['log', '-1', '--first-parent', '--format=%cI', '--', relative(process.cwd(), path)], { encoding: 'utf8' }).trim();
    if (stamp) return new Date(stamp);
  } catch {}
  return null;
}

function emdashApi(base) {
  const headers = { 'content-type': 'application/json', 'x-emdash-request': '1' };
  if (process.env.EMDASH_TOKEN) headers.authorization = `Bearer ${process.env.EMDASH_TOKEN}`;
  if (process.env.CF_ACCESS_CLIENT_ID) {
    headers['cf-access-client-id'] = process.env.CF_ACCESS_CLIENT_ID;
    headers['cf-access-client-secret'] = process.env.CF_ACCESS_CLIENT_SECRET ?? '';
  }
  return async (method, path, body) => {
    const response = await fetch(new URL(`/_emdash/api${path}`, base), { method, headers, redirect: 'manual', body: body && JSON.stringify(body) });
    const payload = await response.json().catch(() => null);
    return { status: response.status, data: payload?.data ?? payload };
  };
}

/**
 * Decide what to do with one update; publish it when that is safe. Every
 * decision comes from one API read of the entry, and the write carries that
 * read's _rev, so an admin change made after the read gets a 409, not overwritten.
 */
async function reconcile(api, update, path) {
  const want = updateHash(docsSite, update);
  const slug = articleSlug(update.article);
  const found = await api('GET', `/content/${COLLECTION}/${slug}`);
  if (found.status !== 200 && found.status !== 404) return { outcome: 'problem', reason: `Reading the article through the EmDash API failed: HTTP ${found.status}. Check the publisher's service token.` };
  const entry = found.status === 200 ? found.data : null;
  const item = entry?.item;
  const published = item?.status === 'published';
  // With a draft waiting, EmDash returns the draft as data and the published values as liveData.
  const liveHash = published ? entryHash(docsSite, slug, item.draftRevisionId ? item.liveData : item.data) : null;
  const pending = item && (item.draftRevisionId || !published) ? entryHash(docsSite, slug, item.data) : null;
  const revision = item ? { revision: item.draftRevisionId ?? item.liveRevisionId ?? null } : {};
  if (liveHash === want) return { outcome: 'live', ...revision };
  // A draft that is exactly this update was saved by an earlier run whose Publish didn't finish.
  const ours = pending !== null && pending === want;
  const matchesBase = update.base === NEW_ARTICLE ? !published && (!item || ours) : liveHash === update.base;
  if (!matchesBase) {
    const merged = mergedAt(path);
    if (item && merged && new Date(item.updatedAt) > merged) return { outcome: 'superseded', reason: 'the site has newer text than this update file (edited in the admin, or published by a later update), so it is left alone', ...revision };
    return { outcome: 'problem', ...revision, reason: update.base === NEW_ARTICLE
      ? 'This is a new article, but an article with the same address already exists on the site.'
      : 'The live article changed after this update was written, so publishing it would overwrite those edits. Run `npm run docs:pull` for the article, redo the change on the new text, and merge that.' };
  }
  if (item && (item.draftRevisionId || !published) && !ours) return { outcome: 'problem', ...revision, reason: 'Unpublished edits are waiting in the admin. Publish or discard them there, then rerun the docs publish workflow.' };

  let saved = entry;
  if (!ours) {
    saved = item
      ? await api('PUT', `/content/${COLLECTION}/${item.id}`, { data: updateData(update), _rev: entry._rev })
      : await api('POST', `/content/${COLLECTION}`, { slug, status: 'draft', data: updateData(update) });
    if (saved.status === 409) return { outcome: 'problem', ...revision, reason: 'The article changed in the admin while it was being published (EmDash answered 409), so nothing was overwritten.' };
    if (saved.status !== 200 && saved.status !== 201) return { outcome: 'problem', ...revision, reason: `Saving through the EmDash API failed: HTTP ${saved.status} ${JSON.stringify(saved.data).slice(0, 300)}` };
    saved = saved.data;
  }
  const done = await api('POST', `/content/${COLLECTION}/${saved.item.id}/publish`, { _rev: saved._rev });
  if (done.status === 409) return { outcome: 'problem', revision: saved.item.draftRevisionId ?? null, reason: 'The article changed in the admin while it was being published (EmDash answered 409). Nothing live was overwritten.' };
  if (done.status !== 200) return { outcome: 'problem', revision: saved.item.draftRevisionId ?? null, reason: `Saved as a draft, but publishing through the EmDash API failed: HTTP ${done.status}. The next run publishes that exact draft.` };
  return { outcome: 'published', revision: done.data?.item?.liveRevisionId ?? null };
}

/** Do the article page, Markdown export, search.json and llms.txt all show this update's content? */
async function shows(base, update) {
  const article = updateArticle(update);
  const record = JSON.stringify(searchRecord(docsSite, article));
  const get = async path => {
    const response = await fetch(new URL(fresh(path), base), { redirect: 'manual' });
    return { status: response.status, body: await response.text() };
  };
  const [page, markdown, search, llms] = await Promise.all([get(`/docs/${update.article}`), get(markdownPath(update.article)), get('/docs/search.json'), get('/llms.txt')]);
  if (page.status !== 200) return `the article page answers HTTP ${page.status}`;
  const embedded = page.body.match(/id="docs-search-data"[^>]*>([\s\S]*?)<\/script>/);
  const pageRecord = embedded && JSON.parse(embedded[1]).find(item => item.id === update.article);
  if (JSON.stringify(pageRecord) !== record) return 'the article page shows different content';
  if (markdown.status !== 200 || exportHash(markdown.body) !== updateHash(docsSite, update)) return 'the Markdown export does not match the update';
  const searchRecordNow = search.status === 200 ? JSON.parse(search.body).find(item => item.id === update.article) : null;
  if (JSON.stringify(searchRecordNow) !== record) return 'search.json does not have the update';
  const line = `- [${article.title}](${docsSite.origin}${markdownPath(update.article)}): ${article.summary}`;
  if (llms.status !== 200 || !llms.body.split('\n').includes(line)) return 'llms.txt does not have the update';
  return null;
}

async function publishAll(base, dir) {
  const api = emdashApi(base);
  const results = [];
  for (const path of updateFiles(dir)) {
    const name = relative(dir, path);
    let update;
    try {
      update = parseUpdate(readFileSync(path, 'utf8'), name);
    } catch (error) {
      results.push({ article: name.replace(/\.md$/, ''), path, outcome: 'problem', reason: error.message });
      continue;
    }
    let result;
    // One more try when something failed or the article doesn't show the update afterwards.
    for (let attempt = 1; attempt <= 2; attempt++) {
      result = await reconcile(api, update, path).catch(error => ({ outcome: 'problem', reason: error.message }));
      if (result.outcome === 'superseded') break;
      if (result.outcome === 'problem') continue;
      let missing = null;
      for (let check = 0; check < checkTries; check++) {
        missing = await shows(base, update).catch(error => `checking it failed: ${error.message}`);
        if (!missing) break;
        await delay(checkWaitMs);
      }
      if (!missing) break;
      result = { ...result, outcome: 'problem', reason: `${result.outcome === 'published' ? 'Published' : 'Live in the admin'}, but ${missing}.` };
    }
    results.push({ article: update.article, path, ...result });
  }
  return results;
}

async function github(method, path, body) {
  const api = process.env.GITHUB_API_URL ?? 'https://api.github.com';
  const response = await fetch(`${api}/repos/${process.env.GITHUB_REPOSITORY}${path}`, {
    method,
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'content-type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`GitHub ${method} ${path}: HTTP ${response.status}`);
  return response.json();
}

/** The commit the run actually checked out, which the workflow keeps at the newest main (GITHUB_SHA is the triggering commit). */
function sourceCommit() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; }
}

/** One open issue per stopped article; closed once the article is right. */
async function report(results) {
  const open = (await github('GET', '/issues?state=open&per_page=100')).filter(issue => !issue.pull_request && issue.title.startsWith(ISSUE_PREFIX));
  const commit = sourceCommit() ? ` at ${sourceCommit().slice(0, 7)}` : '';
  for (const result of results) {
    const title = `${ISSUE_PREFIX}${result.article}`;
    const issue = open.find(item => item.title === title);
    if (result.outcome === 'problem' && !issue) {
      await github('POST', '/issues', { title, body: `The docs publisher stopped for \`${result.article}\`${commit} and left the live article as it was.\n\n${result.reason}\n\nUpdate file: \`${relative(process.cwd(), result.path)}\`${result.revision ? `; EmDash revision \`${result.revision}\`` : ''}. This issue closes itself once the article matches its update file or is edited in the admin afterwards.` });
    } else if (result.outcome !== 'problem' && issue) {
      await github('POST', `/issues/${issue.number}/comments`, { body: `Resolved${commit}: the article is ${result.outcome === 'superseded' ? 'newer on the site than this update file' : 'live and matches its update file'}.` });
      await github('PATCH', `/issues/${issue.number}`, { state: 'closed', state_reason: 'completed' });
    }
  }
}

async function pull(base, article, dir) {
  const now = await live(base, article);
  if (now.status === 404) throw new Error(`${article} is not published on ${base.origin}. For a new article, write the file by hand with base: new, section and order.`);
  const target = join(dir, `${article}.md`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, renderUpdate(updateFromExport(article, now.markdown)));
  console.log(`Wrote ${relative(process.cwd(), target)} from ${base.origin}${markdownPath(article)}. Edit it, then open a PR.`);
}

const { positionals, values } = parseArgs({ allowPositionals: true, options: {
  url: { type: 'string' }, dir: { type: 'string', default: 'docs/updates' }, report: { type: 'boolean', default: false },
} });
const base = siteOrigin(values.url);
if (positionals[0] === 'pull' && positionals[1]) {
  await pull(base, positionals[1], values.dir);
} else if (positionals[0] === 'publish') {
  const results = await publishAll(base, values.dir);
  if (sourceCommit()) console.log(`Update files from ${sourceCommit()}`);
  for (const result of results) console.log(`${result.outcome.toUpperCase()} ${result.article}${result.reason ? `: ${result.reason}` : ''}${result.revision ? ` (revision ${result.revision})` : ''}`);
  if (!results.length) console.log(`No update files in ${values.dir}`);
  const problems = results.filter(result => result.outcome === 'problem').length;
  if (values.report) await report(results);
  if (problems && !values.report) process.exit(1);
} else {
  console.error('Usage: docs-sync.mjs pull <article id> [--url <origin>] | publish [--url <origin>] [--report]');
  process.exit(2);
}
