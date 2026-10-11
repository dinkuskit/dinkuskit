declare module '../scripts/lib/access-namespace-gate.mjs' {
  export const EMDASH_NAMESPACE: string;
  export const INSTALLED_EDITOR_ROLE: number;
  export const ACCESS_AUDIENCE_ENV: string;
  export const ACCESS_TEAM_DOMAIN_ENV: string;
  export const OPERATOR_ALLOWLIST_ENV: string;
  export const OPERATOR_SERVICE_TOKENS_ENV: string;
  export const SERVICE_TOKEN_EMAIL_DOMAIN: string;
  export function parseServiceTokenList(value: unknown): string[];
  export function serviceTokenEmail(commonName: string): string;
  export function decodeRoutingPathname(pathname: string): string;
  export function resolveNamespacePathname(pathname: string): {
    kind: 'public' | 'protected' | 'malformed-protected';
    pathname: string;
  };
  export function isEmdashNamespace(pathname: string): boolean;
  export function requestPathname(request: Request): string;
  export function hasAccessJwt(request: Request): boolean;
  export function trimEnv(value: unknown): string;
  export function parseOperatorAllowlist(value: unknown): string[];
  export function readAccessGateConfig(env?: Record<string, string | undefined>): {
    teamDomain: string;
    audience: string;
    allowlist: string[];
    serviceTokens: string[];
  };
  export function accessConfigMissing(config: {
    teamDomain: string;
    audience: string;
    allowlist: string[];
    serviceTokens?: string[];
  }): boolean;
  export function officialAccessConfig(config: {
    teamDomain: string;
    audience: string;
    serviceTokens?: string[];
  }): {
    teamDomain: string;
    audience: string;
    audienceEnvVar: string;
    defaultRole: number;
    serviceTokens: string[];
  };
  export function deniedNamespaceResponse(): Response;
  export function evaluateAccessGate(input: {
    pathname: string;
    request: Request;
    env?: Record<string, string | undefined>;
    authenticate?: (request: Request, config: unknown) => Promise<{ email?: string; serviceToken?: string }>;
  }): Promise<{ allow: boolean; status?: number; reason: string; email?: string }>;
}

declare module '../scripts/lib/access-auth-entry.mjs' {
  export function authenticate(
    request: Request,
    config: unknown,
  ): Promise<{ email: string; name: string; role: number; subject?: string; serviceToken?: string }>;
}
