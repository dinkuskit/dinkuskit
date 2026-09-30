/**
 * Local CMS-operation fixture helpers.
 *
 * Provenance (same public packages, source-by-source; no private imports):
 * - Official content envelope `{ item, _rev }` from EmDash 1.0.1
 *   `src/api/handlers/content.ts` (`handleContentGet` / `handleContentUpdate`)
 *   and `src/api/error.ts` (`unwrapResult` → `apiSuccess(result.data)`).
 * - Draft-supporting collections keep PUT data off live columns until
 *   `POST /_emdash/api/content/{collection}/{id}/publish`
 *   (`src/emdash-runtime.ts` handleContentUpdate; `src/astro/routes/api/content/[collection]/[id]/publish.ts`).
 * - WebAuthn credential wire shape from EmDash 1.0.1 `src/api/schemas/auth.ts`
 *   and setup/passkey routes under `src/astro/routes/api/`.
 * - Cloudflare adapter bindings `d1({ binding: "DB" })` / `r2({ binding: "MEDIA" })`
 *   from `@emdash-cms/cloudflare` 1.0.1 `src/index.ts`.
 */

const SECRET_KEY = /cookie|set-cookie|authorization|proxy-authorization|jwt|token|session|passkey|credential|challenge|attestation|clientDataJSON|authenticatorData|signature|userHandle|nonce|astro-session|emdash_setup/i;
const SECRET_LINE = /set-cookie|authorization:|cookie:|clientDataJSON|attestationObject|authenticatorData|"challenge"\s*:/i;

export function unwrapApiData(body, label) {
  if (!body || body.success !== true || body.data == null || typeof body.data !== 'object') {
    throw new Error(`${label}: official apiSuccess envelope missing ({ success: true, data })`);
  }
  return body.data;
}

export function unwrapContentEnvelope(body, label) {
  const data = unwrapApiData(body, label);
  const item = data.item && typeof data.item === 'object' ? data.item : null;
  const rev = typeof data._rev === 'string' && data._rev.length > 0 ? data._rev : null;
  if (!item || !rev) {
    throw new Error(`${label}: official content envelope missing data.item and data._rev`);
  }
  return { item, rev };
}

export function contentFieldData(item) {
  return item?.data && typeof item.data === 'object' ? item.data : {};
}

export function d1PersistPaths(files) {
  return files.filter((path) => /(?:^|\/)v3\/d1(?:\/|$)|miniflare-D1DatabaseObject/i.test(path));
}

export function kvOnlyPersist(files) {
  return files.length > 0 && d1PersistPaths(files).length === 0 && files.every((path) => /(?:^|\/)v3\/kv(?:\/|$)/i.test(path));
}

export function sanitizeValue(value, key = '') {
  if (SECRET_KEY.test(key)) return '[redacted]';
  if (Array.isArray(value)) return value.map((entry) => sanitizeValue(entry, key));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [nextKey, nextValue] of Object.entries(value)) {
      out[nextKey] = sanitizeValue(nextValue, nextKey);
    }
    return out;
  }
  if (typeof value === 'string' && (SECRET_KEY.test(key) || /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\./.test(value))) {
    return '[redacted]';
  }
  return value;
}

export function sanitizeText(text, limit = 4000) {
  const cleaned = String(text ?? '')
    .replace(/\x1B\[[0-9;]*m/g, '')
    .split('\n')
    .filter((line) => !SECRET_LINE.test(line))
    .join('\n');
  if (cleaned.length <= limit) return cleaned;
  const head = Math.floor(limit / 3);
  const tail = limit - head;
  return `${cleaned.slice(0, head)}\n...\n${cleaned.slice(-tail)}`;
}

export function contentProof(body, extra = {}) {
  try {
    const { item, rev } = unwrapContentEnvelope(body, 'proof');
    return {
      success: body.success === true,
      id: item.id ?? null,
      slug: item.slug ?? null,
      status: item.status ?? null,
      title: typeof item.data?.title === 'string' ? item.data.title : null,
      hasRev: Boolean(rev),
      ...extra,
    };
  } catch {
    return {
      success: body?.success === true,
      id: null,
      slug: null,
      status: null,
      title: null,
      hasRev: false,
      ...extra,
    };
  }
}

export function workerdReady(log) {
  return /Ready on http:\/\/127\.0\.0\.1:\d+/i.test(log);
}

export function localBindingTable(log) {
  const text = String(log ?? '').replace(/\x1B\[[0-9;]*m/g, '');
  return {
    d1Local: /env\.DB\b[\s\S]{0,240}D1 Database[\s\S]{0,80}local/i.test(text),
    r2Local: /env\.MEDIA\b[\s\S]{0,240}R2 Bucket[\s\S]{0,80}local/i.test(text),
  };
}
