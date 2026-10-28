import { afterEach, beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createPluginRuntimeTestHost, type PluginRuntimeTestHost } from '@emdash-cms/plugin-test';
import plugin from '../packages/dinkusguide-chat/src/plugin';
import type { PluginContext, SandboxedRouteContext } from 'emdash/plugin';

const endpoint = 'https://guide.dinkuskit.com/ask';
const token = 'synthetic-guide-service-token-at-least-32-characters';
const citation = 'https://github.com/dinkuskit/dinkus-guide/blob/d8eb8bb7d5877ee120a1d6ff5d4045712c91a03e/README.md#L1-L10';
let host: PluginRuntimeTestHost;
// Isolated test worker only: a public, synthetic key, never a host credential.
beforeAll(() => { process.env.EMDASH_ENCRYPTION_KEY = `emdash_enc_v1_${'A'.repeat(43)}`; });
afterAll(() => { delete process.env.EMDASH_ENCRYPTION_KEY; });
afterEach(async () => { await host?.dispose(); host = undefined as unknown as PluginRuntimeTestHost; });

async function ready(extra: Record<string, unknown> = {}) {
  host = await createPluginRuntimeTestHost();
  const result = await host.actions.plugin.updateSettings({ enabled: true, serviceUrl: endpoint, serviceToken: token, ...extra });
  expect(result.success, JSON.stringify(result)).toBe(true);
}
const ask = (body: unknown, headers: Record<string, string> = {}) => host.actions.routes.request('ask', { method: 'POST', body, headers });
const answer = (value = 'A complete synthetic answer.') => new Response(JSON.stringify({ status: 'answered', answer: value, citations: [citation] }), { headers: { 'content-type': 'application/json' } });

