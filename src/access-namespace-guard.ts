import { defineMiddleware } from 'astro:middleware';
import { authenticate as officialAuthenticate } from '@emdash-cms/cloudflare/auth';
import {
  ACCESS_AUDIENCE_ENV,
  ACCESS_TEAM_DOMAIN_ENV,
  OPERATOR_ALLOWLIST_ENV,
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
  };
}

export function createAccessNamespaceGuard(options: {
  authenticate?: typeof officialAuthenticate;
} = {}) {
  const authenticate = options.authenticate ?? officialAuthenticate;
  return defineMiddleware(async (context, next) => {
    let pathname = context.url.pathname;
    try {
      pathname = requestPathname(context.request);
      const decision = await evaluateAccessGate({
        pathname,
        request: context.request,
        env: readGateEnv(context),
        authenticate,
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
 * runtime operator allowlist. Host, forwarded headers, and spoofed
 * cookies are not unlocks.
 */
export const onRequest = createAccessNamespaceGuard();
