import type { BlockResponse } from "@emdash-cms/blocks";

export const DINKUSGUIDE_PLUGIN_ID = "dinkusguide-chat" as const;
export const DINKUSGUIDE_PUBLISHER_DID = "did:plc:ekk4pjmkh3k3ql2kfoex3qt4" as const;
export const DINKUSGUIDE_DEFAULT_ALLOWED_HOSTS = Object.freeze([
  "guide.dinkuskit.com",
]);

export const DINKUSGUIDE_LIMIT_DEFAULTS = Object.freeze({
  maxQuestionCharacters: 2000,
  maxBodyBytes: 16384,
  maxResponseBytes: 65536,
  timeoutMs: 20000,
  maxConcurrency: 2,
  requestsPerMinute: 20,
  perIpRequestsPerMinute: 6,
});

export const DINKUSGUIDE_LIMIT_BOUNDS = Object.freeze({
  maxQuestionCharacters: { min: 1, max: 8000 },
  timeoutMs: { min: 1000, max: 25000 },
  maxConcurrency: { min: 1, max: 16 },
  requestsPerMinute: { min: 1, max: 600 },
  perIpRequestsPerMinute: { min: 1, max: 120 },
  minServiceTokenLength: 32,
  maxCitations: 32,
});

export type GuideAnswerStatus = "answered" | "insufficient_evidence" | "out_of_scope";

export type PublicPluginErrorCode =
  | "invalid_request"
  | "method_not_allowed"
  | "too_large"
  | "overloaded"
  | "unavailable"
  | "timeout";

export interface PublicGuideAskSuccess {
  status: GuideAnswerStatus;
  answer: string;
  citations: string[];
}

export interface PublicGuideAskError {
  error: PublicPluginErrorCode;
}

export interface PublicGuideConfigResponse {
  enabled: boolean;
  maxQuestionCharacters: number;
  timeoutMs: number;
}

export interface ResolvedPluginSettings {
  enabled: boolean;
  ready: boolean;
  publicEnabled: boolean;
  serviceUrl: string | null;
  serviceHost: string | null;
  serviceToken: string | null;
  maxQuestionCharacters: number;
  maxBodyBytes: number;
  maxResponseBytes: number;
  timeoutMs: number;
  maxConcurrency: number;
  requestsPerMinute: number;
  perIpRequestsPerMinute: number;
  issues: string[];
}

export interface KvConditionalStore {
  getVersioned(key: string): Promise<{ value: unknown; revision: string } | null>;
  compareAndSet(
    key: string,
    expectedRevision: string | null,
    value: unknown,
  ): Promise<{ applied: boolean; revision?: string }>;
}

interface AdmissionLease {
  id: string;
  expiresAt: number;
}

interface AdmissionDocument {
  activeLeases: AdmissionLease[];
  windowStart: number;
  windowCount: number;
  ipCounts: Record<string, number>;
}

const ADMISSION_KV_KEY = "admission:v1";
const RATE_WINDOW_MS = 60_000;
// A returned timeout does not prove the bridge request stopped. The Guide service
// independently bounds model work to 90 seconds and two active children.
const LEASE_GRACE_MS = 95_000;
const MAX_CAS_ATTEMPTS = 8;

const JSON_CONTENT_TYPE_RE = /^application\/json(?:\s*;\s*charset=utf-8)?$/i;
const GITHUB_BLOB_PATH_RE = /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/blob\/[a-f0-9]{40}\/.+/;
const LINE_ANCHOR_HASH_RE = /^#L([1-9]\d*)(?:-L([1-9]\d*))?$/;
const PROTO_KEY_TOKEN_RE = /"__proto__"\s*:/;

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
const utf8Encoder = new TextEncoder();

export function countUnicodeCodePoints(value: string): number {
  let count = 0;
  for (const _ of value) {
    count += 1;
  }
  return count;
}

export function utf8ByteLength(value: string): number {
  return utf8Encoder.encode(value).byteLength;
}

function readHeaderCaseInsensitive(
  headers: Record<string, string> | Headers | undefined,
  targetName: string,
): string | undefined {
  if (!headers) return undefined;
  const lower = targetName.toLowerCase();
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(lower) ?? undefined;
  }
  const record = headers as Record<string, string>;
  if (typeof record[lower] === "string") return record[lower];
  for (const [key, value] of Object.entries(record)) {
    if (key.toLowerCase() === lower && typeof value === "string") {
      return value;
    }
  }
  return undefined;
}

