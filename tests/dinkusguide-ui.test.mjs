import assert from 'node:assert/strict';
import { test } from 'node:test';
import { guideAllowedPage, guidePilot, guidePublicRequest } from '../src/guide/policy.ts';
import { parseAnswer, parseConfig, plainChatText, safeCitation } from '../packages/dinkusguide-ui/src/contract.ts';

test('pilot defaults off and only admits an explicit installed ID', () => {
  assert.equal(guidePilot(undefined, 'r_test'), null);
  assert.equal(guidePilot('true', '../admin'), null);
  assert.equal(guidePilot('true', ''), null);
  assert.equal(guidePilot('true', 'r_test').askUrl, '/_emdash/api/plugins/r_test/ask');
});
test('widget route policy excludes private and unknown surfaces', () => {
  for (const path of ['/', '/start', '/getting-started', '/docs', '/docs/commerce/cart']) assert.equal(guideAllowedPage(path), true);
  for (const path of ['/account', '/account/sign-in', '/account/connect', '/_emdash/admin', '/api/auth', '/operator', '/random', '/docs/../account', '/docs/a%2Fb']) assert.equal(guideAllowedPage(path), false, path);
});
test('namespace exception is exact, method bounded, and opt-in', () => {
  const pilot = guidePilot('true', 'r_test');
  for (const [path, method, allowed] of [
    [pilot.configUrl, 'GET', true], [pilot.askUrl, 'POST', true], [pilot.askUrl, 'GET', false],
    [pilot.configUrl, 'DELETE', false], [pilot.askUrl + '/', 'POST', false], [pilot.askUrl + '?url=other', 'POST', false],
    ['/_emdash/api/plugins/r_other/ask', 'POST', false], ['/_emdash/admin', 'POST', false],
    ['/_emdash/api/plugins/r_test/%61sk', 'POST', false], ['/_emdash/api/plugins/r_test/ask/extra', 'POST', false]
  ]) {
    const request = new Request('https://example.test' + path, { method });
    assert.equal(guidePublicRequest(request, new URL(request.url), pilot), allowed, path);
    assert.equal(guidePublicRequest(request, new URL(request.url), null), false);
  }
});
test('completed answers stay whole and only immutable public links are accepted', () => {
  const url = `https://github.com/dinkuskit/commerce/blob/${'a'.repeat(40)}/README.md#L1-L20`;
  const answer = { status: 'answered', answer: '<script>alert(1)</script> **Full** answer. '.repeat(500), citations: [url] };
  assert.deepEqual(parseAnswer(answer), answer);
  assert.equal(parseAnswer({ success: true, data: answer }).answer, answer.answer);
  for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'https://evil.test/x', url.replace('a'.repeat(40), 'main'), url.replace('dinkuskit', 'private-org'), url + '?redirect=other']) assert.equal(safeCitation(bad), false);
  assert.throws(() => parseAnswer({ ...answer, citations: [] }));
  assert.throws(() => parseAnswer({ ...answer, citations: ['javascript:alert(1)'] }));
  assert.deepEqual(parseAnswer({ status: 'out_of_scope', answer: 'Read-only.', citations: [] }), { status: 'out_of_scope', answer: 'Read-only.', citations: [] });
  assert.throws(() => parseConfig({ enabled: true, maxQuestionCharacters: 99999, timeoutMs: 5000 }));
  assert.equal(parseConfig({ enabled: true, maxQuestionCharacters: 2000, timeoutMs: 20000 }).maxQuestionCharacters, 2000);
});
test('all Markdown punctuation is escaped before the third-party renderer sees text', () => {
  assert.equal(plainChatText('<img src=x> [bad](javascript:alert(1)) ![img](https://x.test/a)'), '\\<img src\\=x\\> \\[bad\\]\\(javascript\\:alert\\(1\\)\\) \\!\\[img\\]\\(https\\:\\/\\/x\\.test\\/a\\)');
});
