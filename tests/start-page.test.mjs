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
  // The progress bar: the script adds one segment per step.
  const makeClassList = () => {
    const classes = new Set();
    return { toggle(name, force) { if (force) classes.add(name); else classes.delete(name); }, contains(name) { return classes.has(name); } };
  };
  const bar = { hidden: true, segments: [], appendChild(child) { bar.segments.push(child); return child; } };
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
      if (selector === '[data-start-bar]') return bar;
      return null;
    },
    getElementById(id) { return elementsById.get(id) ?? null; },
    createElement() {
      return { id: '', className: '', dataset: {}, hidden: false, textContent: '', classList: makeClassList() };
    },
  };
  const localStorage = {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, String(value)); },
  };
  vm.runInNewContext(startStepsScript, { document, localStorage });
  return { steps, progress, done, bar, localStorage, document };
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
  assert.equal(fresh.bar.hidden, false);
  assert.equal(fresh.bar.segments.length, 4, 'one bar segment per step');
  assert.deepEqual(fresh.bar.segments.map(s => s.classList.contains('is-next')), [true, false, false, false]);
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
  assert.deepEqual(fresh.bar.segments.map(s => s.classList.contains('is-done')), [true, false, false, false], 'the bar fills as steps are ticked');
  assert.deepEqual(fresh.bar.segments.map(s => s.classList.contains('is-next')), [false, true, false, false]);
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

