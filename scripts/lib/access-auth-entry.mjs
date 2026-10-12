/**
 * EmDash auth provider entrypoint (`virtual:emdash/auth`). Wraps official
 * `@emdash-cms/cloudflare/auth` with the allowlisted service-token branch.
 */
import { authenticate as officialAuthenticate } from '@emdash-cms/cloudflare/auth';
import { createAccessAuthenticate } from './access-service-token-auth.mjs';

export const authenticate = createAccessAuthenticate({ officialAuthenticate });
