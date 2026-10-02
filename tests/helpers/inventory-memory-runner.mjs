import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createConnection } from 'node:net';
import { generateKeyPair, exportJWK } from 'jose';
import { unstable_dev } from 'wrangler';

const ROOT = new URL('../..', import.meta.url).pathname;
const WORK_ROOT = join(ROOT, '.grilltrack/work/inventory-memory-runner-20261001/worker-');
const DEFAULT_WEBSITE_PORT = 47632;
const DEFAULT_STORE_PORT = 47631;

function safeError(reason) {
  return new Error(reason);
}

async function readRequestBody(input, signal, abortError) {
  if (!input.body) return new ArrayBuffer(0);
  const reader = input.body.getReader();
  const chunks = [];
  let totalLength = 0;
  let abortListener;
  try {
    while (true) {
      if (signal.aborted) throw abortError();
      const read = reader.read();
      const result = await Promise.race([
        read,
        new Promise((_, reject) => {
          abortListener = () => reject(abortError());
          signal.addEventListener('abort', abortListener, { once: true });
        }),
      ]);
      signal.removeEventListener('abort', abortListener);
      abortListener = undefined;
      if (result.done) break;
      chunks.push(result.value);
      totalLength += result.value.byteLength;
    }
  } finally {
    if (abortListener) signal.removeEventListener('abort', abortListener);
    if (signal.aborted) {
      try {
        Promise.resolve(reader.cancel()).catch(() => {});
      } catch {
        // Best effort: the dispatch is already aborting.
      }
    } else {
      reader.releaseLock();
    }
  }
  const body = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}

function assertPort(port, label) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw safeError(`invalid_${label}_port`);
}

async function assertPortFree(port) {
  await new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      reject(safeError('website_port_occupied'));
    });
    socket.once('error', error => {
      socket.destroy();
      if (error.code === 'ECONNREFUSED') resolve();
      else reject(error);
    });
  });
}

async function makeKeys() {
  const { privateKey } = await generateKeyPair('ES256', { extractable: true });
  const privateJwk = await exportJWK(privateKey);
  privateJwk.kid = `inventory-test-${randomBytes(12).toString('hex')}`;
  privateJwk.alg = 'ES256';
  const publicJwk = { ...privateJwk };
  delete publicJwk.d;
  delete publicJwk.p;
  delete publicJwk.q;
  delete publicJwk.dp;
  delete publicJwk.dq;
  delete publicJwk.qi;
  return { privateJwk: JSON.stringify(privateJwk), publicJwk };
}

async function startWorker(state) {
  await copyFile(
    join(ROOT, 'tests/fixtures/built-memory-test-entry.mjs'),
    join(ROOT, 'dist/server/memory-test-entry.mjs'),
  );
  const worker = await unstable_dev('dist/server/memory-test-entry.mjs', {
    config: join(ROOT, 'dist/server/wrangler.json'),
    ip: '127.0.0.1',
    port: state.websitePort,
    local: true,
    persist: true,
    persistTo: state.persistTo,
    vars: {
      MERCHANT_AUTH_SECRET: state.secret,
      MERCHANT_BASE_URL: state.websiteOrigin,
      MERCHANT_JWT_PRIVATE_JWK: state.privateJwk,
      TEST_INVENTORY_LOGICAL_ORIGIN: state.storeOrigin,
      TEST_INVENTORY_DISPATCHER_PORT: String(state.storePort),
    },
    experimental: { disableExperimentalWarning: true, forceLocal: true },
    logLevel: 'error',
  });
  if (worker.address !== '127.0.0.1' || worker.port !== state.websitePort) {
    await worker.stop();
    throw safeError('website_worker_address_drift');
  }
  return worker;
}

