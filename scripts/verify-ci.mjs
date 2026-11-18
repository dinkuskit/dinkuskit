#!/usr/bin/env node
// Runs one part of `npm run verify` for the Website checks workflow, which splits the
// chain across parallel jobs so a pull request waits for the slowest part, not the sum.
//
// The steps come from package.json's `verify` script, in its order, so `npm run verify`
// stays the one list. Merchant and accounts name their steps; every other step, including
// one added to `verify` later, runs in the site part, so a split run can never skip it.
// A part that names a step `verify` no longer runs, or a step named twice, fails every
// job. The shared setup steps run in every part, since each needs a built site.
//
//   node scripts/verify-ci.mjs merchant | accounts | site
//   node scripts/verify-ci.mjs --check     (the plan only, no steps run)
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Run in every part, in their place in `verify`: the generated SQL, local setup,
// Wrangler types and the built site that the later tests start.
const SHARED = new Set(['setup', 'types:wrangler', 'build']);

// Balanced by the step times of run 44328024458 (18 Nov 2026): about 4.5 minutes each.
const PARTS = {
  merchant: ['test:merchant'],
  accounts: [
    'test:agent-routes',
    'test:inventory-runner',
    'test:shared-store',
    'test:foundation',
    'test:checkout-settings-browser',
    'test:inventory-overview',
    'test:organization-approvals',
    'test:operator-admin',
    'test:dev-cms',
    'test:cloudflare-candidate',
  ],
};
const SITE = 'site'; // every other step

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const chain = manifest.scripts.verify.split('&&').map(part => {
  const match = part.trim().match(/^npm run (\S+)$/);
  if (!match) throw new Error(`verify step is not "npm run <script>": ${part.trim()}`);
  return match[1];
});

const claimed = new Map();
for (const [name, steps] of Object.entries(PARTS)) {
  for (const step of steps) {
    if (!chain.includes(step)) throw new Error(`${name} claims ${step}, which verify no longer runs`);
    if (SHARED.has(step)) throw new Error(`${step} is shared and runs in every part`);
    if (claimed.has(step)) throw new Error(`${step} is claimed by ${claimed.get(step)} and ${name}`);
    claimed.set(step, name);
  }
}
const owner = step => (SHARED.has(step) ? null : (claimed.get(step) ?? SITE));
const plan = name => chain.filter(step => SHARED.has(step) || owner(step) === name);

const arg = process.argv[2];
if (arg === '--check') {
  for (const name of [...Object.keys(PARTS), SITE]) console.log(`${name}: ${plan(name).join(', ')}`);
  process.exit(0);
}
if (arg !== SITE && !Object.hasOwn(PARTS, arg)) {
  console.error(`usage: node scripts/verify-ci.mjs ${[...Object.keys(PARTS), SITE].join(' | ')} | --check`);
  process.exit(2);
}

for (const step of plan(arg)) {
  const started = Date.now();
  console.log(`\n> npm run ${step}`);
  const result = spawnSync('npm', ['run', step], { stdio: 'inherit' });
  const seconds = Math.round((Date.now() - started) / 1000);
  if (result.status !== 0) {
    console.error(`verify-ci ${arg}: ${step} failed after ${seconds}s`);
    process.exit(result.status ?? 1);
  }
  console.log(`verify-ci ${arg}: ${step} passed in ${seconds}s`);
}
