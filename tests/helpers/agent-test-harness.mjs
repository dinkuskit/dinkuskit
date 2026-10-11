import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { request, startMerchantTestRuntime, stopRuntime, testSecret } from './merchant-harness.mjs';
import { AGENT_RUN_MS } from '../fixtures/agent-test-policy.mjs';

/** No existing DB, host, credential, or remote target can be supplied. */
export async function startAgentTestRuntime(options = {}) {
  if (!options || Object.keys(options).length) throw new Error('Agent testing accepts no external configuration');
  const root = resolve('.grilltrack/work/agent-test-runs');
  await mkdir(root, { recursive: true });
  const persistTo = await mkdtemp(join(root, 'run-'));
  const key = testSecret();
  const expiresAt = Date.now() + AGENT_RUN_MS;
  let runtime;
  try {
    runtime = await startMerchantTestRuntime({ persistTo, agentTest: { key, expiresAt } });
  } catch (error) {
    await rm(persistTo, { recursive: true, force: true });
    throw error;
  }
  let stopping;
  const jars = new Set();
  const pending = new Set();
  const close = () => {
    if (!stopping) stopping = (async () => {
      clearTimeout(deadline);
      for (const controller of pending) controller.abort();
      for (const jar of jars) jar.clear();
      await stopRuntime({ ...runtime, ownedPersist: true });
    })();
    return stopping;
  };
  const deadline = setTimeout(() => { void close().catch(() => {}); }, Math.max(1, expiresAt - Date.now()));
  deadline.unref();
  return {
    origin: runtime.origin,
    persistTo,
    async request(jar, path, init = {}) {
      const target = new URL(path, runtime.origin);
      if (target.origin !== runtime.origin || target.username || target.password) throw new Error('Agent requests must stay on the local runtime');
      if (init.redirect && init.redirect !== 'manual') throw new Error('Agent requests must not follow redirects');
      if (stopping) throw new Error('Agent runtime closed');
      jars.add(jar);
      const headers = new Headers(init.headers);
      headers.set('x-agent-test-key', key);
      const controller = new AbortController();
      pending.add(controller);
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const signal = init.signal ? AbortSignal.any([controller.signal, init.signal]) : controller.signal;
        const response = await request(runtime, jar, target.pathname + target.search, { ...init, headers, signal, redirect: 'manual' });
        const body = await response.arrayBuffer();
        return new Response([204, 205, 304].includes(response.status) ? null : body, { status: response.status, headers: response.headers });
      } finally { clearTimeout(timeout); pending.delete(controller); }
    },
    close,
  };
}

export async function agentAuth(runtime, jar, identity, intent = 'signup') {
  const started = await runtime.request(jar, '/__agent/auth/start', {
    method: 'POST', body: JSON.stringify({ identity, intent }),
  });
  const completed = await runtime.request(jar, '/__agent/auth/complete', {
    method: 'POST', body: JSON.stringify({ identity }),
  });
  return { started, completed };
}
