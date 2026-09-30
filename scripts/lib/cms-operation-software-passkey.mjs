/**
 * Synthetic software passkey for loopback fixture qualification only.
 *
 * Provenance: wire shape matches EmDash 1.0.1 public
 * `src/api/schemas/auth.ts` registrationCredential / authenticationCredential
 * (id, rawId, type, response.clientDataJSON, attestationObject or
 * authenticatorData+signature). Algorithm is local ES256 + packed authData;
 * not copied from private repos and not a production authenticator.
 */
import { createSign, generateKeyPairSync } from 'node:crypto';
import { createHash } from 'node:crypto';

function concat(...parts) {
  const size = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

function encodeHead(major, length) {
  if (length < 24) return Uint8Array.of((major << 5) | length);
  if (length < 256) return Uint8Array.of((major << 5) | 24, length);
  if (length < 65536) return Uint8Array.of((major << 5) | 25, length >> 8, length & 0xff);
  throw new Error('CBOR length too large for this fixture encoder');
}

function encodeUnsigned(value) {
  if (value < 0) throw new Error('unsigned expected');
  return encodeHead(0, value);
}

function encodeNegative(value) {
  if (value >= 0) throw new Error('negative expected');
  return encodeHead(1, -1 - value);
}

function encodeInt(value) {
  return value >= 0 ? encodeUnsigned(value) : encodeNegative(value);
}

function encodeBytes(bytes) {
  return concat(encodeHead(2, bytes.byteLength), bytes);
}

function encodeText(text) {
  const bytes = new TextEncoder().encode(text);
  return concat(encodeHead(3, bytes.byteLength), bytes);
}

function encodeMap(entries) {
  const encoded = entries.map(([key, value]) => concat(
    typeof key === 'string' ? encodeText(key) : encodeInt(key),
    value,
  ));
  return concat(encodeHead(5, entries.length), ...encoded);
}

function sha256(bytes) {
  return new Uint8Array(createHash('sha256').update(bytes).digest());
}

function base64url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

function rpIdHash(rpId) {
  return sha256(new TextEncoder().encode(rpId));
}

function encodeCoseEs256(x, y) {
  return encodeMap([
    [1, encodeInt(2)],
    [3, encodeInt(-7)],
    [-1, encodeInt(1)],
    [-2, encodeBytes(x)],
    [-3, encodeBytes(y)],
  ]);
}

function authenticatorData({ rpId, flags, counter, attested }) {
  const count = new Uint8Array(4);
  new DataView(count.buffer).setUint32(0, counter);
  if (!attested) return concat(rpIdHash(rpId), Uint8Array.of(flags), count);
  const idLength = new Uint8Array(2);
  new DataView(idLength.buffer).setUint16(0, attested.id.byteLength);
  return concat(
    rpIdHash(rpId),
    Uint8Array.of(flags),
    count,
    new Uint8Array(16),
    idLength,
    attested.id,
    attested.coseKey,
  );
}

export function createSoftwarePasskey() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const x = new Uint8Array(Buffer.from(jwk.x, 'base64url'));
  const y = new Uint8Array(Buffer.from(jwk.y, 'base64url'));
  const credentialId = crypto.getRandomValues(new Uint8Array(16));
  const rawId = base64url(credentialId);
  let counter = 0;

  function clientData(type, challenge, origin) {
    return new TextEncoder().encode(JSON.stringify({
      type,
      challenge,
      origin,
      crossOrigin: false,
    }));
  }

  return {
    rawId,
    register({ challenge, rpId, origin }) {
      const coseKey = encodeCoseEs256(x, y);
      const authData = authenticatorData({
        rpId,
        flags: 0x45,
        counter: 0,
        attested: { id: credentialId, coseKey },
      });
      const attestationObject = encodeMap([
        ['fmt', encodeText('none')],
        ['attStmt', encodeMap([])],
        ['authData', encodeBytes(authData)],
      ]);
      const clientDataJSON = clientData('webauthn.create', challenge, origin);
      return {
        id: rawId,
        rawId,
        type: 'public-key',
        response: {
          clientDataJSON: base64url(clientDataJSON),
          attestationObject: base64url(attestationObject),
          transports: ['internal'],
        },
        authenticatorAttachment: 'platform',
      };
    },
    assert({ challenge, rpId, origin }) {
      counter += 1;
      const authData = authenticatorData({ rpId, flags: 0x05, counter });
      const clientDataJSON = clientData('webauthn.get', challenge, origin);
      const message = concat(authData, sha256(clientDataJSON));
      const signature = new Uint8Array(createSign('SHA256').update(message).sign(privateKey));
      return {
        id: rawId,
        rawId,
        type: 'public-key',
        response: {
          clientDataJSON: base64url(clientDataJSON),
          authenticatorData: base64url(authData),
          signature: base64url(signature),
        },
        authenticatorAttachment: 'platform',
      };
    },
  };
}
