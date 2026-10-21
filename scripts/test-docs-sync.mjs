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
// successful update, a failed publish and its recovery, a duplicate run, admin
// edits that must not be overwritten, a stale job, and version labels.
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
  if (request.method === 'GET' && path === '/issues') return send(200, issues.filter(issue => issue.state === 'open'));
  if (request.method === 'POST' && path === '/issues') {
    const issue = { number: issues.length + 1, state: 'open', comments: [], ...json };
    issues.push(issue);
    return send(201, issue);
  }
  const match = path.match(/^\/issues\/(\d+)(\/comments)?$/);
  const issue = match && issues.find(item => item.number === Number(match[1]));
  if (issue && request.method === 'POST' && match[2]) { issue.comments.push(json.body); return send(201, {}); }
  if (issue && request.method === 'PATCH') { Object.assign(issue, json); return send(200, issue); }
  send(404, {});
}).listen(0, '127.0.0.1');
await once(github, 'listening');

const git = (...args) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' } }).trim();
const file = article => `${REPO}docs/updates/${article}.md`;

function sync(base, token, ...args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', SCRIPT, ...args, '--url', base], {
      cwd: REPO,
      env: { ...process.env, EMDASH_TOKEN: token, CF_ACCESS_CLIENT_ID: '', GITHUB_TOKEN: 'test', GITHUB_REPOSITORY: 'dinkuskit/dinkuskit', GITHUB_API_URL: `http://127.0.0.1:${github.address().port}`, GITHUB_SHA: '0123456789abcdef', DOCS_SYNC_CHECK_TRIES: '3', DOCS_SYNC_CHECK_WAIT_MS: '200' },
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
try {
  await production.ready();
  const base = production.base;
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
  assert.match(openIssue(testOrder).body, /at 0123456/);
  run = await sync(base, token, 'publish', '--report');
  assert.equal(run.code, 0, run.output);
  assert.match(run.output, /^PUBLISHED store-owners\/test-order$/m);
  assert.equal(await liveHash(testOrder), updateHash(docsSite, wanted));
  assert.match(await exportText(testOrder), /Version scope: Commerce 0\.3\.0, Payments 0\.2\.9\n[\s\S]*## After the order\n\nPress \*\*Inspect\*\* to see it\.\n$/);
  assert.equal(openIssue(testOrder), undefined);
  assert.match(issues.at(-1).comments.at(-1), /Resolved at 0123456: the article is live and matches its update file/);
  console.log('PASS failed publish: nothing changed and one issue opened; the next run published it and closed the issue');

  // A duplicate run writes nothing.
  const savedAt = (await api('GET', `/content/docs/test-order`)).data.item.updatedAt;
  run = await sync(base, token, 'publish', '--report');
  assert.equal(run.code, 0, run.output);
  assert.match(run.output, /^LIVE store-owners\/test-order$/m);
  assert.equal((await api('GET', `/content/docs/test-order`)).data.item.updatedAt, savedAt, 'no second save');
  console.log('PASS duplicate run: an update that is already live is left alone');

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
  assert.match(run.output, /^PUBLISHED store-owners\/setup$/m);
  assert.equal(await liveHash(setup), updateHash(docsSite, redone));
  assert.equal(openIssue(setup), undefined);
  console.log('PASS admin edits: a waiting draft and an earlier admin publish both stop the update without overwriting; a fresh pull publishes');

  // A stale job (an older checkout) cannot put older text back.
  const ship = 'reference/ship';
  assert.equal((await sync(base, token, 'pull', ship)).code, 0);
  edit(ship, () => ({}), 'Ship 0.1.0');
  const first = await commit('Ship article, first update');
  assert.match((await sync(base, token, 'publish')).output, /^PUBLISHED reference\/ship$/m);
  assert.equal((await sync(base, token, 'pull', ship)).code, 0);
  const second = edit(ship, () => ({}), 'Ship 0.1.0; Requires Ship 0.2.0 for the kept pass');
  await commit('Ship article, second update');
  assert.match((await sync(base, token, 'publish')).output, /^PUBLISHED reference\/ship$/m);
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
  run = await sync(base, token, 'publish', '--report');
  assert.match(run.output, /^PUBLISHED developers\/webhooks$/m);
  assert.match(run.output, /^PROBLEM reference\/payments: reference\/payments\.md: version_scope "Payments b92ec308" must name a release/m);
  assert.match(await exportText(webhooks), /^Version scope: Unreleased \(on main after Commerce 0\.3\.0\)$/m);
  const search = await (await production.request('/docs/search.json')).json();
  assert.ok(search.some(item => item.id === webhooks && /^Unreleased/.test(item.version)));
  assert.match(await (await production.request('/llms.txt')).text(), /\(https:\/\/dinkuskit\.com\/docs\/markdown\/developers\/webhooks\.md\)/);
  assert.equal((await production.request(`/docs/${webhooks}`)).status, 200);
  assert.ok(openIssue('reference/payments'));
  console.log('PASS version labels: an Unreleased article publishes to the page, Markdown, search and llms.txt; a commit id is refused');

  // Without --report, a problem fails the run.
  run = await sync(base, token, 'publish');
  assert.equal(run.code, 1, run.output);
  console.log('PASS exit code: problems fail the run unless each was reported as an issue');
} finally {
  await production.stop();
  github.close();
}
