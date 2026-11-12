import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import test from 'node:test';
import { chromium } from 'playwright';
import { accountForm, request, signup, startMerchantTestRuntime, stopRuntime } from './helpers/merchant-harness.mjs';

// Normal local consent with the harness's explicit store-proof simulation.
// No hosted session, real processor or remote store is involved.
async function connectStore(runtime, owner, label) {
  const origin = `https://${label}.stores.example`;
  const callback = `${origin}/_emdash/admin/plugins/dinkus-inventory/inventory`;
  const challenge = createHash('sha256').update(randomBytes(32)).digest('base64url');
  const response = await request(runtime, new Map(), '/api/store-connections', {
    method: 'POST', body: JSON.stringify({ protocol_version: 2, client_id: 'dinkus-inventory-emdash',
      service: 'inventory', site_origin: origin, callback_uri: callback,
      code_challenge: challenge, code_challenge_method: 'S256' }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal((await request(runtime, new Map(), '/__proof/receipt', {
    method: 'POST', body: JSON.stringify({ version: 2, connection_id: body.connection_id,
      challenge: body.challenge, client_id: 'dinkus-inventory-emdash', service: 'inventory',
      site_id: body.site_id, site_origin: origin, callback_uri: callback,
      code_challenge: challenge, expires_at: body.expires_at }),
  })).status, 200);
  const approved = await request(runtime, owner, `/account/connect?connection_id=${body.connection_id}`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: await accountForm(runtime, owner, 'action=approve'),
  });
  assert.equal(approved.headers.get('location'), callback);
  return body.site_id;
}

const box = locator => locator.boundingBox();
test('checkout settings keep labels, choices and amounts separate without JavaScript', { timeout: 180_000 }, async t => {
  t.diagnostic('Starting isolated merchant runtime');
  const runtime = await startMerchantTestRuntime();
  const owner = new Map();
  let browser;
  try {
    t.diagnostic('Creating synthetic owner and two stores');
    await signup(runtime, 'settings-layout@example.com', owner);
    const first = await connectStore(runtime, owner, 'settings-one');
    await connectStore(runtime, owner, 'settings-two');
    t.diagnostic('Launching Chromium');
    browser = await chromium.launch({ headless: true });
    const cookies = [...owner.values()].map(pair => {
      const eq = pair.indexOf('=');
      return { name: pair.slice(0, eq), value: pair.slice(eq + 1), url: runtime.origin };
    });
    for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
      t.diagnostic(`Checking ${width}px ${theme}`);
      const context = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled: false, colorScheme: theme });
      context.setDefaultTimeout(10_000);
      context.setDefaultNavigationTimeout(30_000);
      try {
        await context.addCookies(cookies);
        const page = await context.newPage();
        await page.goto(`${runtime.origin}/account/sites`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        const forms = page.locator('form.checkout-settings');
        assert.equal(await forms.count(), 2);
        if (process.env.CHECKOUT_SETTINGS_ARTIFACT_DIR) {
          await mkdir(process.env.CHECKOUT_SETTINGS_ARTIFACT_DIR, { recursive: true });
          await forms.first().screenshot({ path: `${process.env.CHECKOUT_SETTINGS_ARTIFACT_DIR}/${width}-${theme}.png` });
        }
        const ids = await page.locator('[id]').evaluateAll(es => es.map(e => e.id));
        assert.equal(new Set(ids).size, ids.length, 'multiple stores have no duplicate IDs');
        for (const form of await forms.all()) {
          const flat = form.getByRole('textbox', { name: 'Flat shipping charge in dollars', exact: true });
          const over = form.locator('[name=shipping_free_over]');
          assert.equal(await flat.evaluate(e => e.labels.length), 1, 'flat amount has a visible associated label');
          const checkLayout = async (enlarged = false) => {
            const flatBox = await box(flat);
            const overLabel = await box(over.locator('..'));
            assert.ok(overLabel.y >= flatBox.y + flatBox.height + 8, 'threshold label starts below the flat amount');
            const choices = form.getByRole('radio');
            for (const radio of await choices.all()) {
              const label = radio.locator('..');
              assert.ok((await box(label)).height >= 44, 'whole radio label is a touch target');
            }
            const formFits = await form.evaluate(e => {
              const bounds = e.getBoundingClientRect();
              return { left: bounds.left, right: bounds.right, viewport: innerWidth, scroll: e.scrollWidth, client: e.clientWidth };
            });
            assert.ok(formFits.left >= 0 && formFits.right <= formFits.viewport + 1 && formFits.scroll <= formFits.client + 1, `checkout fields fit the viewport and form: ${JSON.stringify(formFits)}`);
            // Global header/list reflow is outside this focused form repair.
            if (!enlarged) assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no page overflow at default text size');
          };
          await checkLayout();
          await form.getByRole('radio', { name: 'Flat amount in dollars', exact: true }).check();
          await flat.fill('5.00');
          await over.fill('75.00');
          assert.equal(await form.getByRole('radio', { name: 'Test (no real money)', exact: true }).isChecked(), true);
          await flat.focus();
          await page.keyboard.press('Tab');
          assert.equal(await over.evaluate(e => e === document.activeElement), true, 'threshold follows flat amount in keyboard order');
          if (width === 390) {
            await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
            await checkLayout(true);
            await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
          }
        }
        // Real native POST and validation in isolated local state, never hosted changes.
        const form = forms.filter({ has: page.locator(`[name=site_id][value="${first}"]`) });
        await form.getByRole('textbox', { name: 'Flat shipping charge in dollars', exact: true }).fill('five');
        await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), form.getByRole('button', { name: 'Save checkout settings' }).click()]);
        assert.match(await page.getByRole('alert').innerText(), /Enter the flat shipping charge in dollars/);
        assert.equal(await page.locator('form.checkout-settings').count(), 2);
      } catch (error) { console.error(`Checkout settings ${width}px ${theme}: ${error.message}`); throw error; }
      finally { await context.close(); }
    }
  } finally { await browser?.close(); await stopRuntime(runtime); }
});
