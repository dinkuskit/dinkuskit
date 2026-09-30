import { generateKeyPair, exportJWK } from 'jose';
import { randomBytes } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';
import { unstable_dev } from 'wrangler';

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

export function testSecret() {
  return randomBytes(32).toString('base64url');
}

async function testJwtVar() {
  const { privateKey } = await generateKeyPair('ES256', { extractable: true });
  const jwk = await exportJWK(privateKey);
  jwk.kid = 'test-es256';
  jwk.alg = 'ES256';
  return JSON.stringify(jwk);
}

async function emitProofFetch() {
  const compiler = { compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 } };
  const configSrc = await readFile('src/account/config.ts', 'utf8');
  const proofSrc = await readFile('src/account/proof-fetch.ts', 'utf8');
  await writeFile('dist/server/proof-fetch-config.mjs', transpileModule(configSrc, compiler).outputText);
  await writeFile(
    'dist/server/proof-fetch.mjs',
    transpileModule(proofSrc, compiler).outputText.replaceAll('./config.ts', './proof-fetch-config.mjs'),
  );
}

async function prepareBuiltTestConfig({ persistTo, secret, origin, jwt }) {
  const built = JSON.parse(await readFile('dist/server/wrangler.json', 'utf8'));
  await copyFile('tests/fixtures/built-test-entry.mjs', 'dist/server/test-entry.mjs');
  await emitProofFetch();
  const config = {
    ...built,
    name: 'dinkuskit-website-test',
    main: 'test-entry.mjs',
    no_bundle: true,
    kv_namespaces: [
      ...(built.kv_namespaces ?? []),
      { binding: 'MERCHANT_MAIL_CAPTURE', id: '00000000-0000-0000-0000-000000000021' },
      { binding: 'MERCHANT_PROOF_SIMULATION', id: '00000000-0000-0000-0000-000000000022' },
    ],
    vars: {
      ...(built.vars ?? {}),
      MERCHANT_AUTH_SECRET: secret,
      MERCHANT_BASE_URL: origin,
      ...(jwt === false ? {} : { MERCHANT_JWT_PRIVATE_JWK: jwt }),
    },
  };
  const path = join('dist/server', `wrangler.test.${randomBytes(8).toString('hex')}.json`);
  await writeFile(path, JSON.stringify(config, null, 2));
  return path;
}

export async function startMerchantTestRuntime(options = {}) {
  const persistTo = options.persistTo ?? await mkdtemp(join(tmpdir(), 'dk-merchant-'));
  const secret = options.secret ?? testSecret();
  const jwt = options.jwt === false ? false : options.jwt ?? await testJwtVar();
  const port = options.port ?? await freePort();
  const origin = options.origin ?? `http://127.0.0.1:${port}`;
  const config = await prepareBuiltTestConfig({ persistTo, secret, origin, jwt });
  const worker = await unstable_dev('dist/server/test-entry.mjs', {
    config,
    ip: '127.0.0.1',
    port,
    local: true,
    persist: true,
    persistTo,
    experimental: { disableExperimentalWarning: true, forceLocal: true },
    logLevel: 'error',
  });
  const actual = `http://${worker.address}:${worker.port}`;
  if (actual !== origin) {
    await worker.stop();
    return startMerchantTestRuntime({ ...options, persistTo, secret, jwt, origin: actual, port: worker.port });
  }
  return {
    worker,
    origin,
    persistTo,
    secret,
    jwt,
    config,
    ownedPersist: !options.persistTo,
  };
}