export async function startInventoryMemoryController(options = {}) {
  const websitePort = options.websitePort ?? DEFAULT_WEBSITE_PORT;
  const storePort = options.storePort ?? DEFAULT_STORE_PORT;
  assertPort(websitePort, 'website');
  assertPort(storePort, 'store');
  if (websitePort === storePort) throw safeError('authority_ports_must_differ');
  const fixture = options.fixture ?? null;
  if (fixture && (typeof fixture.start !== 'function' ||
      typeof fixture.register !== 'function')) {
    throw safeError('invalid_synthetic_fixture');
  }
  await mkdir(join(ROOT, '.grilltrack/work/inventory-memory-runner-20261001'), { recursive: true });
  const state = {
    websitePort,
    storePort,
    websiteOrigin: `http://127.0.0.1:${websitePort}`,
    storeOrigin: `http://127.0.0.1:${storePort}`,
    persistTo: await mkdtemp(WORK_ROOT),
    fixture,
    secret: randomBytes(32).toString('base64url'),
    ...(await makeKeys()),
  };
  const restartHooks = options.restartHooks ?? {};
  if (restartHooks.beforePortCheck !== undefined &&
      typeof restartHooks.beforePortCheck !== 'function') {
    throw safeError('invalid_restart_hook');
  }
  if (restartHooks.beforeLaunch !== undefined &&
      typeof restartHooks.beforeLaunch !== 'function') {
    throw safeError('invalid_restart_hook');
  }
  let worker;
  try {
    await assertPortFree(websitePort);
    if (fixture) await fixture.start();
    worker = await startWorker(state);
  } catch (error) {
    if (worker) await worker.stop().catch(() => {});
    if (fixture) await fixture.stop();
    await rm(state.persistTo, { recursive: true, force: true });
    throw error;
  }
  let stopped = false;
  let stopping = false;
  let restarting = false;
  let unavailable = false;
  let restartPromise;
  let stopPromise;
  const activeDispatches = new Set();
  const abortActiveDispatches = () => {
    for (const dispatchController of activeDispatches) {
      dispatchController.abort();
    }
  };
  const stopOwnedWorker = async () => {
    const ownedWorker = worker;
    worker = undefined;
    if (ownedWorker) await ownedWorker.stop();
  };
  const controller = {
    safeURLs: Object.freeze({
      website: state.websiteOrigin,
      storeDispatcher: `http://127.0.0.1:${storePort}`,
      jwks: `${state.websiteOrigin}/account/.well-known/jwks.json`,
      callback: `${state.storeOrigin}/_emdash/admin/plugins/dinkus-inventory/inventory`,
    }),
    publicKey: Object.freeze(state.publicJwk),
    jwksURL: `${state.websiteOrigin}/account/.well-known/jwks.json`,
    expectedStoreOrigin: state.storeOrigin,
    fixtureRequests: fixture?.requests ?? null,
    pid: worker.process?.pid ?? null,
    owned: Object.freeze({ website: true, dispatcher: false, persistence: true }),
    async dispatch(request) {
      if (stopped) throw safeError('controller_stopped');
      if (stopping || restarting || unavailable || !worker) {
        throw safeError('controller_unavailable');
      }
      const dispatchController = new AbortController();
      activeDispatches.add(dispatchController);
      try {
        const input = request instanceof Request ? request : new Request(request);
        const url = new URL(input.url);
        if (input.method !== 'POST' ||
            url.protocol !== 'https:' ||
            url.hostname !== 'dinkuskit.com' ||
            (url.port !== '' && url.port !== '443') ||
            (url.pathname !== '/api/store-connections' &&
             url.pathname !== '/api/store-connections/token') ||
            url.username || url.password || url.search || url.hash) {
          throw safeError('dispatch_request_rejected');
        }
        const target = new URL(url.pathname, state.websiteOrigin);
        const body = await readRequestBody(
          input,
          dispatchController.signal,
          () => safeError(stopped ? 'controller_stopped' : 'controller_unavailable'),
        );
        if (dispatchController.signal.aborted) {
          throw safeError(stopped ? 'controller_stopped' : 'controller_unavailable');
        }
        if (stopped) throw safeError('controller_stopped');
        if (stopping || restarting || unavailable || !worker) {
          throw safeError('controller_unavailable');
        }
        return await fetch(target, {
          method: input.method,
          headers: new Headers(input.headers),
          body,
          redirect: 'manual',
          signal: dispatchController.signal,
        });
      } finally {
        activeDispatches.delete(dispatchController);
      }
    },
    async registerFixtureReceipt(receipt) {
      if (!fixture) throw safeError('synthetic_fixture_unavailable');
      await fixture.register(receipt);
    },
    async setFixtureMode(mode) {
      if (!fixture?.setMode) throw safeError('synthetic_fixture_unavailable');
      await fixture.setMode(mode);
    },
    async restart() {
      if (stopped) throw safeError('controller_stopped');
      if (stopping || restarting) throw safeError('controller_busy');
      restarting = true;
      unavailable = true;
      abortActiveDispatches();
      restartPromise = (async () => {
        try {
          await stopOwnedWorker();
          if (restartHooks.beforePortCheck) await restartHooks.beforePortCheck();
          await assertPortFree(state.websitePort);
          if (restartHooks.beforeLaunch) await restartHooks.beforeLaunch();
          const nextWorker = await startWorker(state);
          if (stopped || stopping) {
            await nextWorker.stop();
            return;
          }
          worker = nextWorker;
          controller.pid = worker.process?.pid ?? null;
          unavailable = false;
        } catch (error) {
          unavailable = true;
          throw error;
        } finally {
          restarting = false;
          restartPromise = undefined;
        }
      })();
      return restartPromise;
    },
    async stop() {
      if (stopped) return;
      if (stopPromise) return stopPromise;
      stopping = true;
      abortActiveDispatches();
      const pendingRestart = restartPromise;
      stopPromise = (async () => {
        let failure;
        try {
          await pendingRestart?.catch(() => {});
          await stopOwnedWorker();
        } catch (error) {
          failure = error;
        } finally {
          try {
            if (fixture) await fixture.stop();
          } catch (error) {
            failure ??= error;
          }
        }
        if (failure) throw failure;
        stopped = true;
      })();
      return stopPromise;
    },
    async cleanup() {
      if (!stopped) throw safeError('controller_must_stop_before_cleanup');
      await rm(state.persistTo, { recursive: true, force: true });
    },
  };
  return controller;
}

export function connectionReceipt({ response, siteId, codeChallenge, expiresAt, controller }) {
  if (typeof response?.connection_id !== 'string' || typeof response.challenge !== 'string') {
    throw safeError('invalid_fixture_receipt_response');
  }
  return {
    version: 1,
    connection_id: response.connection_id,
    challenge: response.challenge,
    client_id: 'dinkus-inventory-emdash',
    service: 'inventory',
    site_id: siteId,
    site_origin: controller.expectedStoreOrigin,
    callback_uri: `${controller.expectedStoreOrigin}/_emdash/admin/plugins/dinkus-inventory/inventory`,
    code_challenge: codeChallenge,
    expires_at: expiresAt,
  };
}