test('plugin 3D .glb cubes: binary glTF 2.0 assets, zero-any runtime, and reusable component contract', async () => {
  const { PLUGIN_LOGOS, PLUGIN_MODELS } = await import('../src/components/plugin-logos.ts');
  for (const name of ['Commerce', 'Payments', 'Inventory', 'Ship']) {
    assert.ok(PLUGIN_LOGOS[name], `2D fallback logo exists for ${name}`);
    assert.equal(PLUGIN_MODELS[name], `/models/plugins/${name.toLowerCase()}.glb`);
    const glbBytes = readFileSync(new URL(`../public${PLUGIN_MODELS[name]}`, import.meta.url));
    assert.ok(glbBytes.byteLength > 50_000, `${name} .glb has substantive PBR mesh payload`);
    assert.equal(glbBytes.toString('ascii', 0, 4), 'glTF', `${name} .glb starts with glTF 2.0 binary magic`);
    assert.equal(glbBytes.readUInt32LE(4), 2, `${name} .glb version is 2`);
    assert.equal(glbBytes.readUInt32LE(8), glbBytes.byteLength, `${name} .glb header length matches file size`);
  }
  const runtimeSource = readFileSync(new URL('../src/fx/plugin-cubes-3d.ts', import.meta.url), 'utf8');
  const cubeComponentSource = readFileSync(new URL('../src/components/PluginCube3D.astro', import.meta.url), 'utf8');
  const pluginRowSource = readFileSync(new URL('../src/components/PluginRow.astro', import.meta.url), 'utf8');
  assert.doesNotMatch(runtimeSource, /\bany\b/u, 'plugin-cubes-3d.ts obeys the zero-any TypeScript contract');
  assert.doesNotMatch(cubeComponentSource, /\bany\b/u, 'PluginCube3D.astro obeys the zero-any TypeScript contract');
  assert.match(
    runtimeSource,
    /if\s*\(\s*window\.location\.protocol\s*===\s*'file:'\s*&&\s*!win\.DINKUS_PLUGIN_CUBES_GLB_B64\s*\)/,
    'plugin-cubes-3d.ts only loads base64 GLB bundle on file: protocol so HTTP/HTTPS pages fetch /models/plugins/*.glb directly',
  );
  assert.match(
    runtimeSource,
    /loader\.load\(modelUrl,\s*onModelLoaded,\s*undefined,\s*onModelError\)/,
    'plugin-cubes-3d.ts passes onModelError to GLTFLoader.load so failed .glb requests clean up WebGL resources and keep 2D fallback visible',
  );
  assert.match(
    runtimeSource,
    /renderer\.dispose\(\)/,
    'plugin-cubes-3d.ts disposes WebGLRenderer on .glb load failure',
  );
  assert.match(
    runtimeSource,
    /reduceMotion\.addEventListener\('change',\s*syncReducedMotion\)/,
    'plugin-cubes-3d.ts listens for live prefers-reduced-motion: reduce changes and halts rAF / restores 2D fallback',
  );
  assert.match(cubeComponentSource, /data-plugin-cube=\{plugin\}/);
  assert.match(cubeComponentSource, /data-plugin-model=\{modelSrc\}/);
  assert.match(cubeComponentSource, /data-plugin-cube-fallback/);
  assert.match(pluginRowSource, /data-plugin-cube-fallback/);

  function readGlbJson(relPath) {
    const buf = readFileSync(new URL(relPath, import.meta.url));
    const jsonLen = buf.readUInt32LE(12);
    assert.equal(buf.toString('ascii', 16, 20), 'JSON');
    return JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  }

  const shipGltf = readGlbJson('../public/models/plugins/ship.glb');
  const shipNodeNames = shipGltf.nodes.map(n => n.name);
  assert.deepEqual(
    shipNodeNames,
    ['parcel_body', 'flap_left', 'flap_right', 'edge_inlay', 'tape_back', 'tape_top', 'tape_front', 'DinkusPluginCubeRoot'],
    'ship.glb exposes articulated left/right top flaps and dual-side (-Z back, top, +Z front) kraft tape nodes',
  );
  const parcelBodyMesh = shipGltf.meshes[shipGltf.nodes.find(n => n.name === 'parcel_body').mesh];
  const parcelPosAccessor = shipGltf.accessors[parcelBodyMesh.primitives[0].attributes.POSITION];
  assert.ok(parcelPosAccessor.max[1] >= 0.935, 'parcel_body walls extend up to the top neon edge frame without a floating gap');
  const shipMatNames = shipGltf.materials.map(m => m.name);
  assert.ok(shipMatNames.includes('ship_kraft_rim'), 'ship.glb uses warm cut-kraft rim material on inner flap lips');
  const tapeBackNode = shipGltf.nodes.find(n => n.name === 'tape_back');
  const tapeFrontNode = shipGltf.nodes.find(n => n.name === 'tape_front');
  assert.equal(tapeBackNode.translation[2], -0.88, 'tape_back hinges over the -Z back edge');
  assert.equal(tapeFrontNode.translation[2], 0.88, 'tape_front hinges over the +Z front edge');
  assert.match(runtimeSource, /const shipT = t - inst\.phaseOffset;/, 'Ship cycle time is independent of DOM card index');
  assert.match(runtimeSource, /inst\.tapeBack\.rotation\.x = \(1(?:\.0)? - tapeBackP\) \* 0\.48;/, 'tape_back folds outward on -Z');
  assert.match(runtimeSource, /inst\.tapeFront\.rotation\.x = -\(1(?:\.0)? - tapeFrontP\) \* 0\.55;/, 'tape_front folds outward on +Z');

  const commerceGltf = readGlbJson('../public/models/plugins/commerce.glb');
  const commerceMats = commerceGltf.materials.map(m => m.name);
  assert.ok(commerceMats.includes('commerce_asterisk_floor'), 'commerce.glb defines commerce_asterisk_floor');
  assert.ok(commerceMats.includes('commerce_asterisk_wall'), 'commerce.glb defines commerce_asterisk_wall');
  const wallMat = commerceGltf.materials.find(m => m.name === 'commerce_asterisk_wall');
  const wallEmSum = (wallMat.emissiveFactor ?? [0, 0, 0]).reduce((a, b) => a + b, 0);
  assert.ok(wallEmSum < 0.08, 'commerce_asterisk_wall stays below the isGlow threshold so recessed walls remain dark');
  for (const token of ['flap_left', 'flap_right', 'tape_back', 'tape_top', 'tape_front', 'commerce_asterisk_floor']) {
    assert.ok(runtimeSource.includes(token), `plugin-cubes-3d.ts binds ${token}`);
  }
});