function validateServiceUrl(raw: unknown): { url: string; hostname: string } | { issue: string } {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { issue: "Ask endpoint URL is not configured." };
  }
  const trimmed = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { issue: "Ask endpoint URL is not a valid URL." };
  }
  if (parsed.protocol !== "https:") {
    return { issue: "Ask endpoint URL must use HTTPS." };
  }
  if (parsed.username || parsed.password) {
    return { issue: "Ask endpoint URL must not embed credentials." };
  }
  if (parsed.search || parsed.hash) {
    return { issue: "Ask endpoint URL must not include query parameters or fragments." };
  }
  if (!parsed.pathname.endsWith("/ask") || parsed.pathname.includes("..")) {
    return { issue: "Ask endpoint URL path must end with /ask." };
  }
  return { url: parsed.href, hostname: parsed.hostname.toLowerCase() };
}

function validateServiceToken(raw: unknown): { token: string } | { issue: string } {
  if (typeof raw !== "string" || raw.length === 0) {
    return { issue: "Service token is not configured." };
  }
  if (raw.length < DINKUSGUIDE_LIMIT_BOUNDS.minServiceTokenLength || /\s/.test(raw)) {
    return {
      issue: `Service token must contain at least ${DINKUSGUIDE_LIMIT_BOUNDS.minServiceTokenLength} non-whitespace characters.`,
    };
  }
  return { token: raw };
}

function resolveBoundedInt(
  raw: unknown,
  fallback: number,
  bounds: { min: number; max: number },
  label: string,
  issues: string[],
): number {
  if (raw === undefined || raw === null) {
    return fallback;
  }
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < bounds.min || raw > bounds.max) {
    issues.push(`${label} must be an integer between ${bounds.min} and ${bounds.max}.`);
    return fallback;
  }
  return raw;
}

export function resolvePluginSettings(
  rawSettings: Record<string, unknown> | null | undefined,
): ResolvedPluginSettings {
  const raw = rawSettings ?? {};
  const issues: string[] = [];

  let enabled = false;
  if (raw.enabled !== undefined && raw.enabled !== null) {
    if (typeof raw.enabled !== "boolean") {
      issues.push("Enable toggle must be a boolean.");
    } else {
      enabled = raw.enabled;
    }
  }

  const urlCheck = validateServiceUrl(raw.serviceUrl);
  const tokenCheck = validateServiceToken(raw.serviceToken);

  if ("issue" in urlCheck) issues.push(urlCheck.issue);
  if ("issue" in tokenCheck) issues.push(tokenCheck.issue);

  const maxQuestionCharacters = resolveBoundedInt(
    raw.maxQuestionCharacters,
    DINKUSGUIDE_LIMIT_DEFAULTS.maxQuestionCharacters,
    DINKUSGUIDE_LIMIT_BOUNDS.maxQuestionCharacters,
    "Maximum question length",
    issues,
  );
  const timeoutMs = resolveBoundedInt(
    raw.timeoutMs,
    DINKUSGUIDE_LIMIT_DEFAULTS.timeoutMs,
    DINKUSGUIDE_LIMIT_BOUNDS.timeoutMs,
    "Upstream request timeout",
    issues,
  );
  const maxConcurrency = resolveBoundedInt(
    raw.maxConcurrency,
    DINKUSGUIDE_LIMIT_DEFAULTS.maxConcurrency,
    DINKUSGUIDE_LIMIT_BOUNDS.maxConcurrency,
    "Maximum concurrent requests",
    issues,
  );
  const requestsPerMinute = resolveBoundedInt(
    raw.requestsPerMinute,
    DINKUSGUIDE_LIMIT_DEFAULTS.requestsPerMinute,
    DINKUSGUIDE_LIMIT_BOUNDS.requestsPerMinute,
    "Global requests per minute",
    issues,
  );
  const perIpRequestsPerMinute = resolveBoundedInt(
    raw.perIpRequestsPerMinute,
    DINKUSGUIDE_LIMIT_DEFAULTS.perIpRequestsPerMinute,
    DINKUSGUIDE_LIMIT_BOUNDS.perIpRequestsPerMinute,
    "Per-IP requests per minute",
    issues,
  );

  const ready = issues.length === 0 && "url" in urlCheck && "token" in tokenCheck;

  return {
    enabled,
    ready,
    publicEnabled: enabled && ready,
    serviceUrl: "url" in urlCheck ? urlCheck.url : null,
    serviceHost: "url" in urlCheck ? urlCheck.hostname : null,
    serviceToken: "token" in tokenCheck ? tokenCheck.token : null,
    maxQuestionCharacters,
    maxBodyBytes: DINKUSGUIDE_LIMIT_DEFAULTS.maxBodyBytes,
    maxResponseBytes: DINKUSGUIDE_LIMIT_DEFAULTS.maxResponseBytes,
    timeoutMs,
    maxConcurrency,
    requestsPerMinute,
    perIpRequestsPerMinute,
    issues,
  };
}

