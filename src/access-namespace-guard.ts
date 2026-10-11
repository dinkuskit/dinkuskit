import { defineMiddleware } from 'astro:middleware';
import { authenticate as accessAuthenticate } from '../scripts/lib/access-auth-entry.mjs';
import {
  ACCESS_AUDIENCE_ENV,
  ACCESS_TEAM_DOMAIN_ENV,
  OPERATOR_ALLOWLIST_ENV,
  OPERATOR_SERVICE_TOKENS_ENV,
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

export function createAccessNamespaceGuard(options: {
  authenticate?: typeof accessAuthenticate;
} = {}) {
  const authenticate = options.authenticate ?? accessAuthenticate;
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
 * runtime operator allowlist, or the verified Access JWT is a service token
 * whose common name is on EMDASH_OPERATOR_SERVICE_TOKENS. Host, forwarded headers, and spoofed
 * cookies are not unlocks.
 */
export const onRequest = createAccessNamespaceGuard();
