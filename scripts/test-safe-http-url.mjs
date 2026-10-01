import assert from 'node:assert/strict';
import { safeHttpUrl } from './lib/safe-http-url.mjs';

const checks = [];
const record = (check) => {
  checks.push(check);
  console.log(`PASS ${check}`);
};

assert.equal(safeHttpUrl('https://docs.emdashcms.com/getting-started/'), 'https://docs.emdashcms.com/getting-started/');
assert.equal(safeHttpUrl('https://demo.dinkuskit.com/'), 'https://demo.dinkuskit.com/');
assert.equal(safeHttpUrl('https://github.com/dinkuskit/template-store/blob/main/docs/v1-setup.md'), 'https://github.com/dinkuskit/template-store/blob/main/docs/v1-setup.md');
assert.equal(safeHttpUrl('http://example.invalid/path'), 'http://example.invalid/path');
record('Absolute http(s) URLs are accepted');

assert.equal(safeHttpUrl('javascript:alert(1)'), null);
assert.equal(safeHttpUrl('data:text/html,hi'), null);
assert.equal(safeHttpUrl('file:///etc/passwd'), null);
assert.equal(safeHttpUrl('ftp://example.invalid/file'), null);
assert.equal(safeHttpUrl('//example.invalid/path'), null);
record('Unsafe and non-http(s) schemes are rejected');

assert.equal(safeHttpUrl(''), null);
assert.equal(safeHttpUrl('   '), null);
assert.equal(safeHttpUrl(null), null);
assert.equal(safeHttpUrl({ href: 'https://example.invalid' }), null);
record('Missing or non-string values do not become hrefs');

console.log(checks.map((check) => `PASS ${check}`).join('\n'));
