import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const switchSource = readFileSync(new URL('../src/components/ThemeSwitch.astro', import.meta.url), 'utf8');
const switchScript = stripTypeScriptTypes(switchSource.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '');
const layoutSource = readFileSync(new URL('../src/layouts/Site.astro', import.meta.url), 'utf8');
const headScript = layoutSource.match(/<script is:inline>([\s\S]*?)<\/script>/)?.[1] ?? '';
const css = readFileSync(new URL('../src/styles/site.css', import.meta.url), 'utf8');

// A page with the header switch: the visitor's system setting, this browser's
// storage (or none, as in some private windows) and <html>.
function createPage({ systemDark = false, saved = null, storage = true } = {}) {
  const store = new Map(saved === null ? [] : [['dinkuskit-theme', saved]]);
  const localStorage = {
    getItem(key) { if (!storage) throw new Error('storage refused'); return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { if (!storage) throw new Error('storage refused'); store.set(key, String(value)); },
  };
  const systemListeners = [];
  const system = {
    matches: systemDark,
    addEventListener(type, fn) { if (type === 'change') systemListeners.push(fn); },
  };
  const root = { dataset: {} };
  const clickListeners = [];
  const attrs = new Map([['aria-pressed', 'false']]);
  const button = {
    hidden: true,
    getAttribute(name) { return attrs.get(name) ?? null; },
    setAttribute(name, value) { attrs.set(name, String(value)); },
    addEventListener(type, fn) { if (type === 'click') clickListeners.push(fn); },
  };
  const context = vm.createContext({
    localStorage,
    matchMedia: query => { assert.equal(query, '(prefers-color-scheme: dark)'); return system; },
    document: { documentElement: root, querySelector: selector => (selector === '[data-theme-switch]' ? button : null) },
  });
  return {
    store, root, button,
    runHead() { vm.runInContext(headScript, context); },
    runSwitch() { vm.runInContext(switchScript, context); },
    press() { for (const fn of clickListeners) fn(); },
    systemTurns(dark) { system.matches = dark; for (const fn of systemListeners) fn(); },
    pressed() { return button.getAttribute('aria-pressed'); },
  };
}

test('the switch shows the system setting until pressed, then keeps the choice', () => {
  const page = createPage({ systemDark: false });
  page.runHead();
  page.runSwitch();
  assert.equal(page.button.hidden, false, 'the switch shows once its script runs');
  assert.equal(page.root.dataset.theme, undefined, 'no choice yet: the page follows the system setting');
  assert.equal(page.pressed(), 'false');
  page.systemTurns(true);
  assert.equal(page.pressed(), 'true', 'with no choice the switch follows a system change');
  page.press();
  assert.equal(page.root.dataset.theme, 'light');
  assert.equal(page.store.get('dinkuskit-theme'), 'light');
  assert.equal(page.pressed(), 'false');
  page.systemTurns(false);
  page.systemTurns(true);
  assert.equal(page.root.dataset.theme, 'light', 'a choice outlasts system changes');
  assert.equal(page.pressed(), 'false');
  page.press();
  assert.equal(page.root.dataset.theme, 'dark');
  assert.equal(page.store.get('dinkuskit-theme'), 'dark');
  assert.equal(page.pressed(), 'true');
});

test('the head script applies a kept choice before the switch loads, and ignores anything else', () => {
  const kept = createPage({ systemDark: false, saved: 'dark' });
  kept.runHead();
  assert.equal(kept.root.dataset.theme, 'dark', 'applied by the head script alone');
  kept.runSwitch();
  assert.equal(kept.pressed(), 'true');

  const keptLight = createPage({ systemDark: true, saved: 'light' });
  keptLight.runHead();
  keptLight.runSwitch();
  assert.equal(keptLight.root.dataset.theme, 'light');
  assert.equal(keptLight.pressed(), 'false');

  const odd = createPage({ systemDark: true, saved: 'blue' });
  odd.runHead();
  odd.runSwitch();
  assert.equal(odd.root.dataset.theme, undefined, 'an unknown stored value is ignored');
  assert.equal(odd.pressed(), 'true');
});

test('a browser that refuses storage still switches for the open page', () => {
  const page = createPage({ systemDark: false, storage: false });
  assert.doesNotThrow(() => page.runHead());
  page.runSwitch();
  assert.doesNotThrow(() => page.press());
  assert.equal(page.root.dataset.theme, 'dark');
  assert.equal(page.pressed(), 'true');
});

test('every palette color has a light and a dark value, and the switch sets the scheme', () => {
  const tokens = css.match(/:root \{\n  --paper[\s\S]*?\n\}/)?.[0] ?? '';
  for (const name of ['paper', 'ink', 'muted', 'line', 'line-soft', 'surface', 'surface-soft', 'accent', 'accent-wash', 'accent-line', 'button', 'button-ink', 'button-hover', 'error']) {
    assert.match(tokens, new RegExp(`--${name}: light-dark\\(#[0-9a-f]{6}, #[0-9a-f]{6}\\);`), `--${name} has both halves`);
  }
  assert.match(css, /:root\[data-theme="light"\] \{ color-scheme: light; \}/);
  assert.match(css, /:root\[data-theme="dark"\] \{ color-scheme: dark; \}/);
  assert.doesNotMatch(css, /prefers-color-scheme/, 'one palette, no second copy of the dark colors');
});
