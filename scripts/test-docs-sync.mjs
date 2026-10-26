import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { exportHash, parseUpdate, renderUpdate, updateHash } from '../src/docs/updates.ts';
import { docsSite } from '../src/docs/site.ts';
import { WORK, resetDatabase, start, unusedPort } from './lib/docs-preview.mjs';

// Drives scripts/docs-sync.mjs against the docs preview fixture (a throwaway
// EmDash SQLite database with all thirteen articles published), from a
// throwaway Git repository and a stand-in GitHub issues API. Covers a
// successful update, a failed publish and its recovery, a duplicate run, a
// stale surface, admin edits that must not be overwritten (including a race
// between the read and the save), a save whose Publish failed, a waiting draft
// an editor touched, plugin releases through the import (which never replaces
// a previous release that is not live yet), placement owned by the admin, a
// stale job, version labels, and an unreachable site.
const SCRIPT = new URL('./docs-sync.mjs', import.meta.url).pathname;
const REPO = new URL('./docs-sync-repo/', WORK).pathname;

// Stand-in for the GitHub issues API the --report option uses.
const issues = [];
const github = createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  const json = body ? JSON.parse(body) : null;
  const send = (status, data) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(data)); };
  const path = new URL(request.url, 'http://x').pathname.replace('/repos/dinkuskit/dinkuskit', '');
  if (request.method === 'GET' && path === '/issues') {
    const query = new URL(request.url, 'http://x').searchParams;
    const size = Number(query.get('per_page') ?? 30);
    const page = Number(query.get('page') ?? 1);
    return send(200, issues.filter(issue => issue.state === 'open').slice((page - 1) * size, page * size));
  }
  if (request.method === 'POST' && path === '/issues') {
    const issue = { number: issues.length + 1, state: 'open', comments: [], ...json };
    issues.push(issue);
    return send(201, issue);
  }
  // A plugin's stable GitHub release, for docs-sync.mjs release.
  const tagged = path.match(/^\/repos\/dinkuskit\/(commerce|payments|ship)\/releases\/tags\/(v[\d.]+)$/);
  if (request.method === 'GET' && tagged) return send(200, { tag_name: tagged[2], draft: false, prerelease: false, published_at: '2026-10-26T12:00:00Z' });
  const match = path.match(/^\/issues\/(\d+)(\/comments)?$/);
  const issue = match && issues.find(item => item.number === Number(match[1]));
  if (issue && request.method === 'POST' && match[2]) { issue.comments.push(json.body); return send(201, {}); }
  if (issue && request.method === 'PATCH') { Object.assign(issue, json); return send(200, issue); }
  send(404, {});
}).listen(0, '127.0.0.1');
await once(github, 'listening');
// Other open issues fill the first page, so the publisher's issues are found only by reading every page.
for (let number = 1; number <= 120; number++) issues.push({ number, state: 'open', comments: [], title: `Unrelated issue ${number}` });

const gitIn = cwd => (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' } }).trim();
const git = gitIn(REPO);
const file = article => `${REPO}docs/updates/${article}.md`;

function sync(base, token, ...args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', SCRIPT, ...args, '--url', base], {
      cwd: REPO,
      env: { ...process.env, EMDASH_TOKEN: token, CF_ACCESS_CLIENT_ID: '', GITHUB_TOKEN: 'test', GITHUB_REPOSITORY: 'dinkuskit/dinkuskit', GITHUB_API_URL: `http://127.0.0.1:${github.address().port}`, DOCS_SYNC_CHECK_TRIES: '3', DOCS_SYNC_CHECK_WAIT_MS: '200', DOCS_SYNC_RELEASE_WAIT_MS: '200' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', reject);
    child.on('exit', code => resolve({ code, output }));
  });
}

/** Commit the working tree; Git dates have one-second resolution, so keep commits and admin saves apart. */
async function commit(message) {
  await delay(1100);
  git('add', '-A');
  git('commit', '-q', '-m', message);
  await delay(1100);
  return git('rev-parse', 'HEAD');
}

