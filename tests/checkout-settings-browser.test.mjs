import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import test from 'node:test';
import { chromium } from 'playwright';
import { startMerchantTestRuntime, stopRuntime } from './helpers/merchant-harness.mjs';
import { checkoutSettingsFixture, settingsPost } from './helpers/checkout-settings-fixture.mjs';

const box = locator => locator.boundingBox();
test('store tabs and independent settings saves work without JavaScript', { timeout: 240_000 }, async t => {
  const runtime = await startMerchantTestRuntime();
  let browser;
  try {
    const { owner, first, second, cookies } = await checkoutSettingsFixture(runtime);
    browser = await chromium.launch({ headless: true });
    for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
      t.diagnostic(`Checking ${width}px ${theme}`);
      // Reset only this synthetic fixture. Never submit settings to the hosted account.
      await settingsPost(runtime, owner, first, { action: 'checkout_settings', shipping_mode: 'free', payments_mode: 'test' });
      await settingsPost(runtime, owner, first, { action: 'service', service: 'ship', on: '0' });
      const context = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled: false, colorScheme: theme });
      context.setDefaultTimeout(10_000);
      context.setDefaultNavigationTimeout(30_000);
      try {
        await context.addCookies(cookies);
        const page = await context.newPage();
        await page.goto(`${runtime.origin}/account/sites`, { waitUntil: 'domcontentloaded' });
        const card = page.locator(`[id="store-${first}"]`);
        const other = page.locator(`[id="store-${second}"]`);
        const current = c => c.locator('.store-tabs [aria-current=page]');
        assert.equal(await current(card).innerText(), 'Shipping', 'connected Commerce defaults to Shipping');
        assert.equal(await current(other).innerText(), 'Plugins', 'without Commerce, default to Plugins');
        const ids = await page.locator('[id]').evaluateAll(es => es.map(e => e.id));
        assert.equal(new Set(ids).size, ids.length, 'multiple stores have no duplicate IDs');
        const checkLayout = async (enlarged = false) => {
          for (const label of await card.locator('.checkout-choice').all()) assert.ok((await box(label)).height >= 44);
          const nav = card.locator('.store-tabs');
          for (const link of await nav.getByRole('link').all()) {
            assert.ok((await box(link)).height >= 44, 'native links have 44px targets');
            assert.ok(new URL(await link.getAttribute('href'), runtime.origin).searchParams.get('store') === first);
          }
          const tabs = await nav.getByRole('link').all();
          assert.equal((await box(tabs[0])).y, (await box(tabs[2])).y, 'tabs never wrap');
          const bounds = await card.evaluate(e => ({ scroll: e.scrollWidth, client: e.clientWidth, left: e.getBoundingClientRect().left, right: e.getBoundingClientRect().right, viewport: innerWidth }));
          assert.ok(bounds.scroll <= bounds.client + 1 && bounds.left >= 0 && bounds.right <= bounds.viewport + 1, `card fits: ${JSON.stringify(bounds)}`);
          if (!enlarged) assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no page overflow at default text size');
        };
        const capture = async tab => {
          if (!process.env.CHECKOUT_SETTINGS_ARTIFACT_DIR || theme !== 'light') return;
          await mkdir(process.env.CHECKOUT_SETTINGS_ARTIFACT_DIR, { recursive: true });
          await card.screenshot({ path: `${process.env.CHECKOUT_SETTINGS_ARTIFACT_DIR}/${tab}-${width}.png` });
        };
        const open = async tab => {
          await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), card.locator('.store-tabs').getByRole('link', { name: tab, exact: true }).click()]);
          assert.equal(await current(card).innerText(), tab);
          assert.equal(await current(other).innerText(), 'Plugins', 'another store retains its default');
          await checkLayout();
        };
        const save = async name => {
          await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), card.getByRole('button', { name, exact: true }).click()]);
        };
        const json = async () => JSON.parse(await card.locator('pre code').innerText());
        const flat = card.locator('[name=shipping_amount]');
        const over = card.locator('[name=shipping_free_over]');
        assert.equal(await flat.isVisible(), false, 'Free hides irrelevant amount boxes');
        assert.equal(await card.locator('[name=payments_mode]').count(), 0, 'Shipping never submits Payments');
        await card.getByRole('radio', { name: 'Flat charge per order', exact: true }).check();
        assert.equal(await flat.isVisible(), true, 'CSS reveals Flat without JavaScript');
        assert.equal(await flat.evaluate(e => e.labels.length), 1);
        await flat.fill('5.00'); await over.fill('75.00');
        const flatBox = await box(flat), overLabel = await box(over.locator('../..'));
        assert.ok(overLabel.y >= flatBox.y + flatBox.height + 8, 'threshold follows amount on its own row');
        await flat.focus(); await page.keyboard.press('Tab');
        assert.equal(await over.evaluate(e => e === document.activeElement), true, 'keyboard amount → threshold');
        await checkLayout();
        if (width === 390) {
          await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
          await checkLayout(true);
          await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
        }
        await save('Save shipping');
        let saved = await json();
        assert.equal(saved.mode, 'test');
        assert.deepEqual(saved.shipping.amount, { currency: 'USD', minor: '500' });
        assert.deepEqual(saved.shipping.freeOver, { currency: 'USD', minor: '7500' });
        // A fresh GET proves durable read-back without resubmitting the POST.
        await page.goto(page.url(), { waitUntil: 'domcontentloaded' });
        assert.equal(await flat.inputValue(), '5.00'); assert.equal(await over.inputValue(), '75.00');
        await capture('shipping');
        await open('Payments');
        assert.equal(await card.locator('[name=shipping_mode]').count(), 0, 'Payments never submits Shipping');
        assert.equal(await card.getByRole('radio', { name: 'Test No real money moves', exact: true }).isChecked(), true);
        await capture('payments');
        const shippingBeforePayments = saved.shipping;
        // Live is a local saved preference with simulated status, never a processor operation.
        await card.getByRole('radio', { name: 'Live Takes real money once Payments is live too', exact: true }).check();
        await save('Save payments'); saved = await json();
        assert.equal(saved.mode, 'live');
        assert.deepEqual(saved.shipping, shippingBeforePayments, 'saving Payments preserves all Shipping fields and revision');
        const revision = saved.shipping.revision;
        await open('Shipping');
        await flat.fill('6.00'); await save('Save shipping'); saved = await json();
        assert.equal(saved.mode, 'live', 'saving Shipping preserves nondefault Payments mode');
        assert.equal(saved.shipping.revision, revision + 1);
        await open('Payments');
        await card.getByRole('radio', { name: 'Test No real money moves', exact: true }).check();
        await save('Save payments'); saved = await json();
        assert.equal(saved.mode, 'test'); assert.equal(saved.shipping.amount.minor, '600');
        assert.equal(saved.shipping.revision, revision + 1, 'saving Payments leaves Shipping revision unchanged');
        await open('Shipping');
        await flat.fill('five'); await save('Save shipping');
        assert.match(await card.getByRole('alert').innerText(), /Enter the flat shipping charge in dollars/);
        assert.equal(await current(card).innerText(), 'Shipping', 'validation stays on submitted tab');
        await flat.fill('6.00'); await over.fill('0'); await save('Save shipping');
        assert.match(await card.getByRole('alert').innerText(), /Enter the free-shipping amount/);
        await card.getByRole('radio', { name: 'Free shipping on every order', exact: true }).check();
        assert.equal(await flat.isVisible(), false);
        await save('Save shipping'); saved = await json();
        assert.equal(saved.shipping.mode, 'free'); assert.equal('amount' in saved.shipping, false); assert.equal('freeOver' in saved.shipping, false);
        await open('Plugins');
        assert.equal(await card.getByRole('list', { name: 'Connected plugins' }).count(), 1);
        assert.equal(await card.getByRole('button', { name: 'Disconnect Commerce', exact: true }).count(), 1);
        assert.equal(await card.getByRole('button', { name: 'Turn on Ship', exact: true }).count(), 1);
        assert.equal(await card.locator('.checkout-settings').count(), 0);
        await capture('plugins');
        await save('Turn on Ship');
        assert.equal(await current(card).innerText(), 'Plugins', 'service change returns to Plugins');
        assert.equal(await card.getByRole('button', { name: 'Turn off Ship', exact: true }).count(), 1);
        // Unknown links fall back per store; they neither reveal another store nor write settings.
        await page.goto(`${runtime.origin}/account/sites?store=unknown&tab=shipping`);
        assert.equal(await current(card).innerText(), 'Shipping'); assert.equal(await current(other).innerText(), 'Plugins');
      } finally { await context.close(); }
    }
  } finally { await browser?.close(); await stopRuntime(runtime); }
});