export async function startProductionWorker(options = {}) {
  const built = JSON.parse(await readFile('dist/server/wrangler.json', 'utf8'));
  const persistTo = options.persistTo;
  const config = {
    ...built,
    name: 'dinkuskit-website-production-probe',
    main: 'entry.mjs',
    no_bundle: true,
    kv_namespaces: [
      ...(built.kv_namespaces ?? []),
      ...(options.rogueTestBindings ? [
        { binding: 'MERCHANT_MAIL_CAPTURE', id: '00000000-0000-0000-0000-000000000031' },
        { binding: 'MERCHANT_PROOF_SIMULATION', id: '00000000-0000-0000-0000-000000000032' },
      ] : []),
    ],
    vars: {
      ...(built.vars ?? {}),
      ...(options.secret ? { MERCHANT_AUTH_SECRET: options.secret } : {}),
      ...(options.origin ? { MERCHANT_BASE_URL: options.origin } : {}),
      ...(typeof options.jwt === 'string' ? { MERCHANT_JWT_PRIVATE_JWK: options.jwt } : {}),
      ...(options.vars ?? {}),
    },
  };
  const path = join('dist/server', `wrangler.prodprobe.${randomBytes(8).toString('hex')}.json`);
  await writeFile(path, JSON.stringify(config, null, 2));
  const worker = await unstable_dev('dist/server/entry.mjs', {
    config: path,
    ip: '127.0.0.1',
    local: true,
    persist: Boolean(persistTo),
    persistTo,
    experimental: { disableExperimentalWarning: true, forceLocal: true },
    logLevel: 'error',
  });
  return {
    worker,
    origin: `http://${worker.address}:${worker.port}`,
    config: path,
    persistTo,
    ownedPersist: false,
  };
}

export function cookieHeader(jar) {
  return [...jar.values()].join('; ');
}

export function storeCookies(jar, response) {
  const values = response.headers.getSetCookie?.() ?? [];
  for (const value of values) {
    const [pair] = value.split(';');
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const name = pair.slice(0, eq);
    const body = pair.slice(eq + 1);
    if (value.includes('Max-Age=0') || body === '') jar.delete(name);
    else jar.set(name, `${name}=${body}`);
  }
}

export async function request(runtime, jar, path, init = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has('origin') && init.omitOrigin !== true) headers.set('origin', runtime.origin);
  const cookie = cookieHeader(jar);
  if (cookie) headers.set('cookie', cookie);
  if (init.body && !headers.has('content-type') && typeof init.body === 'string' && init.body.startsWith('{')) {
    headers.set('content-type', 'application/json');
  }
  const { omitOrigin, ...fetchInit } = init;
  const response = await fetch(new URL(path, runtime.origin), { redirect: 'manual', ...fetchInit, headers });
  storeCookies(jar, response);
  return response;
}

export async function takeMail(runtime, email) {
  const response = await request(runtime, new Map(), '/__proof/mail/take', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  if (response.status !== 200) return null;
  return response.json();
}

export async function completeProofMail(runtime, jar, email) {
  return request(runtime, jar, '/__proof/browser/complete', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `email=${encodeURIComponent(email)}`,
  });
}

export async function completeLink(runtime, jar, token) {
  return request(runtime, jar, `/api/auth/magic-link/verify?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent('/account')}`, {
    method: 'GET',
    redirect: 'manual',
  });
}

export async function signup(runtime, email, jar = new Map()) {
  const posted = await request(runtime, jar, '/account/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `email=${encodeURIComponent(email)}`,
  });
  const completed = await completeProofMail(runtime, jar, email);
  return { posted, mail: { intent: 'signup', hasToken: completed.status === 303 }, jar, completed };
}

export async function grantPresent(runtime, siteId) {
  const response = await request(runtime, new Map(), `/__proof/grant?site_id=${encodeURIComponent(siteId)}`);
  const body = await response.json();
  return Boolean(body.present);
}

export async function stopRuntime(runtime) {
  try { await runtime.worker.stop(); } catch {}
  if (runtime.ownedPersist && runtime.persistTo) await rm(runtime.persistTo, { recursive: true, force: true });
  if (runtime.config && /wrangler\.(test|prodprobe)\./.test(String(runtime.config))) {
    await rm(runtime.config, { force: true });
  }
}