export function buildPublicConfigResponse(settings: ResolvedPluginSettings): PublicGuideConfigResponse {
  return { enabled: settings.publicEnabled, maxQuestionCharacters: settings.maxQuestionCharacters, timeoutMs: settings.timeoutMs };
}

export function parseAskRequestPayload(
  rawBytes: Uint8Array,
  headers: Record<string, string> | Headers | undefined,
  limits: { maxQuestionCharacters: number; maxBodyBytes: number },
):
  | { ok: true; question: string; codePoints: number }
  | { ok: false; status: 400 | 413; error: "invalid_request" | "too_large" } {
  const contentEncoding = readHeaderCaseInsensitive(headers, "content-encoding");
  const contentType = readHeaderCaseInsensitive(headers, "content-type") ?? "";
  if (contentEncoding || !JSON_CONTENT_TYPE_RE.test(contentType)) {
    return { ok: false, status: 400, error: "invalid_request" };
  }

  if (rawBytes.byteLength > limits.maxBodyBytes) {
    return { ok: false, status: 413, error: "too_large" };
  }
  if (rawBytes.byteLength === 0) {
    return { ok: false, status: 400, error: "invalid_request" };
  }

  let decoded: string;
  try {
    decoded = utf8Decoder.decode(rawBytes);
  } catch {
    return { ok: false, status: 400, error: "invalid_request" };
  }

  if (PROTO_KEY_TOKEN_RE.test(decoded)) {
    return { ok: false, status: 400, error: "invalid_request" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return { ok: false, status: 400, error: "invalid_request" };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, status: 400, error: "invalid_request" };
  }

  const keys = Object.getOwnPropertyNames(parsed);
  if (keys.length !== 1 || keys[0] !== "question") {
    return { ok: false, status: 400, error: "invalid_request" };
  }

  const question = (parsed as { question: unknown }).question;
  if (typeof question !== "string" || question.includes("\0") || question.trim().length === 0) {
    return { ok: false, status: 400, error: "invalid_request" };
  }

  const codePoints = countUnicodeCodePoints(question);
  if (codePoints > limits.maxQuestionCharacters) {
    return { ok: false, status: 413, error: "too_large" };
  }

  return { ok: true, question, codePoints };
}

export function isVerifiedPublicCitationUrl(candidate: unknown): candidate is string {
  if (typeof candidate !== "string" || candidate.length === 0 || candidate.length > 2048) {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return false;
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "github.com" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.port !== "" ||
    parsed.search !== ""
  ) {
    return false;
  }
  if (!GITHUB_BLOB_PATH_RE.test(parsed.pathname)) {
    return false;
  }
  const segments = parsed.pathname.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return false;
  }
  if (parsed.hash === "") return false;
  if (!["dinkuskit", "emdash-cms"].includes(segments[1] ?? "")) return false;
  if (parsed.hash !== "") {
    const hashMatch = LINE_ANCHOR_HASH_RE.exec(parsed.hash);
    if (!hashMatch) return false;
    const startLine = Number(hashMatch[1]);
    const endLine = hashMatch[2] ? Number(hashMatch[2]) : startLine;
    if (!Number.isSafeInteger(startLine) || !Number.isSafeInteger(endLine) || endLine < startLine) {
      return false;
    }
  }
  return parsed.href === candidate;
}

