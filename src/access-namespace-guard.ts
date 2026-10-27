import { defineMiddleware } from 'astro:middleware';
import { guidePilot, guidePublicRequest } from './guide/policy.ts';
import { authenticate as accessAuthenticate } from '../scripts/lib/access-auth-entry.mjs';
import {
  ACCESS_AUDIENCE_ENV,
  ACCESS_TEAM_DOMAIN_ENV,
  OPERATOR_ALLOWLIST_ENV,
  OPERATOR_SERVICE_TOKENS_ENV,
  cmsHasActiveAdmin,
  deniedNamespaceResponse,
  evaluateAccessGate,
  isEmdashNamespace,
  requestPathname,
} from '../scripts/lib/access-namespace-gate.mjs';

export function readGateEnv(_context?: { locals?: App.Locals }): Record<string, string | undefined> {
  const buildTeamDomain =
    typeof import.meta.env !== 'undefined' ? import.meta.env.EMDASH_ACCESS_TEAM_DOMAIN : undefined;
  return {
    [ACCESS_TEAM_DOMAIN_ENV]:
      process.env[ACCESS_TEAM_DOMAIN_ENV]
      ?? (typeof buildTeamDomain === 'string' ? buildTeamDomain : undefined),
    [ACCESS_AUDIENCE_ENV]: process.env[ACCESS_AUDIENCE_ENV],
    [OPERATOR_ALLOWLIST_ENV]: process.env[OPERATOR_ALLOWLIST_ENV],
    [OPERATOR_SERVICE_TOKENS_ENV]: process.env[OPERATOR_SERVICE_TOKENS_ENV],
  };
}

/** Reads the EmDash CMS D1 binding (`DB`) and checks for an enabled Admin. */
export async function defaultHasActiveAdmin(): Promise<boolean> {
  try {
    const { env } = await import('cloudflare:workers');
    return await cmsHasActiveAdmin((env as unknown as Record<string, unknown>).DB);
  } catch {
    return false;
  }
}

export function createAccessNamespaceGuard(options: {
  authenticate?: typeof accessAuthenticate;
  hasActiveAdmin?: () => Promise<boolean>;
} = {}) {
  const authenticate = options.authenticate ?? accessAuthenticate;
  const hasActiveAdmin = options.hasActiveAdmin ?? defaultHasActiveAdmin;
  return defineMiddleware(async (context, next) => {
    const guide = guidePilot(
      typeof import.meta.env !== 'undefined' ? import.meta.env.DINKUS_GUIDE_PILOT : undefined,
      typeof import.meta.env !== 'undefined' ? import.meta.env.DINKUS_GUIDE_PLUGIN_ID : undefined,
    );
    if (guidePublicRequest(context.request, context.url, guide)) return next();
    let pathname = context.url.pathname;
    try {
      pathname = requestPathname(context.request);
      const decision = await evaluateAccessGate({
        pathname,
        request: context.request,
        env: readGateEnv(context),
        authenticate,
        hasActiveAdmin,
      });
      if (decision.allow) return next();
      return deniedNamespaceResponse();
    } catch {
      if (isEmdashNamespace(pathname)) {
        return deniedNamespaceResponse();
      }
      return next();
    }
  });
}

/**
 * Hosted-candidate outer middleware. Denies the complete `/_emdash`
 * namespace, including setup and login, before EmDash runtime unless
 * official Access `authenticate` succeeds and the identity is on the
 * runtime operator allowlist, or the verified Access JWT is a service token
 * whose common name is on EMDASH_OPERATOR_SERVICE_TOKENS and the CMS already
 * has an enabled human Admin (so a token can never become the first Admin). Host, forwarded headers, and spoofed
 * cookies are not unlocks.
 */
export const onRequest = createAccessNamespaceGuard();
