import {
  INVENTORY_PROOF_PATH,
  PROOF_FETCH_MAX_BYTES,
  PROOF_FETCH_TIMEOUT_MS,
} from './config.ts';

export type StoreProofReceipt = {
  version: 1;
  connection_id: string;
  challenge: string;
  client_id: string;
  service: string;
  site_id: string;
  site_origin: string;
  callback_uri: string;
  code_challenge: string;
  expires_at: number;
};

export type ProofFetchResult =
  | { ok: true; receipt: StoreProofReceipt; transport: 'production-fetch' | 'simulation' }
  | { ok: false; reason: string; transport: 'production-fetch' | 'simulation' };

export type ProofFetchFn = (input: {
  siteOrigin: string;
  connectionId: string;
}) => Promise<ProofFetchResult>;

const PRIVATE_HOSTS = new Set(['localhost', 'localhost.']);
const PRIVATE_SUFFIXES = ['.localhost', '.local', '.internal'];

export function isReservedOrPrivateHostname(hostname: string): boolean {
  const host = hostname.replace(/\.+$/, '').toLowerCase();
  if (PRIVATE_HOSTS.has(host) || host === '0.0.0.0') return true;
  if (PRIVATE_SUFFIXES.some(suffix => host.endsWith(suffix))) return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const parts = ipv4.slice(1).map(Number);
    if (parts.some(part => part > 255)) return true;
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (host.includes(':')) {
    const raw = host.replace(/^\[|\]$/g, '');
    if (raw === '::1' || raw.startsWith('fe80:') || raw.startsWith('fc') || raw.startsWith('fd')) return true;
    if (raw.startsWith('::ffff:')) return isReservedOrPrivateHostname(raw.slice(7));
  }
  return false;
}

export function parseCanonicalSiteOrigin(input: string): { ok: true; origin: string } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: 'invalid_site_origin' };
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    return { ok: false, reason: 'invalid_site_origin' };
  }
  const loopback = isReservedOrPrivateHostname(url.hostname);
  if (url.protocol === 'http:') {
    return { ok: false, reason: loopback ? 'loopback_origin_rejected' : 'site_origin_must_be_https' };
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'invalid_site_origin' };
  if (loopback) return { ok: false, reason: 'private_site_origin' };
  return { ok: true, origin: url.origin };
}

export function proofUrlFor(siteOrigin: string, connectionId: string): URL {
  const url = new URL(INVENTORY_PROOF_PATH, `${siteOrigin}/`);
  url.search = '';
  url.hash = '';
  url.searchParams.set('connection_id', connectionId);
  return url;
}

function asReceipt(value: unknown): StoreProofReceipt | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (row.version !== 1) return null;
  const required = ['connection_id', 'challenge', 'client_id', 'service', 'site_id', 'site_origin', 'callback_uri', 'code_challenge'] as const;
  for (const key of required) {
    if (typeof row[key] !== 'string' || !row[key]) return null;
  }
  if (typeof row.expires_at !== 'number' || !Number.isInteger(row.expires_at)) return null;
  return {
    version: 1,
    connection_id: row.connection_id as string,
    challenge: row.challenge as string,
    client_id: row.client_id as string,
    service: row.service as string,
    site_id: row.site_id as string,
    site_origin: row.site_origin as string,
    callback_uri: row.callback_uri as string,
    code_challenge: row.code_challenge as string,
    expires_at: row.expires_at,
  };
}

export async function fetchStoreProofReceipt(input: {
  siteOrigin: string;
  connectionId: string;
}): Promise<ProofFetchResult> {
  const origin = parseCanonicalSiteOrigin(input.siteOrigin);
  if (!origin.ok) return { ok: false, reason: origin.reason, transport: 'production-fetch' };
  const url = proofUrlFor(origin.origin, input.connectionId);
  if (url.username || url.password) return { ok: false, reason: 'invalid_proof_url', transport: 'production-fetch' };
  if (url.pathname !== INVENTORY_PROOF_PATH) return { ok: false, reason: 'invalid_proof_path', transport: 'production-fetch' };
  if ([...url.searchParams.keys()].join(',') !== 'connection_id') {
    return { ok: false, reason: 'invalid_proof_query', transport: 'production-fetch' };
  }
  if (isReservedOrPrivateHostname(url.hostname)) {
    return { ok: false, reason: 'private_proof_destination', transport: 'production-fetch' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROOF_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (response.redirected) return { ok: false, reason: 'proof_redirect_rejected', transport: 'production-fetch' };
    if (response.status !== 200) return { ok: false, reason: 'proof_unavailable', transport: 'production-fetch' };
    const length = Number(response.headers.get('content-length') ?? '0');
    if (length > PROOF_FETCH_MAX_BYTES) return { ok: false, reason: 'proof_too_large', transport: 'production-fetch' };
    const reader = response.body?.getReader();
    if (!reader) return { ok: false, reason: 'proof_empty', transport: 'production-fetch' };
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > PROOF_FETCH_MAX_BYTES) return { ok: false, reason: 'proof_too_large', transport: 'production-fetch' };
      chunks.push(value);
    }
    const receipt = asReceipt(JSON.parse(new TextDecoder().decode(concat(chunks))));
    if (!receipt) return { ok: false, reason: 'proof_malformed', transport: 'production-fetch' };
    return { ok: true, receipt, transport: 'production-fetch' };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, reason: 'proof_timeout', transport: 'production-fetch' };
    }
    return { ok: false, reason: 'proof_fetch_blocked', transport: 'production-fetch' };
  } finally {
    clearTimeout(timer);
  }
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export function compareProofReceipt(receipt: StoreProofReceipt, expected: StoreProofReceipt): string | null {
  const fields: Array<keyof StoreProofReceipt> = [
    'version', 'connection_id', 'challenge', 'client_id', 'service',
    'site_id', 'site_origin', 'callback_uri', 'code_challenge', 'expires_at',
  ];
  for (const field of fields) {
    if (receipt[field] !== expected[field]) return `proof_mismatch_${field}`;
  }
  return null;
}