export function validateUpstreamGuideResponse(
  status: number,
  rawBytes: Uint8Array,
  maxResponseBytes: number = DINKUSGUIDE_LIMIT_DEFAULTS.maxResponseBytes,
):
  | { ok: true; status: 200; body: PublicGuideAskSuccess }
  | { ok: false; status: 400 | 413 | 429 | 503 | 504; error: PublicPluginErrorCode } {
  if (status === 429) return { ok: false, status: 429, error: "overloaded" };
  if (status === 504) return { ok: false, status: 504, error: "timeout" };
  if (status === 413) return { ok: false, status: 413, error: "too_large" };
  if (status === 400) return { ok: false, status: 400, error: "invalid_request" };
  if (status !== 200) return { ok: false, status: 503, error: "unavailable" };

  if (rawBytes.byteLength === 0 || rawBytes.byteLength > maxResponseBytes) {
    return { ok: false, status: 503, error: "unavailable" };
  }

  let decoded: string;
  try {
    decoded = utf8Decoder.decode(rawBytes);
  } catch {
    return { ok: false, status: 503, error: "unavailable" };
  }

  if (PROTO_KEY_TOKEN_RE.test(decoded)) {
    return { ok: false, status: 503, error: "unavailable" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return { ok: false, status: 503, error: "unavailable" };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, status: 503, error: "unavailable" };
  }

  const keys = Object.getOwnPropertyNames(parsed);
  if (
    keys.length !== 3 ||
    !keys.includes("status") ||
    !keys.includes("answer") ||
    !keys.includes("citations")
  ) {
    return { ok: false, status: 503, error: "unavailable" };
  }

  const record = parsed as Record<string, unknown>;
  const guideStatus = record.status;
  if (
    guideStatus !== "answered" &&
    guideStatus !== "insufficient_evidence" &&
    guideStatus !== "out_of_scope"
  ) {
    return { ok: false, status: 503, error: "unavailable" };
  }

  const answer = record.answer;
  if (typeof answer !== "string" || answer.trim().length === 0 || answer.includes("\0")) {
    return { ok: false, status: 503, error: "unavailable" };
  }

  const rawCitations = record.citations;
  if (
    !Array.isArray(rawCitations) ||
    rawCitations.length > DINKUSGUIDE_LIMIT_BOUNDS.maxCitations
  ) {
    return { ok: false, status: 503, error: "unavailable" };
  }

  const citations: string[] = [];
  for (const item of rawCitations) {
    if (!isVerifiedPublicCitationUrl(item)) {
      return { ok: false, status: 503, error: "unavailable" };
    }
    citations.push(item);
  }

  if ((guideStatus === "answered") !== (citations.length > 0)) {
    return { ok: false, status: 503, error: "unavailable" };
  }

  const normalized: PublicGuideAskSuccess = {
    status: guideStatus,
    answer,
    citations,
  };

  if (utf8ByteLength(JSON.stringify(normalized)) > maxResponseBytes) {
    return { ok: false, status: 503, error: "unavailable" };
  }

  return { ok: true, status: 200, body: normalized };
}

export function extractTrustedClientIp(requestMeta: unknown): string | null {
  if (!requestMeta || typeof requestMeta !== "object") return null;
  const ip = (requestMeta as { ip?: unknown }).ip;
  if (typeof ip !== "string") return null;
  const trimmed = ip.trim();
  if (trimmed.length === 0 || trimmed.length > 64 || !/^[\da-fA-F.:]+$/.test(trimmed)) {
    return null;
  }
  return trimmed.toLowerCase();
}

