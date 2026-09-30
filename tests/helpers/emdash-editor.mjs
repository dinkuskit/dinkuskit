import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { createAssertionSignatureMessage } from '@oslojs/webauthn';
import { request } from './merchant-harness.mjs';

const PUBLIC_ORIGIN = 'https://dinkuskit.com';
const RP_ID = 'dinkuskit.com';
const EDITOR_EMAIL = 'editor@cms.example';

function encodeHead(major, value) {
  const type = major << 5;
  if (value < 24) return Buffer.from([type | value]);
  if (value < 256) return Buffer.from([type | 24, value]);
  if (value < 65536) return Buffer.from([type | 25, value >> 8, value & 0xff]);
  const buf = Buffer.alloc(5);
  buf[0] = type | 26;
  buf.writeUInt32BE(value, 1);
  return buf;
}

function encodeInt(value) {
  if (value >= 0) return encodeHead(0, value);
  return encodeHead(1, -1 - value);
}

function encodeBytes(bytes) {
  const raw = Buffer.from(bytes);
  return Buffer.concat([encodeHead(2, raw.length), raw]);
}

function encodeText(text) {
  const raw = Buffer.from(text, 'utf8');
  return Buffer.concat([encodeHead(3, raw.length), raw]);
}

function encodeCbor(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return encodeInt(value);
  if (typeof value === 'string') return encodeText(value);
  if (value instanceof Uint8Array || Buffer.isBuffer(value)) return encodeBytes(value);
  if (Array.isArray(value)) {
    return Buffer.concat([encodeHead(4, value.length), ...value.map(encodeCbor)]);
  }
  if (value && value.$map) {
    return Buffer.concat([
      encodeHead(5, value.$map.length),
      ...value.$map.flatMap(([key, item]) => [encodeCbor(key), encodeCbor(item)]),
    ]);
  }
  const entries = Object.entries(value);
  return Buffer.concat([
    encodeHead(5, entries.length),
    ...entries.flatMap(([key, item]) => [encodeCbor(key), encodeCbor(item)]),
  ]);
}

function base64url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

function createSoftwarePasskey() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const x = Buffer.from(jwk.x, 'base64url');
  const y = Buffer.from(jwk.y, 'base64url');
  const credentialId = crypto.getRandomValues(new Uint8Array(16));
  return { privateKey, x, y, credentialId };
}

function coseKey(passkey) {
  return encodeCbor({
    $map: [
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, passkey.x],
      [-3, passkey.y],
    ],
  });
}

function authenticatorData(passkey, { attested = false, counter = 0 } = {}) {
  const rpIdHash = createHash('sha256').update(RP_ID).digest();
  const flags = attested ? 0x45 : 0x05;
  const signCount = Buffer.alloc(4);
  signCount.writeUInt32BE(counter);
  if (!attested) return Buffer.concat([rpIdHash, Buffer.from([flags]), signCount]);
  const credId = Buffer.from(passkey.credentialId);
  const credIdLen = Buffer.alloc(2);
  credIdLen.writeUInt16BE(credId.length);
  return Buffer.concat([
    rpIdHash,
    Buffer.from([flags]),
    signCount,
    Buffer.alloc(16),
    credIdLen,
    credId,
    coseKey(passkey),
  ]);
}

function clientData(type, challenge, origin = PUBLIC_ORIGIN) {
  return Buffer.from(JSON.stringify({ type, challenge, origin }));
}

function registrationResponse(passkey, challenge) {
  const authData = authenticatorData(passkey, { attested: true, counter: 0 });
  const attestationObject = encodeCbor({
    fmt: 'none',
    attStmt: {},
    authData,
  });
  const id = base64url(passkey.credentialId);
  return {
    id,
    rawId: id,
    type: 'public-key',
    response: {
      clientDataJSON: base64url(clientData('webauthn.create', challenge)),
      attestationObject: base64url(attestationObject),
      transports: ['internal'],
    },
  };
}

function assertionResponse(passkey, challenge, counter = 1) {
  const authData = authenticatorData(passkey, { attested: false, counter });
  const data = clientData('webauthn.get', challenge);
  const message = createAssertionSignatureMessage(authData, data);
  const signature = sign('sha256', message, passkey.privateKey);
  const id = base64url(passkey.credentialId);
  return {
    id,
    rawId: id,
    type: 'public-key',
    response: {
      clientDataJSON: base64url(data),
      authenticatorData: base64url(authData),
      signature: base64url(signature),
    },
  };
}

async function cmsJson(runtime, jar, path, body) {
  return request(runtime, jar, path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-emdash-request': '1',
    },
    body: JSON.stringify(body),
  });
}

export async function seedPublicCms(runtime, jar = new Map()) {
  let seedComplete = false;
  let last = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    const seeded = await cmsJson(runtime, jar, '/_emdash/api/setup', {
      title: 'DinkusKit',
      tagline: 'Local CMS fixture',
      includeContent: true,
    });
    last = await seeded.json().catch(() => ({}));
    if (seeded.status === 409 || last.seedComplete === true || last.data?.seedComplete === true) {
      seedComplete = true;
      break;
    }
    if (seeded.status !== 200) break;
  }
  return { seedComplete, last };
}

export async function createAuthenticatedEditor(runtime, jar = new Map()) {
  const seeded = await seedPublicCms(runtime, jar);
  const admin = await cmsJson(runtime, jar, '/_emdash/api/setup/admin', {
    email: EDITOR_EMAIL,
    name: 'CMS Editor',
  });
  const adminBody = await admin.json().catch(() => ({}));
  const options = adminBody.options ?? adminBody.data?.options;
  if (!options?.challenge) {
    return { ok: false, stage: 'setup-admin', status: admin.status, seeded };
  }
  const passkey = createSoftwarePasskey();
  const verified = await cmsJson(runtime, jar, '/_emdash/api/setup/admin/verify', {
    credential: registrationResponse(passkey, options.challenge),
  });
  if (verified.status !== 200) {
    return { ok: false, stage: 'setup-admin-verify', status: verified.status, body: await verified.json().catch(() => ({})), seeded };
  }
  const loginOptions = await cmsJson(runtime, jar, '/_emdash/api/auth/passkey/options', {});
  const loginBody = await loginOptions.json().catch(() => ({}));
  const challenge = loginBody.options?.challenge ?? loginBody.data?.options?.challenge;
  if (!challenge) {
    return { ok: false, stage: 'passkey-options', status: loginOptions.status, seeded };
  }
  const loggedIn = await cmsJson(runtime, jar, '/_emdash/api/auth/passkey/verify', {
    credential: assertionResponse(passkey, challenge),
  });
  if (loggedIn.status !== 200) {
    return { ok: false, stage: 'passkey-verify', status: loggedIn.status, body: await loggedIn.json().catch(() => ({})), seeded };
  }
  return { ok: true, jar, seeded, email: EDITOR_EMAIL };
}
