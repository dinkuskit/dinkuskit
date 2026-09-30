import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
assert.equal(manifest.name, '@dinkuskit/website');
assert.equal(manifest.private, true);
assert.equal(manifest.dependencies.emdash, '1.0.1');
assert.equal(manifest.dependencies['@dinkuskit/blocks'], undefined);
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const forbidden = /(^|\/)(node_modules|dist|\.local|\.astro|\.emdash|\.wrangler|uploads|\.grilltrack\/work)(\/|$)|(^|\/)\.(?:env|dev\.vars)(?:\.|$)|(^|\/)\.dev\.vars$|\.(?:db|sqlite|sqlite3|pem|key)(?:-|$)/;
const rejected = files.filter(path => forbidden.test(path));
assert.deepEqual(rejected, [], `Forbidden public paths: ${rejected.join(', ')}`);
console.log(`Repository path/manifest checks passed (${files.length} files). Content review is still required.`);