async function hashWindowClientBucket(windowStart: number, clientIp: string): Promise<string> {
  const bytes = utf8Encoder.encode(`dinkusguide-rate:v1:${windowStart}:${clientIp}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const view = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < 8; i += 1) {
    hex += (view[i] ?? 0).toString(16).padStart(2, "0");
  }
  return hex;
}

function normalizeAdmissionDocument(raw: unknown, now: number): AdmissionDocument {
  const currentWindow = Math.floor(now / RATE_WINDOW_MS) * RATE_WINDOW_MS;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      activeLeases: [],
      windowStart: currentWindow,
      windowCount: 0,
      ipCounts: {},
    };
  }
  const doc = raw as Partial<AdmissionDocument>;
  const activeLeases = Array.isArray(doc.activeLeases)
    ? doc.activeLeases.filter(
        (lease): lease is AdmissionLease =>
          Boolean(lease) &&
          typeof lease === "object" &&
          typeof lease.id === "string" &&
          typeof lease.expiresAt === "number" &&
          Number.isFinite(lease.expiresAt) &&
          lease.expiresAt > now,
      )
    : [];

  const sameWindow = doc.windowStart === currentWindow;
  const windowCount =
    sameWindow && typeof doc.windowCount === "number" && Number.isSafeInteger(doc.windowCount) && doc.windowCount >= 0
      ? doc.windowCount
      : 0;

  const ipCounts: Record<string, number> = {};
  if (sameWindow && doc.ipCounts && typeof doc.ipCounts === "object" && !Array.isArray(doc.ipCounts)) {
    for (const [bucket, count] of Object.entries(doc.ipCounts)) {
      if (
        /^[0-9a-f]{16}$/.test(bucket) &&
        typeof count === "number" &&
        Number.isSafeInteger(count) &&
        count > 0
      ) {
        ipCounts[bucket] = count;
      }
    }
  }

  return {
    activeLeases,
    windowStart: currentWindow,
    windowCount,
    ipCounts,
  };
}

export async function acquireAdmissionLease(
  kv: KvConditionalStore,
  options: {
    now?: number;
    timeoutMs: number;
    maxConcurrency: number;
    requestsPerMinute: number;
    perIpRequestsPerMinute: number;
    clientIp: string | null;
  },
): Promise<{ acquired: true; leaseId: string } | { acquired: false }> {
  const leaseId = crypto.randomUUID();
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const now = options.now ?? Date.now();
    const versioned = await kv.getVersioned(ADMISSION_KV_KEY);
    const current = normalizeAdmissionDocument(versioned?.value, now);

    if (
      current.activeLeases.length >= options.maxConcurrency ||
      current.windowCount >= options.requestsPerMinute
    ) {
      return { acquired: false };
    }

    let ipBucket: string | null = null;
    if (options.clientIp) {
      ipBucket = await hashWindowClientBucket(current.windowStart, options.clientIp);
      const currentIpCount = current.ipCounts[ipBucket] ?? 0;
      if (currentIpCount >= options.perIpRequestsPerMinute) {
        return { acquired: false };
      }
    }

    const nextIpCounts = { ...current.ipCounts };
    if (ipBucket) {
      nextIpCounts[ipBucket] = (nextIpCounts[ipBucket] ?? 0) + 1;
      // Bound map cardinality even under distributed IP churn.
      if (Object.keys(nextIpCounts).length > 512) {
        return { acquired: false };
      }
    }

    const nextDoc: AdmissionDocument = {
      activeLeases: [
        ...current.activeLeases,
        { id: leaseId, expiresAt: now + options.timeoutMs + LEASE_GRACE_MS },
      ],
      windowStart: current.windowStart,
      windowCount: current.windowCount + 1,
      ipCounts: nextIpCounts,
    };

    const cas = await kv.compareAndSet(ADMISSION_KV_KEY, versioned?.revision ?? null, nextDoc);
    if (cas.applied) {
      return { acquired: true, leaseId };
    }
  }
  return { acquired: false };
}

export async function releaseAdmissionLease(
  kv: KvConditionalStore,
  leaseId: string,
  nowOverride?: number,
): Promise<void> {
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const now = nowOverride ?? Date.now();
    const versioned = await kv.getVersioned(ADMISSION_KV_KEY);
    if (!versioned) return;
    const current = normalizeAdmissionDocument(versioned.value, now);
    if (!current.activeLeases.some((lease) => lease.id === leaseId)) {
      return;
    }
    const nextDoc: AdmissionDocument = {
      ...current,
      activeLeases: current.activeLeases.filter((lease) => lease.id !== leaseId),
    };
    const cas = await kv.compareAndSet(ADMISSION_KV_KEY, versioned.revision, nextDoc);
    if (cas.applied) return;
  }
}

export function buildAdminOverviewBlocks(settings: ResolvedPluginSettings): BlockResponse {
  return { blocks: [
    { type: "header", text: "DinkusGuide Chat" },
    { type: "banner", variant: settings.enabled && !settings.ready ? "alert" : "default",
      title: settings.publicEnabled ? "Ask DinkusGuide is enabled for approved public pages" : "Ask DinkusGuide is disabled",
      description: settings.issues.length ? settings.issues.join(" ") : "The authenticated ask-only service is configured." },
    { type: "section", text: "Service connection settings belong here. Public source admission, retrieval, model selection, and citation verification belong to DinkusGuide. Unpublished drafts, operator data, and merchant accounts are outside this pilot." },
    { type: "fields", fields: [
      { label: "Ask endpoint host", value: settings.serviceHost ?? "Not configured" },
      { label: "Service token", value: settings.serviceToken ? "Configured (encrypted)" : "Not configured" },
      { label: "Question limit", value: `${settings.maxQuestionCharacters} Unicode code points` },
      { label: "Visitor response wait", value: `${settings.timeoutMs} ms` },
      { label: "Admission limits", value: `${settings.maxConcurrency} active; ${settings.requestsPerMinute}/min globally; ${settings.perIpRequestsPerMinute}/min per verified IP` },
    ] },
    { type: "context", text: "Stateless questions: no visitor transcripts, raw IPs, questions, answers, or credentials are stored in plugin KV. The host separately opts in to the frontend on approved public routes." },
  ] };
}