/** A pulled file keeps the live version scope, which may still be commit ids; the edit sets a release first. */
function edit(article, change, versionScope) {
  if (versionScope) writeFileSync(file(article), readFileSync(file(article), 'utf8').replace(/^version_scope: .*$/m, `version_scope: ${JSON.stringify(versionScope)}`));
  const update = parseUpdate(readFileSync(file(article), 'utf8'), `${article}.md`);
  writeFileSync(file(article), renderUpdate({ ...update, ...change(update) }));
  return parseUpdate(readFileSync(file(article), 'utf8'), `${article}.md`);
}

const openIssue = article => issues.find(issue => issue.state === 'open' && issue.title === `Docs update stopped: ${article}`);

await resetDatabase();
let token;
const development = start('development', await unusedPort());
try {
  await development.ready();
  const bypass = await (await development.request('/_emdash/api/setup/dev-bypass?token=1', { method: 'POST' })).json();
  token = bypass.data?.token;
  assert.ok(token, 'dev setup returned an API token');
  const api = (path, options = {}) => development.request(`/_emdash/api${path}`, { ...options, headers: { authorization: `Bearer ${token}`, 'x-emdash-request': '1', 'content-type': 'application/json', ...options.headers } });
  const list = await (await api('/content/docs?limit=50')).json();
  const entries = list.data?.items ?? [];
  assert.equal(entries.length, 13, 'the seed has 13 articles');
  for (const entry of entries) assert.equal((await api(`/content/docs/${entry.id}/publish`, { method: 'POST' })).status, 200);
} finally {
  await development.stop();
}