describe('DinkusGuide in the production Cloudflare sandbox and route dispatcher', () => {
  it('defaults disabled and exposes no service configuration', async () => {
    host = await createPluginRuntimeTestHost();
    const response = await host.actions.routes.request('config', { method: 'GET' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: false, maxQuestionCharacters: 2000, timeoutMs: 20000 });
    expect((await ask({ question: 'What is Commerce?' })).status).toBe(503);
    expect(host.http.requests()).toHaveLength(0);
  });

  it('encrypts settings, preserves the complete answer, and sends only the question', async () => {
    await ready();
    expect(await host.inspect.settings.raw('serviceToken')).not.toEqual(token);
    const config = await host.actions.routes.request('config', { method: 'GET' });
    expect(await config.json()).toEqual({ enabled: true, maxQuestionCharacters: 2000, timeoutMs: 20000 });
    const text = 'Complete answer. '.repeat(300);
    await host.http.respond(endpoint, answer(text));
    const response = await ask({ question: 'What is Commerce?' }, { cookie: 'untrusted=ignored', 'x-visitor-id': 'ignored' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'answered', answer: text, citations: [citation] });
    expect(response.headers.get('cache-control')).toContain('no-store');
    const [sent] = host.http.requests();
    expect(sent.url).toBe(endpoint);
    expect(JSON.parse(new TextDecoder().decode(sent.body))).toEqual({ question: 'What is Commerce?' });
    expect(sent.headers.authorization).toBe(`Bearer ${token}`);
    expect(sent.headers.cookie).toBeUndefined();
    const state = JSON.stringify(await host.inspect.kv.list());
    expect(state).not.toContain('What is Commerce?');
    expect(state).not.toContain(text);
  });

  it('keeps admin private and rejects wrong methods before outbound HTTP', async () => {
    await ready();
    expect((await host.actions.routes.request('admin', { method: 'POST' })).status).toBe(401);
    expect((await host.actions.routes.request('ask', { method: 'GET' })).status).toBe(405);
    expect((await host.actions.routes.request('config', { method: 'POST' })).status).toBe(405);
    expect(host.http.requests()).toHaveLength(0);
    const page = await host.admin.loadPage('/guide');
    expect(JSON.stringify(page)).toContain('DinkusGuide');
    expect(JSON.stringify(page)).not.toContain(token);
  });

  it('rejects oversized, malformed and history-bearing requests without inference', async () => {
    await ready();
    for (const body of [{ question: 'x'.repeat(2001) }, { question: 'hello', history: [] }, { question: '' }, { question: 1 }]) {
      expect((await ask(body)).status).toBeGreaterThanOrEqual(400);
    }
    const oversized = await host.actions.routes.request('ask', { method: 'POST', rawBody: ' '.repeat(17000), headers: { 'content-type': 'application/json' } });
    expect(oversized.status).toBe(413);
    expect(host.http.requests()).toHaveLength(0);
  });

  it('keeps abstention intact and rejects unsafe or incomplete provider results', async () => {
    await ready();
    await host.http.respond(endpoint, new Response(JSON.stringify({ status: 'insufficient_evidence', answer: 'No supported answer.', citations: [] })));
    expect(await (await ask({ question: 'An unsupported question?' })).json()).toEqual({ status: 'insufficient_evidence', answer: 'No supported answer.', citations: [] });
    for (const value of [{ status: 'answered', answer: 'unsafe', citations: ['javascript:alert(1)'] }, { status: 'answered', answer: 'incomplete', citations: [] }, { status: 'answered', answer: 'x'.repeat(70000), citations: [citation] }]) {
      await host.http.respond(endpoint, new Response(JSON.stringify(value)));
      expect((await ask({ question: 'What is Commerce?' })).status).toBe(503);
    }
  });

  it('enforces the exact outbound host through the sandbox bridge', async () => {
    await ready({ serviceUrl: 'https://other.example.com/ask' });
    expect((await ask({ question: 'What is Commerce?' })).status).toBe(503);
    expect(host.http.requests()).toHaveLength(0);
  });

  it('retains global rate state across sandbox restart', async () => {
    await ready({ requestsPerMinute: 1 });
    await host.http.respond(endpoint, answer());
    expect((await ask({ question: 'First?' })).status).toBe(200);
    await host.restart();
    expect((await ask({ question: 'Second?' })).status).toBe(429);
    expect(host.http.requests()).toHaveLength(1);
  });

  it('retains admission after the response deadline until the transport settles', async () => {
    // Controlled transport test: the real bridge does not forward AbortSignal.
    let state: unknown = null, revision = 0, finish!: (response: Response) => void;
    let calls = 0;
    const settings = { enabled: true, serviceUrl: endpoint, serviceToken: token, timeoutMs: 1000, maxConcurrency: 1 };
    const context = {
      settings: { list: async () => Object.entries(settings).map(([key, value]) => ({ key, value })) },
      kv: {
        getVersioned: async () => state === null ? null : { value: structuredClone(state), revision: String(revision) },
        compareAndSet: async (_key: string, expected: string | null, next: unknown) => {
          if (expected !== (state === null ? null : String(revision))) return { applied: false };
          state = structuredClone(next); revision++; return { applied: true };
        },
      },
      http: { fetch: async () => { calls++; return new Promise<Response>(resolve => { finish = resolve; }); } },
    } as unknown as PluginContext;
    const route = { request: { method: 'POST', url: 'https://site.test/ask', headers: { 'content-type': 'application/json' } }, input: new TextEncoder().encode('{"question":"hello"}') } as unknown as SandboxedRouteContext;
    const handler = plugin.routes!.ask.handler;
    const timedOut = await handler(route, context) as { status: number };
    expect(timedOut.status).toBe(504);
    expect((await handler(route, context) as { status: number }).status).toBe(429);
    expect(calls).toBe(1);
    finish(answer());
    await new Promise(resolve => setTimeout(resolve, 10));
    expect((state as { activeLeases: unknown[] }).activeLeases).toEqual([]);
  });
});
