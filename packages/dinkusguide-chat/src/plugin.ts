import {
  pluginResponse,
  pluginRoute,
  type PluginContext,
  type SandboxedPlugin,
} from "emdash/plugin";
import {
  acquireAdmissionLease,
  buildAdminOverviewBlocks,
  buildPublicConfigResponse,
  DINKUSGUIDE_LIMIT_DEFAULTS,
  extractTrustedClientIp,
  parseAskRequestPayload,
  releaseAdmissionLease,
  resolvePluginSettings,
  validateUpstreamGuideResponse,
  type PublicGuideAskError,
  type PublicPluginErrorCode,
} from "./contract";

class UpstreamDeadlineError extends Error {
  constructor() {
    super("timeout");
    this.name = "UpstreamDeadlineError";
  }
}

class UpstreamOversizedError extends Error {
  constructor() {
    super("unavailable");
    this.name = "UpstreamOversizedError";
  }
}

async function loadSettingsRecord(ctx: PluginContext): Promise<Record<string, unknown>> {
  const entries = await ctx.settings.list();
  const record: Record<string, unknown> = {};
  for (const entry of entries) {
    record[entry.key] = entry.value;
  }
  return record;
}

function jsonResponse(
  status: number,
  payload: unknown,
  extraHeaders?: Record<string, string>,
) {
  return pluginResponse({
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    },
    body: {
      kind: "text",
      value: JSON.stringify(payload),
    },
  });
}

function errorResponse(status: number, error: PublicPluginErrorCode) {
  const payload: PublicGuideAskError = { error };
  return jsonResponse(status, payload, status === 429 ? { "retry-after": "60" } : undefined);
}

function hasQueryParams(urlString: string, queryInput?: unknown): boolean {
  if (queryInput && typeof queryInput === "object" && Object.keys(queryInput).length > 0) {
    return true;
  }
  try {
    return new URL(urlString).search !== "";
  } catch {
    return true;
  }
}

async function readBoundedResponseBytes(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!response.body) {
    return new Uint8Array(0);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // Ignore stream cancellation error on oversized response.
        }
        throw new UpstreamOversizedError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

async function fetchGuideWithDeadline(
  ctx: PluginContext,
  serviceUrl: string,
  serviceToken: string,
  question: string,
  timeoutMs: number,
  maxResponseBytes: number,
  onSettled: () => Promise<void>,
): Promise<{ status: number; bytes: Uint8Array }> {
  const httpAccess = ctx.http;
  if (!httpAccess) {
    throw new Error("Outbound HTTP capability is not granted");
  }

  let timerId: ReturnType<typeof setTimeout> | undefined;
  const deadlinePromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      reject(new UpstreamDeadlineError());
    }, timeoutMs);
  });

  const requestPromise = (async () => {
    const response = await httpAccess.fetch(serviceUrl, {
      method: "POST",
      redirect: "error",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${serviceToken}`,
      },
      body: JSON.stringify({ question }),
    });
    const bytes = await readBoundedResponseBytes(response, maxResponseBytes);
    return { status: response.status, bytes };
  })().finally(onSettled);

  // Prevent unhandled rejection if deadline wins before the bridge settles.
  void requestPromise.catch(() => {});

  try {
    return await Promise.race([requestPromise, deadlinePromise]);
  } finally {
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }
  }
}

const plugin: SandboxedPlugin = {
  routes: {
    config: pluginRoute({
      public: true,
      methods: ["GET"],
      request: {
        body: "none",
      },
      response: "raw",
      handler: async (routeCtx, ctx) => {
        if (routeCtx.request.method.toUpperCase() !== "GET") {
          return errorResponse(405, "method_not_allowed");
        }
        if (hasQueryParams(routeCtx.request.url, routeCtx.input)) {
          return errorResponse(400, "invalid_request");
        }
        try {
          const rawSettings = await loadSettingsRecord(ctx);
          const settings = resolvePluginSettings(rawSettings);
          return jsonResponse(200, buildPublicConfigResponse(settings));
        } catch {
          return errorResponse(503, "unavailable");
        }
      },
    }),

    ask: pluginRoute({
      public: true,
      methods: ["POST"],
      request: {
        body: "bytes",
        maxBytes: DINKUSGUIDE_LIMIT_DEFAULTS.maxBodyBytes,
        headers: ["content-type", "content-encoding"],
      },
      response: "raw",
      handler: async (routeCtx, ctx) => {
        if (routeCtx.request.method.toUpperCase() !== "POST") {
          return errorResponse(405, "method_not_allowed");
        }
        if (hasQueryParams(routeCtx.request.url)) {
          return errorResponse(400, "invalid_request");
        }

        let settings;
        try {
          settings = resolvePluginSettings(await loadSettingsRecord(ctx));
        } catch {
          return errorResponse(503, "unavailable");
        }

        const rawBytes =
          routeCtx.input instanceof Uint8Array ? routeCtx.input : new Uint8Array(0);
        const parsed = parseAskRequestPayload(rawBytes, routeCtx.request.headers, {
          maxQuestionCharacters: settings.maxQuestionCharacters,
          maxBodyBytes: settings.maxBodyBytes,
        });
        if (!parsed.ok) {
          return errorResponse(parsed.status, parsed.error);
        }

        if (!settings.publicEnabled || !settings.serviceUrl || !settings.serviceToken) {
          return errorResponse(503, "unavailable");
        }

        let lease;
        try {
          lease = await acquireAdmissionLease(ctx.kv, {
            timeoutMs: settings.timeoutMs,
            maxConcurrency: settings.maxConcurrency,
            requestsPerMinute: settings.requestsPerMinute,
            perIpRequestsPerMinute: settings.perIpRequestsPerMinute,
            clientIp: extractTrustedClientIp(routeCtx.requestMeta),
          });
        } catch {
          return errorResponse(503, "unavailable");
        }

        if (!lease.acquired) {
          return errorResponse(429, "overloaded");
        }

        try {
          const upstream = await fetchGuideWithDeadline(
            ctx,
            settings.serviceUrl,
            settings.serviceToken,
            parsed.question,
            settings.timeoutMs,
            settings.maxResponseBytes,
            async () => {
              try { await releaseAdmissionLease(ctx.kv, lease.leaseId); } catch { /* Conservatively retained lease expires. */ }
            },
          );
          const validated = validateUpstreamGuideResponse(
            upstream.status,
            upstream.bytes,
            settings.maxResponseBytes,
          );
          if (!validated.ok) {
            return errorResponse(validated.status, validated.error);
          }
          return jsonResponse(200, validated.body);
        } catch (error) {
          if (error instanceof UpstreamDeadlineError) {
            return errorResponse(504, "timeout");
          }
          return errorResponse(503, "unavailable");
        }
      },
    }),

    admin: {
      permission: "settings:manage",
      methods: ["POST"],
      handler: async (routeCtx, ctx) => {
        if (!routeCtx.user?.id) {
          return {
            blocks: [
              {
                type: "banner",
                variant: "error",
                title: "Sign in as an EmDash Admin to view DinkusGuide status.",
              },
            ],
          };
        }
        const settings = resolvePluginSettings(await loadSettingsRecord(ctx));
        return buildAdminOverviewBlocks(settings);
      },
    },
  },
};

export default plugin;
