declare module 'cloudflare:workers' {
  export const env: Cloudflare.Env;
  export const exports: Record<string, unknown>;
}