// The production build serves the same database: drafts never show, the API takes the token.
const production = start('production', await unusedPort());
let proxy;
try {
  await production.ready();
  // The publisher talks to the site through this proxy, which can fail or delay chosen requests.
  const faults = { publishFailures: 0, beforePut: null, staleSearch: null, dropLlms: false, putStatuses: [] };
  proxy = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const path = new URL(request.url, 'http://x').pathname;
    if (faults.dropLlms && path === '/llms.txt') return request.socket.destroy();
    if (faults.staleSearch && path === '/docs/search.json') { response.writeHead(200, { 'content-type': 'application/json' }); return response.end(faults.staleSearch); }
    if (request.method === 'POST' && /^\/_emdash\/api\/content\/docs\/[^/]+\/publish$/.test(path) && faults.publishFailures) {
      faults.publishFailures--;
      response.writeHead(503, { 'content-type': 'application/json' });
      return response.end('{}');
    }
    if (request.method === 'PUT' && faults.beforePut) { const hook = faults.beforePut; faults.beforePut = null; await hook(); }
    const headers = Object.fromEntries(['authorization', 'x-emdash-request', 'content-type'].filter(name => request.headers[name]).map(name => [name, request.headers[name]]));
    const forwarded = await production.request(request.url, { method: request.method, headers, body: body || undefined });
    if (request.method === 'PUT') faults.putStatuses.push(forwarded.status);
    response.writeHead(forwarded.status, { 'content-type': forwarded.headers.get('content-type') ?? 'text/plain' });
    response.end(Buffer.from(await forwarded.arrayBuffer()));
  }).listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  const base = `http://127.0.0.1:${proxy.address().port}`;
  const api = async (method, path, body) => {
    const response = await production.request(`/_emdash/api${path}`, { method, headers: { authorization: `Bearer ${token}`, 'x-emdash-request': '1', 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
    return { status: response.status, data: (await response.json()).data };
  };
  const exportText = async article => (await production.request(`/docs/markdown/${article}.md`)).text();
  const liveHash = async article => exportHash(await exportText(article));
  assert.equal((await production.request('/llms.txt')).status, 200, 'all 13 articles are published');

  rmSync(REPO, { recursive: true, force: true });
  mkdirSync(REPO, { recursive: true });
  git('init', '-q', '-b', 'main');
  writeFileSync(`${REPO}README.md`, 'Throwaway repository for the docs publisher test.\n');
  await commit('Start');

  // Pull writes the live article with its hash as base; an unchanged pull is already live.
  const testOrder = 'store-owners/test-order';
  let run = await sync(base, token, 'pull', testOrder);
  assert.equal(run.code, 0, run.output);
  assert.equal(readFileSync(file(testOrder), 'utf8').match(/^base: (.*)$/m)[1], await liveHash(testOrder));
  console.log('PASS pull: the update file starts from the live article, with its hash as base');

  // A failed publish changes nothing and opens one issue; the next run recovers and closes it.
  const before = await liveHash(testOrder);
  const wanted = edit(testOrder, update => ({ body: `${update.body}\n\n## After the order\n\nPress **Inspect** to see it.` }), 'Commerce 0.3.0, Payments 0.2.9');
  await commit('Update the test order article');
  run = await sync(base, 'not-a-token', 'publish', '--report');
  assert.equal(run.code, 0, run.output);
  assert.match(run.output, /^PROBLEM store-owners\/test-order: Reading the article through the EmDash API failed: HTTP 401/m);
  assert.equal(await liveHash(testOrder), before, 'nothing changed on the site');
  assert.ok(openIssue(testOrder), 'an issue says where it stopped');
  const head = git('rev-parse', '--short=7', 'HEAD');
  assert.ok(openIssue(testOrder).body.includes(`at ${head}`), 'the issue names the checked-out commit');
  run = await sync(base, token, 'publish', '--report');
  assert.equal(run.code, 0, run.output);
  assert.match(run.output, /^PUBLISHED store-owners\/test-order( \(revision [^)]+\))?$/m);
  assert.equal(await liveHash(testOrder), updateHash(docsSite, wanted));
  assert.match(await exportText(testOrder), /Version scope: Commerce 0\.3\.0, Payments 0\.2\.9\n[\s\S]*## After the order\n\nPress \*\*Inspect\*\* to see it\.\n$/);
  assert.equal(openIssue(testOrder), undefined);
  assert.match(issues.at(-1).comments.at(-1), new RegExp(`Resolved at ${head}: the article is live and matches its update file`));
  console.log('PASS failed publish: nothing changed and one issue opened; the next run published it and closed the issue');

  // A duplicate run writes nothing.
  const savedAt = (await api('GET', `/content/docs/test-order`)).data.item.updatedAt;
  run = await sync(base, token, 'publish', '--report');
  assert.equal(run.code, 0, run.output);
  assert.match(run.output, /^LIVE store-owners\/test-order( \(revision [^)]+\))?$/m);
  assert.equal((await api('GET', `/content/docs/test-order`)).data.item.updatedAt, savedAt, 'no second save');
  console.log('PASS duplicate run: an update that is already live is left alone');

  // A surface still serving old content is caught, not reported healthy.
  faults.staleSearch = JSON.stringify(JSON.parse(await (await production.request('/docs/search.json')).text()).map(item => item.id === testOrder ? { ...item, text: 'Old text.' } : item));
  run = await sync(base, token, 'publish', '--report');
  assert.equal(run.code, 0, run.output);
  assert.match(run.output, /^PROBLEM store-owners\/test-order: Live in the admin, but search\.json does not have the update\./m);
  assert.ok(openIssue(testOrder));
  faults.staleSearch = null;
  run = await sync(base, token, 'publish', '--report');
  assert.match(run.output, /^LIVE store-owners\/test-order/m);
  assert.equal(openIssue(testOrder), undefined);
  console.log('PASS stale surface: search.json with old content is a problem until it matches, then the issue closes');

  // Admin edits: a waiting draft stops the update; a published admin edit made before the merge stops it too.
  const setup = 'store-owners/setup';
  assert.equal((await sync(base, token, 'pull', setup)).code, 0);
  edit(setup, update => ({ summary: `${update.summary} Updated by a merge.` }), 'Commerce 0.3.0, Payments 0.2.9');
  const setupEntry = (await api('GET', '/content/docs/setup')).data;
  const adminSave = await api('PUT', `/content/docs/${setupEntry.item.id}`, { data: { summary: 'Edited in the admin.' } });
  assert.equal(adminSave.status, 200, JSON.stringify(adminSave.data));
  const setupLive = await liveHash(setup);
  await commit('Update the setup article');
  run = await sync(base, token, 'publish', '--report');
  assert.match(run.output, /^PROBLEM store-owners\/setup: Unpublished edits are waiting in the admin/m);
  assert.equal(await liveHash(setup), setupLive, 'the live article is untouched');
  assert.match((await api('GET', '/content/docs/setup')).data.item.data.summary, /^Edited in the admin\.$/, 'the admin draft is untouched');
  assert.ok(openIssue(setup));
  assert.equal((await api('POST', `/content/docs/${setupEntry.item.id}/publish`, {})).status, 200);
  const adminLive = await liveHash(setup);
  edit(setup, update => ({ summary: `${update.summary} Again.` }));
  await commit('Update the setup article again, still on the old text');
  run = await sync(base, token, 'publish', '--report');
  assert.match(run.output, /^PROBLEM store-owners\/setup: The live article changed after this update was written/m);
  assert.equal(await liveHash(setup), adminLive, 'the admin edit stays live');
  assert.match(await exportText(setup), /^# .*\n\nEdited in the admin\.\n/);
  assert.equal(issues.filter(issue => issue.title === `Docs update stopped: ${setup}`).length, 1, 'one issue per article, not one per run');
  // Pulling the new text and merging that publishes it and closes the issue.
  assert.equal((await sync(base, token, 'pull', setup)).code, 0);
  const redone = edit(setup, () => ({ summary: 'Edited in the admin. Updated by a merge.' }), 'Commerce 0.3.0, Payments 0.2.9');
  await commit('Redo the setup update on the admin text');
  run = await sync(base, token, 'publish', '--report');
  assert.match(run.output, /^PUBLISHED store-owners\/setup( \(revision [^)]+\))?$/m);
  assert.equal(await liveHash(setup), updateHash(docsSite, redone));
  assert.equal(openIssue(setup), undefined);
  console.log('PASS admin edits: a waiting draft and an earlier admin publish both stop the update without overwriting; a fresh pull publishes');

  // An admin publish that lands between the publisher's read and its save gets a 409, not overwritten.
  const ai = 'ai-assistants';
  assert.equal((await sync(base, token, 'pull', ai)).code, 0);
  edit(ai, update => ({ summary: `${update.summary} From a merge.` }), 'Commerce 0.3.0');
  await commit('Update the assistants article');
  const aiEntry = (await api('GET', '/content/docs/ai-assistants')).data;
  faults.beforePut = async () => {
    assert.equal((await api('PUT', `/content/docs/${aiEntry.item.id}`, { data: { summary: 'Admin got there first.' } })).status, 200);
    assert.equal((await api('POST', `/content/docs/${aiEntry.item.id}/publish`, {})).status, 200);
  };
  faults.putStatuses = [];
  run = await sync(base, token, 'publish', '--report');
  assert.deepEqual(faults.putStatuses, [409], 'the save carried the revision it read and was refused');
  assert.match(run.output, /^SUPERSEDED ai-assistants: the site has newer text/m);
  assert.match(await exportText(ai), /^# .*\n\nAdmin got there first\.\n/);
  console.log('PASS race: an admin publish between the read and the save is refused with 409 and stays live');

  // A save that worked but a Publish that failed: the next run publishes exactly that draft.
  const help = 'troubleshooting';
  assert.equal((await sync(base, token, 'pull', help)).code, 0);
  const helpUpdate = edit(help, update => ({ body: `${update.body}\n\n## If Publish fails\n\nRun the workflow again.` }), 'Commerce 0.3.0');
  const helpBefore = await liveHash(help);
  await commit('Update the troubleshooting article');
  faults.publishFailures = 2;
  run = await sync(base, token, 'publish', '--report');
  assert.match(run.output, /^PROBLEM troubleshooting: Saved as a draft, but publishing through the EmDash API failed: HTTP 503/m);
  assert.equal(await liveHash(help), helpBefore, 'the live article is unchanged');
  assert.ok((await api('GET', '/content/docs/troubleshooting')).data.item.draftRevisionId, 'the update waits as a draft');
  assert.ok(openIssue(help));
  run = await sync(base, token, 'publish', '--report');
  assert.match(run.output, /^PUBLISHED troubleshooting/m);
  assert.equal(await liveHash(help), updateHash(docsSite, helpUpdate));
  assert.equal(openIssue(help), undefined);
  console.log('PASS partial publish: after a failed Publish the next run publishes the exact saved draft and closes the issue');

  // A Publish that failed, then an editor touched only the sidebar name in that waiting draft: not ours, so it stays unpublished.
  const contribute = 'developers/contribute';
  assert.equal((await sync(base, token, 'pull', contribute)).code, 0);
  edit(contribute, update => ({ summary: `${update.summary} From a merge.` }), 'Commerce 0.3.0');
  const contributeBefore = await liveHash(contribute);
  const contributeLabel = (await api('GET', '/content/docs/contribute')).data.item.data.nav_label;
  await commit('Update the contribute article');
  faults.publishFailures = 2;
  run = await sync(base, token, 'publish', '--report');
  assert.match(run.output, /^PROBLEM developers\/contribute: Saved as a draft, but publishing/m);
  const waiting = (await api('GET', '/content/docs/contribute')).data.item;
  assert.equal((await api('PUT', `/content/docs/${waiting.id}`, { data: { nav_label: 'Edited by an editor' } })).status, 200);
  run = await sync(base, token, 'publish', '--report');
  assert.match(run.output, /^PROBLEM developers\/contribute: Unpublished edits are waiting in the admin/m);
  const contributeNow = (await api('GET', '/content/docs/contribute')).data.item;
  assert.equal(await liveHash(contribute), contributeBefore, 'the live article is unchanged');
  assert.equal((contributeNow.liveData ?? contributeNow.data).nav_label, contributeLabel, 'the editor\'s sidebar name is not published');
  assert.equal(contributeNow.data.nav_label, 'Edited by an editor', 'the editor\'s draft is kept');
  // Once the editor discards that draft, the update goes through.
  assert.equal((await api('POST', `/content/docs/${waiting.id}/discard-draft`, {})).status, 200);
  run = await sync(base, token, 'publish', '--report');
  assert.match(run.output, /^PUBLISHED developers\/contribute/m);
  assert.equal(openIssue(contribute), undefined);
  console.log('PASS touched draft: an editor change to any field of the waiting draft stops recovery and nothing unreviewed is published; after a discard the update goes through');

  // Plugin releases through the import, from a stand-in checkout of the plugin's tag: a release never replaces the previous one before it is live.
  const paymentsArticle = 'reference/payments';
  assert.equal((await sync(base, token, 'pull', paymentsArticle)).code, 0);
  await commit('Start the Payments article from the site');
  const pulledPayments = readFileSync(file(paymentsArticle), 'utf8');
  const plugin = new URL('./docs-sync-plugin/', WORK).pathname;
  rmSync(plugin, { recursive: true, force: true });
  mkdirSync(`${plugin}docs/website/reference`, { recursive: true });
  const pluginGit = gitIn(plugin);
  pluginGit('init', '-q', '-b', 'main');
  const pluginRelease = (tag, note, wait = '0') => {
    writeFileSync(`${plugin}docs/website/reference/payments.md`, `${pulledPayments.replace(/^base: .*\n/m, '').replace(/^version_scope: .*$/m, 'version_scope: "Payments {{version}}"').trimEnd()}\n\n## In this release\n\n${note} (Payments {{version}}).\n`);
    pluginGit('add', '-A');
    pluginGit('commit', '-q', '--allow-empty', '-m', tag);
    return sync(base, token, 'release', 'payments', tag, '--from', plugin, '--wait', wait);
  };
  const paymentsFile = () => parseUpdate(readFileSync(file(paymentsArticle), 'utf8'), 'reference/payments.md');
  // Release A builds on the live article; its Publish fails after the save.
  const paymentsBefore = await liveHash(paymentsArticle);
  run = await pluginRelease('v0.5.0', 'First');
  assert.equal(run.code, 0, run.output);
  const paymentsA = paymentsFile();
  assert.equal(paymentsA.base, paymentsBefore);
  assert.equal(paymentsA.version_scope, 'Payments 0.5.0');
  await commit('Docs: reference/payments from payments v0.5.0');
  faults.publishFailures = 2;
  run = await sync(base, token, 'publish', '--report');
  assert.match(run.output, /^PROBLEM reference\/payments: Saved as a draft, but publishing/m);
  // Release B waits for A, and stops without writing anything while A is not live.
  run = await pluginRelease('v0.6.0', 'Second', '1');
  assert.equal(run.code, 1, run.output);
  assert.match(run.output, /reference\/payments: waiting for docs\/updates\/reference\/payments\.md \(Payments 0\.5\.0\) to go live/);
  assert.match(run.output, /docs\/updates\/reference\/payments\.md \(Payments 0\.5\.0\) is not live yet, and v0\.6\.0 must not replace text the site never showed/);
  assert.equal(renderUpdate(paymentsFile()), renderUpdate(paymentsA), 'release A\'s update file is kept');
  assert.equal(await liveHash(paymentsArticle), paymentsBefore, 'the live article is unchanged');
  assert.ok((await api('GET', '/content/docs/payments')).data.item.draftRevisionId, 'release A still waits as a draft');
  // Docs publish then publishes A from its draft, and B goes through on top of it.
  run = await sync(base, token, 'publish', '--report');
  assert.match(run.output, /^PUBLISHED reference\/payments/m);
  assert.equal(await liveHash(paymentsArticle), updateHash(docsSite, paymentsA));
  run = await pluginRelease('v0.6.0', 'Second');
  assert.equal(run.code, 0, run.output);
  const paymentsB = paymentsFile();
  assert.equal(paymentsB.base, updateHash(docsSite, paymentsA), 'release B builds on the live release A');
  await commit('Docs: reference/payments from payments v0.6.0');
  run = await sync(base, token, 'publish', '--report');
  assert.match(run.output, /^PUBLISHED reference\/payments( \(revision [^)]+\))?$/m);
  assert.equal(await liveHash(paymentsArticle), updateHash(docsSite, paymentsB));
  assert.equal(openIssue(paymentsArticle), undefined);
  // The same release again changes nothing.
  run = await pluginRelease('v0.6.0', 'Second');
  assert.equal(run.code, 0, run.output);
  assert.match(run.output, /reference\/payments already has dinkuskit\/payments v0\.6\.0/);
  assert.equal(renderUpdate(paymentsFile()), renderUpdate(paymentsB));
  // A release that arrives while the previous one is still publishing waits for it, then builds on it.
  run = await pluginRelease('v0.7.0', 'Third');
  assert.equal(run.code, 0, run.output);
  const paymentsC = paymentsFile();
  await commit('Docs: reference/payments from payments v0.7.0');
  const waitingRelease = pluginRelease('v0.8.0', 'Fourth', '60');
  await delay(1500);
  assert.match((await sync(base, token, 'publish', '--report')).output, /^PUBLISHED reference\/payments/m);
  run = await waitingRelease;
  assert.equal(run.code, 0, run.output);
  assert.match(run.output, /waiting for docs\/updates\/reference\/payments\.md \(Payments 0\.7\.0\) to go live/);
  const paymentsD = paymentsFile();
  assert.equal(paymentsD.base, updateHash(docsSite, paymentsC), 'release D builds on release C once it is live');
  await commit('Docs: reference/payments from payments v0.8.0');
  run = await sync(base, token, 'publish', '--report');
  assert.match(run.output, /^PUBLISHED reference\/payments/m);
  assert.equal(await liveHash(paymentsArticle), updateHash(docsSite, paymentsD));
  console.log('PASS plugin releases: a release waits for the previous one to go live and otherwise stops without writing; once it is live the next builds on it, and the same release twice changes nothing');

  // Sidebar name, section and order of an existing article belong to the admin: an update file that sets them is refused before anything is read or written.
  const commerce = 'reference/commerce';
  assert.equal((await sync(base, token, 'pull', commerce)).code, 0);
  const commerceBefore = (await api('GET', '/content/docs/commerce')).data.item;
  assert.equal((await api('PUT', `/content/docs/${commerceBefore.id}`, { data: { nav_label: 'Commerce (admin)', order: 81 } })).status, 200);
  assert.equal((await api('POST', `/content/docs/${commerceBefore.id}/publish`, {})).status, 200);
  writeFileSync(file(commerce), readFileSync(file(commerce), 'utf8').replace(/^version_scope: .*$/m, 'version_scope: "Commerce 0.3.0"\nnav_label: "Commerce plugin"\norder: 75'));
  await commit('Try to rename the Commerce article in the sidebar from a stale update');
  faults.putStatuses = [];
  run = await sync(base, token, 'publish', '--report');
  assert.match(run.output, /^PROBLEM reference\/commerce: reference\/commerce\.md: nav_label can be set only for a new article; change it in the admin/m);
  assert.deepEqual(faults.putStatuses, [], 'nothing was written');
  const commerceNow = (await api('GET', '/content/docs/commerce')).data.item.data;
  assert.deepEqual([commerceNow.nav_label, commerceNow.order], ['Commerce (admin)', 81], 'the admin\'s published sidebar name and order stay');
  // Without the placement lines the same update goes through and keeps the admin's placement.
  writeFileSync(file(commerce), readFileSync(file(commerce), 'utf8').replace(/^nav_label: .*\norder: .*\n/m, ''));
  await commit('Update the Commerce article without placement');
  run = await sync(base, token, 'publish', '--report');
  assert.match(run.output, /^PUBLISHED reference\/commerce( \(revision [^)]+\))?$/m);
  const commerceAfter = (await api('GET', '/content/docs/commerce')).data.item.data;
  assert.deepEqual([commerceAfter.nav_label, commerceAfter.order, commerceAfter.version_scope], ['Commerce (admin)', 81, 'Commerce 0.3.0']);
  assert.match(await (await production.request(`/docs/${commerce}`)).text(), />Commerce \(admin\)</);
  assert.equal(openIssue(commerce), undefined);
  console.log('PASS placement: an update setting an existing article\'s sidebar name or order is refused before any write; the admin\'s placement stays through later updates');

  // A stale job (an older checkout) cannot put older text back.
  const ship = 'reference/ship';
  assert.equal((await sync(base, token, 'pull', ship)).code, 0);
  edit(ship, () => ({}), 'Ship 0.1.0');
  const first = await commit('Ship article, first update');
  assert.match((await sync(base, token, 'publish')).output, /^PUBLISHED reference\/ship( \(revision [^)]+\))?$/m);
  assert.equal((await sync(base, token, 'pull', ship)).code, 0);
  const second = edit(ship, () => ({}), 'Ship 0.1.0; Requires Ship 0.2.0 for the kept pass');
  await commit('Ship article, second update');
  assert.match((await sync(base, token, 'publish')).output, /^PUBLISHED reference\/ship( \(revision [^)]+\))?$/m);
  git('checkout', '-q', first);
  run = await sync(base, token, 'publish');
  git('checkout', '-q', 'main');
  assert.equal(run.code, 0, run.output);
  assert.match(run.output, /^SUPERSEDED reference\/ship: the site has newer text than this update file/m);
  assert.equal(await liveHash(ship), updateHash(docsSite, second), 'the newer update stays live');
  console.log('PASS stale job: a run from an older checkout leaves the newer article live');

  // A new article labelled Unreleased publishes; a commit id is refused and blocks nothing else.
  const webhooks = 'developers/webhooks';
  mkdirSync(`${REPO}docs/updates/developers`, { recursive: true });
  writeFileSync(file(webhooks), renderUpdate({ article: webhooks, base: 'new', title: 'Receive order webhooks', summary: 'Get a call when an order is paid.', audience: 'Developers', product: 'Commerce', version_scope: 'Unreleased (on main after Commerce 0.3.0)', section: 'Developers', order: 75, body: '## Before you start\n\nThis is not in a release yet.' }));
  writeFileSync(file('reference/payments'), renderUpdate({ article: 'reference/payments', base: `sha256:${'0'.repeat(64)}`, title: 'Payments', summary: 'Payments.', audience: 'Developers', product: 'Payments', version_scope: 'Payments b92ec308', body: 'Text.' }));
  await commit('Add a webhooks article and a badly labelled update');
  faults.publishFailures = 2;
  run = await sync(base, token, 'publish', '--report');
  assert.match(run.output, /^PROBLEM developers\/webhooks: Saved as a draft, but publishing/m);
  assert.equal((await production.request(`/docs/${webhooks}`)).status, 404, 'a new article stays unpublished');
  run = await sync(base, token, 'publish', '--report');
  assert.match(run.output, /^PUBLISHED developers\/webhooks( \(revision [^)]+\))?$/m);
  assert.match(run.output, /^PROBLEM reference\/payments: reference\/payments\.md: version_scope "Payments b92ec308" must name a release/m);
  assert.match(await exportText(webhooks), /^Version scope: Unreleased \(on main after Commerce 0\.3\.0\)$/m);
  const search = await (await production.request('/docs/search.json')).json();
  assert.ok(search.some(item => item.id === webhooks && /^Unreleased/.test(item.version)));
  assert.match(await (await production.request('/llms.txt')).text(), /\(https:\/\/dinkuskit\.com\/docs\/markdown\/developers\/webhooks\.md\)/);
  assert.equal((await production.request(`/docs/${webhooks}`)).status, 200);
  assert.ok(openIssue('reference/payments'));
  console.log('PASS version labels: an Unreleased article publishes to the page, Markdown, search and llms.txt; a commit id is refused');

  // A check that cannot reach the site is reported per article; the run still finishes and reports.
  faults.dropLlms = true;
  run = await sync(base, token, 'publish', '--report');
  faults.dropLlms = false;
  assert.equal(run.code, 0, run.output);
  assert.match(run.output, /^PROBLEM store-owners\/test-order: Live in the admin, but checking it failed: fetch failed/m);
  assert.match(run.output, /^PROBLEM developers\/webhooks: Live in the admin, but checking it failed/m);
  assert.ok(openIssue(testOrder) && openIssue(webhooks));
  run = await sync(base, token, 'publish', '--report');
  assert.equal(openIssue(testOrder), undefined);
  assert.equal(openIssue(webhooks), undefined);
  console.log('PASS unreachable site: each article gets its own problem and issue, and the next good run closes them');

  // Without --report, a problem fails the run.
  run = await sync(base, token, 'publish');
  assert.equal(run.code, 1, run.output);
  console.log('PASS exit code: problems fail the run unless each was reported as an issue');
} finally {
  await production.stop();
  github.close();
  proxy?.close();
}
