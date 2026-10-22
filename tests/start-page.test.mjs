import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import { request, signup, startMerchantTestRuntime, stopRuntime } from './helpers/merchant-harness.mjs';

const startStepsSource = readFileSync(new URL('../src/components/StartSteps.astro', import.meta.url), 'utf8');
const startStepsScript = stripTypeScriptTypes(startStepsSource.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '');

function createChecklistHarness(initialSaved = null) {
  const storage = new Map(initialSaved === null ? [] : [['dinkuskit-start-steps', initialSaved]]);
  const elementsById = new Map();
  const makeAttributes = initial => {
    const attrs = new Map(Object.entries(initial));
    return {
      attrs,
      getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
      setAttribute(name, value) {
        const str = String(value);
        attrs.set(name, str);
        if (name === 'id') elementsById.set(str, this);
        if (name === 'title') this.title = str;
      },
      removeAttribute(name) {
        attrs.delete(name);
        if (name === 'title') this.title = '';
      },
    };
  };
  const progress = {
    hidden: true,
    textContent: '',
    dataset: { startProgress: '{done} of {total} done' },
  };
  const done = { hidden: true };
  const steps = ['step-1', 'step-2', 'step-3', 'step-4'].map((key, index) => {
    const listeners = new Map();
    const box = {
      checked: false,
      disabled: false,
      title: '',
      ...makeAttributes({}),
      addEventListener(type, fn) { listeners.set(type, fn); },
      change(checked) {
        box.checked = checked;
        listeners.get('change')?.();
      },
    };
    const label = { title: '', ...makeAttributes({}) };
    const hint = {
      id: `start-step-hint-${index + 1}`,
      className: 'start-hint',
      dataset: { startHint: '' },
      hidden: true,
      textContent: '',
    };
    elementsById.set(hint.id, hint);
    const classes = new Set(['start-step']);
    return {
      dataset: { startStep: key },
      classList: {
        toggle(name, force) {
          if (force) classes.add(name);
          else classes.delete(name);
        },
        contains(name) { return classes.has(name); },
      },
      box,
      label,
      hint,
      querySelector(selector) {
        if (selector === '[data-start-check]') return box;
        if (selector === 'label') return label;
        if (selector === '[data-start-hint]') return hint;
        return null;
      },
      append(child) {
        if (child?.id) elementsById.set(child.id, child);
      },
    };
  });
  const document = {
    querySelectorAll(selector) { return selector === '[data-start-step]' ? steps : []; },
    querySelector(selector) {
      if (selector === '[data-start-progress]') return progress;
      if (selector === '[data-start-done]') return done;
      return null;
    },
    getElementById(id) { return elementsById.get(id) ?? null; },
    createElement() {
      return { id: '', className: '', dataset: {}, hidden: false, textContent: '' };
    },
  };
  const localStorage = {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, String(value)); },
  };
  vm.runInNewContext(startStepsScript, { document, localStorage });
  return { steps, progress, done, localStorage, document };
}

