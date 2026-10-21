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
import { markdownPath } from '../src/docs/catalog.ts';
import { docsSite } from '../src/docs/site.ts';
import { NEW_ARTICLE, articleSlug, exportHash, parseUpdate, renderUpdate, updateData, updateFromExport, updateHash } from '../src/docs/updates.ts';

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

/** Decide what to do with one update; publish it when that is safe. */
async function reconcile(base, api, update, path) {
  const want = updateHash(docsSite, update);
  const now = await live(base, update.article);
  if (now.hash === want) return { outcome: 'live' };
  const found = await api('GET', `/${['content', COLLECTION, articleSlug(update.article)].join('/')}`);
  if (found.status !== 200 && found.status !== 404) return { outcome: 'problem', reason: `Reading the article through the EmDash API failed: HTTP ${found.status}. Check the publisher's service token.` };
  const entry = found.status === 200 ? found.data : null;
  const matchesBase = update.base === NEW_ARTICLE ? now.status === 404 && !entry : now.hash === update.base;
  if (!matchesBase) {
    const merged = mergedAt(path);
    if (entry && merged && new Date(entry.item.updatedAt) > merged) return { outcome: 'superseded', reason: 'the site has newer text than this update file (edited in the admin, or published by a later update), so it is left alone' };
    return { outcome: 'problem', reason: update.base === NEW_ARTICLE
      ? 'This is a new article, but an article with the same address already exists on the site.'
      : 'The live article changed after this update was written, so publishing it would overwrite those edits. Run `npm run docs:pull` for the article, redo the change on the new text, and merge that.' };
  }
  if (entry?.item.draftRevisionId) return { outcome: 'problem', reason: 'Unpublished edits are waiting in the admin. Publish or discard them there, then rerun the docs publish workflow.' };

  let saved;
  if (entry) {
    saved = await api('PUT', `/content/${COLLECTION}/${entry.item.id}`, { data: updateData(update), _rev: entry._rev });
    if (saved.status === 409) return { outcome: 'problem', reason: 'The article changed in the admin while it was being published (EmDash answered 409), so nothing was overwritten.' };
  } else {
    saved = await api('POST', `/content/${COLLECTION}`, { slug: articleSlug(update.article), status: 'draft', data: updateData(update) });
  }
  if (saved.status !== 200 && saved.status !== 201) return { outcome: 'problem', reason: `Saving through the EmDash API failed: HTTP ${saved.status} ${JSON.stringify(saved.data).slice(0, 300)}` };
  const published = await api('POST', `/content/${COLLECTION}/${saved.data.item.id}/publish`, { _rev: saved.data._rev });
  if (published.status === 409) return { outcome: 'problem', reason: 'The article changed in the admin while it was being published (EmDash answered 409). The update is saved as a draft there; nothing live was overwritten.' };
  if (published.status !== 200) return { outcome: 'problem', reason: `Publishing through the EmDash API failed: HTTP ${published.status} ${JSON.stringify(published.data).slice(0, 300)}` };
  return { outcome: 'published' };
}

/** Do the article page, Markdown export, search.json and llms.txt all show this update? */
async function shows(base, update) {
  const want = updateHash(docsSite, update);
  const get = path => fetch(new URL(fresh(path), base), { redirect: 'manual' });
  const [page, now, search, llms] = await Promise.all([get(`/docs/${update.article}`), live(base, update.article), get('/docs/search.json'), get('/llms.txt')]);
  const searchIds = search.status === 200 ? (await search.json()).map(item => item.id) : [];
  const llmsBody = llms.status === 200 ? await llms.text() : '';
  if (page.status !== 200) return `the article page answers HTTP ${page.status}`;
  if (now.hash !== want) return 'the Markdown export does not match the update';
  if (!searchIds.includes(update.article)) return 'search.json does not list it';
  if (!llmsBody.includes(`${docsSite.origin}${markdownPath(update.article)}`)) return 'llms.txt does not list it';
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
    // One more try when the article doesn't show the update afterwards.
    for (let attempt = 1; attempt <= 2; attempt++) {
      result = await reconcile(base, api, update, path).catch(error => ({ outcome: 'problem', reason: error.message }));
      if (result.outcome === 'problem' || result.outcome === 'superseded') break;
      let missing = null;
      for (let check = 0; check < checkTries; check++) {
        missing = await shows(base, update);
        if (!missing) break;
        await delay(checkWaitMs);
      }
      if (!missing) break;
      result = { outcome: 'problem', reason: `Published, but ${missing} after ${attempt === 1 ? 'one try' : 'a second try'}.` };
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

/** One open issue per stopped article; closed once the article is right. */
async function report(results) {
  const open = (await github('GET', '/issues?state=open&per_page=100')).filter(issue => !issue.pull_request && issue.title.startsWith(ISSUE_PREFIX));
  const commit = process.env.GITHUB_SHA ? ` at ${process.env.GITHUB_SHA.slice(0, 7)}` : '';
  for (const result of results) {
    const title = `${ISSUE_PREFIX}${result.article}`;
    const issue = open.find(item => item.title === title);
    if (result.outcome === 'problem' && !issue) {
      await github('POST', '/issues', { title, body: `The docs publisher stopped for \`${result.article}\`${commit} and changed nothing on the site.\n\n${result.reason}\n\nUpdate file: \`${relative(process.cwd(), result.path)}\`. This issue closes itself once the article matches its update file or is edited in the admin afterwards.` });
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
  for (const result of results) console.log(`${result.outcome.toUpperCase()} ${result.article}${result.reason ? `: ${result.reason}` : ''}`);
  if (!results.length) console.log(`No update files in ${values.dir}`);
  const problems = results.filter(result => result.outcome === 'problem').length;
  if (values.report) await report(results);
  if (problems && !values.report) process.exit(1);
} else {
  console.error('Usage: docs-sync.mjs pull <article id> [--url <origin>] | publish [--url <origin>] [--report]');
  process.exit(2);
}
