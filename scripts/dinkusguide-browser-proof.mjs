import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Run against fixtures/guide-preview, never a production store or real model.
const base = process.env.GUIDE_PREVIEW_URL ?? 'http://127.0.0.1:4398';
const out = process.env.GUIDE_PROOF_DIR ?? '.local/dinkusguide-ui';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Only a loopback fixture is allowed');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = [], errors = [], externalRequests = [];
const askPath = '/_emdash/api/plugins/r_guide_preview/ask';
const mark = (name) => results.push({ name, status: 'pass' });
const dialogText = (p) => p.locator('deep-chat').evaluate((el) => el.shadowRoot.textContent);
async function open(p, path = '/') {
  await p.goto(base + path);
  await p.getByRole('button', { name: 'Ask DinkusGuide', exact: true }).click();
  await p.waitForFunction(() => document.querySelector('textarea')?.disabled === false);
}
async function ask(p, text, completed = 'Answer complete') {
  await p.getByRole('textbox', { name: 'Your question' }).fill(text);
  await p.getByRole('button', { name: 'Ask', exact: true }).click();
  await p.getByRole('status').filter({ hasText: completed }).waitFor();
}
try {
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, colorScheme: 'light' });
  const page = await context.newPage();
  const asks = [], chunks = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.origin !== new URL(base).origin && ['http:', 'https:'].includes(u.protocol)) externalRequests.push(u.origin);
    if (u.pathname === askPath) asks.push(r.postDataJSON());
    if (/deep[-_]chat|deepChat/.test(u.pathname)) chunks.push(u.pathname);
  });
  await page.goto(base + '/');
  assert.equal(asks.length, 0); assert.equal(chunks.length, 0);
  await page.getByRole('button', { name: 'Ask DinkusGuide', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('textarea')?.disabled === false);
  assert.equal(asks.length, 0); assert.ok(chunks.length > 0); mark('lazy load; opening makes no inference request');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog').evaluate(el => el.open), false);
  assert.equal(await page.getByRole('button', { name: 'Ask DinkusGuide', exact: true }).evaluate(el => el === document.activeElement), true);
  mark('keyboard opening, Escape close and focus return');
  await open(page);
  await ask(page, 'How does Commerce work?');
  assert.deepEqual(asks.at(-1), { question: 'How does Commerce work?' });
  assert.ok((await dialogText(page)).includes('Synthetic answer: How does Commerce work?'));
  await page.screenshot({ path: `${out}/desktop.png` }); mark('completed answer and citation on desktop');
  const beforeHostile = asks.length;
  const hostile = '<script>alert(1)</script> [bad](javascript:alert(1)) ![image](https://evil.test/tracking)';
  await ask(page, hostile);
  assert.equal(asks.length, beforeHostile + 1);
  assert.ok((await dialogText(page)).includes(hostile));
  const unsafe = await page.locator('deep-chat').evaluate(el => el.shadowRoot.querySelectorAll('a,img,script,iframe').length);
  assert.equal(unsafe, 0); assert.deepEqual(externalRequests, []); mark('HTML/Markdown and unverified links remain inert');
  await ask(page, '😀'.repeat(2000));
  assert.equal([...asks.at(-1).question].length, 2000);
  const count = asks.length;
  await page.getByRole('textbox', { name: 'Your question' }).fill('😀'.repeat(2001));
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'too long' }).waitFor();
  assert.equal(asks.length, count); mark('Unicode limit boundary and above-limit local rejection');
  await ask(page, 'unsafe-link', 'unavailable'); mark('unsafe backend citation refused');
  await ask(page, 'overloaded', 'busy'); mark('overload has stable safe feedback');
  await ask(page, 'unavailable', 'unavailable'); mark('upstream failure has safe feedback');
  await ask(page, 'slow', 'too long to answer');
  assert.equal(await page.getByRole('button', { name: 'Ask', exact: true }).isEnabled(), true); mark('deadline recovers input controls');
  await page.getByRole('textbox', { name: 'Your question' }).fill('wait');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel question', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'cancelled' }).waitFor();
  assert.ok(!(await dialogText(page)).includes('Synthetic answer: wait')); mark('cancellation suppresses late response');
  for (const path of ['/account', '/account/sign-in']) {
    await page.goto(base + path); assert.equal(await page.locator('[data-dinkusguide]').count(), 0);
  }
  mark('account surfaces have no widget');
  const other = await browser.newContext(); const otherPage = await other.newPage();
  await Promise.all([open(page), open(otherPage)]);
  await Promise.all([ask(page, 'visitor-one-unique'), ask(otherPage, 'visitor-two-unique')]);
  assert.ok(!(await dialogText(page)).includes('visitor-two-unique'));
  assert.ok(!(await dialogText(otherPage)).includes('visitor-one-unique')); mark('interleaved isolated visitor contexts');
  await page.reload(); await open(page);
  assert.ok(!(await dialogText(page)).includes('visitor-one-unique')); mark('no transcript persistence after reload');
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 1, colorScheme: 'light' });
  const mp = await mobile.newPage(); await open(mp, '/start'); await ask(mp, 'How do I start?');
  const box = await mp.locator('dialog').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 391 && box.y >= 0 && box.y + box.height <= 845);
  await mp.screenshot({ path: `${out}/mobile.png` }); mark('mobile panel fits viewport and completes request');
  const lightColors = await mp.locator('deep-chat').evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, ink: getComputedStyle(el).color }));
  await mp.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  const darkColors = await mp.locator('deep-chat').evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, ink: getComputedStyle(el).color }));
  assert.notEqual(lightColors.bg, darkColors.bg); assert.notEqual(lightColors.ink, darkColors.ink);
  await mp.screenshot({ path: `${out}/mobile-dark.png` }); mark('site theme tokens reach dialog and shadow-rendered chat');
  assert.deepEqual(errors, []);
  await writeFile(`${out}/browser-results.json`, JSON.stringify({ fixture: base, source: 'synthetic Guide transport; real Site layout and Deep Chat', results, errors, externalRequests }, null, 2));
  console.log(JSON.stringify({ passed: results.length, results }, null, 2));
} finally { await browser.close(); }