test('start checklist: locks later steps, cascades unticks, and trims out-of-order saves', () => {
  assert.doesNotMatch(
    startStepsSource.replace(/<script>[\s\S]*?<\/script>/, ''),
    /\bdisabled\b/,
    'server HTML leaves checkboxes enabled so the page works without JavaScript',
  );

  // Fresh browser: only step 1 can be ticked; steps 2-4 are disabled with a clear hint.
  const fresh = createChecklistHarness();
  assert.equal(fresh.progress.hidden, false);
  assert.equal(fresh.progress.textContent, '0 of 4 done');
  assert.equal(fresh.done.hidden, true);
  assert.deepEqual(fresh.steps.map(s => s.box.checked), [false, false, false, false]);
  assert.deepEqual(fresh.steps.map(s => s.box.disabled), [false, true, true, true]);
  assert.deepEqual(fresh.steps.map(s => s.classList.contains('is-next')), [true, false, false, false]);
  assert.equal(fresh.steps[0].box.getAttribute('aria-describedby'), null);
  assert.equal(fresh.steps[0].hint.hidden, true);
  for (const step of fresh.steps.slice(1)) {
    const describedBy = step.box.getAttribute('aria-describedby');
    assert.ok(describedBy, 'disabled checkbox has aria-describedby');
    assert.equal(fresh.document.getElementById(describedBy)?.textContent, 'Finish step 1 first');
    assert.equal(step.hint.hidden, false);
    assert.equal(step.box.title, 'Finish step 1 first');
    assert.equal(step.label.title, 'Finish step 1 first');
  }

  // Ticking step 1 enables step 2, updates progress and updates later hints.
  fresh.steps[0].box.change(true);
  assert.equal(fresh.progress.textContent, '1 of 4 done');
  assert.deepEqual(fresh.steps.map(s => s.box.checked), [true, false, false, false]);
  assert.deepEqual(fresh.steps.map(s => s.box.disabled), [false, false, true, true]);
  assert.deepEqual(fresh.steps.map(s => s.classList.contains('is-done')), [true, false, false, false]);
  assert.deepEqual(fresh.steps.map(s => s.classList.contains('is-next')), [false, true, false, false]);
  assert.equal(fresh.steps[1].box.getAttribute('aria-describedby'), null);
  assert.equal(fresh.steps[1].hint.hidden, true);
  assert.equal(fresh.steps[2].hint.textContent, 'Finish step 2 first');
  assert.equal(fresh.localStorage.getItem('dinkuskit-start-steps'), JSON.stringify(['step-1']));

  // Ticking steps 2, 3, and 4 in order completes the checklist.
  fresh.steps[1].box.change(true);
  fresh.steps[2].box.change(true);
  fresh.steps[3].box.change(true);
  assert.equal(fresh.progress.textContent, '4 of 4 done');
  assert.equal(fresh.done.hidden, false);
  assert.deepEqual(fresh.steps.map(s => s.box.checked), [true, true, true, true]);
  assert.deepEqual(fresh.steps.map(s => s.box.disabled), [false, false, false, false]);
  assert.equal(fresh.localStorage.getItem('dinkuskit-start-steps'), JSON.stringify(['step-1', 'step-2', 'step-3', 'step-4']));

  // Unticking step 2 clears and disables steps 3 and 4.
  fresh.steps[1].box.change(false);
  assert.equal(fresh.progress.textContent, '1 of 4 done');
  assert.equal(fresh.done.hidden, true);
  assert.deepEqual(fresh.steps.map(s => s.box.checked), [true, false, false, false]);
  assert.deepEqual(fresh.steps.map(s => s.box.disabled), [false, false, true, true]);
  assert.deepEqual(fresh.steps.map(s => s.classList.contains('is-next')), [false, true, false, false]);
  assert.equal(fresh.steps[2].hint.textContent, 'Finish step 2 first');
  assert.equal(fresh.localStorage.getItem('dinkuskit-start-steps'), JSON.stringify(['step-1']));

  // Unticking step 1 clears and disables steps 2 onward.
  fresh.steps[1].box.change(true);
  assert.equal(fresh.progress.textContent, '2 of 4 done');
  fresh.steps[0].box.change(false);
  assert.equal(fresh.progress.textContent, '0 of 4 done');
  assert.deepEqual(fresh.steps.map(s => s.box.checked), [false, false, false, false]);
  assert.deepEqual(fresh.steps.map(s => s.box.disabled), [false, true, true, true]);
  assert.deepEqual(fresh.steps.map(s => s.classList.contains('is-next')), [true, false, false, false]);
  assert.equal(fresh.steps[1].hint.textContent, 'Finish step 1 first');
  assert.equal(fresh.localStorage.getItem('dinkuskit-start-steps'), JSON.stringify([]));

  // Saved localStorage with step 2 but not step 1 loads as nothing ticked.
  const outOfOrder = createChecklistHarness(JSON.stringify(['step-2']));
  assert.equal(outOfOrder.progress.textContent, '0 of 4 done');
  assert.deepEqual(outOfOrder.steps.map(s => s.box.checked), [false, false, false, false]);
  assert.deepEqual(outOfOrder.steps.map(s => s.box.disabled), [false, true, true, true]);
  assert.equal(outOfOrder.localStorage.getItem('dinkuskit-start-steps'), JSON.stringify([]));

  // Saved localStorage with a gap after step 1 is trimmed to the unbroken prefix from step 1.
  const gapped = createChecklistHarness(JSON.stringify(['step-1', 'step-3', 'step-4']));
  assert.equal(gapped.progress.textContent, '1 of 4 done');
  assert.deepEqual(gapped.steps.map(s => s.box.checked), [true, false, false, false]);
  assert.deepEqual(gapped.steps.map(s => s.box.disabled), [false, false, true, true]);
  assert.equal(gapped.localStorage.getItem('dinkuskit-start-steps'), JSON.stringify(['step-1']));
});

// The page's words come from the CMS (pages entry "start"), which this Worker
// harness does not load; scripts/test-pages-import.mjs draws them. Here: the
// Worker's own part, the signed-in check, never breaks the page or its caching.
test('start page: the signed-in check never breaks the page and nothing is cached', async () => {
  const runtime = await startMerchantTestRuntime();
  try {
    const anonymous = await request(runtime, new Map(), '/start');
    assert.equal(anonymous.headers.get('cache-control'), 'private, no-store');
    const owner = await signup(runtime, 'start-owner@example.com');
    const bogus = new Map([['better-auth.session_token', 'better-auth.session_token=not-a-session']]);
    for (const jar of [owner.jar, bogus]) {
      const response = await request(runtime, jar, '/start');
      assert.equal(response.status, anonymous.status, 'same answer signed in, signed out or with a stale cookie');
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.match(await response.text(), /href="\/start" aria-current="page"/);
    }
  } finally {
    await stopRuntime(runtime);
  }
});
