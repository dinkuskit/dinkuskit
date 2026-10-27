export interface GuidePilot { pluginId: string; configUrl: string; askUrl: string }

/** A build-time opt-in; the installed runtime ID is not an assistant credential. */
export function guidePilot(enabled: unknown, pluginId: unknown): GuidePilot | null {
  if (enabled !== 'true' || typeof pluginId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(pluginId)) return null;
  const root = `/_emdash/api/plugins/${pluginId}`;
  return { pluginId, configUrl: `${root}/config`, askUrl: `${root}/ask` };
}

const publicPages = new Set(['/', '/start', '/getting-started', '/docs', '/support', '/plugins']);
export function guideAllowedPage(pathname: string): boolean {
  return publicPages.has(pathname) || /^\/docs\/[a-zA-Z0-9/_-]+$/.test(pathname);
}

/** Only two exact public plugin operations bypass the outer namespace gate. */
export function guidePublicRequest(request: Request, url: URL, pilot: GuidePilot | null): boolean {
  if (!pilot || url.search || url.hash) return false;
  const raw = new URL(request.url);
  if (raw.pathname !== url.pathname || raw.search || raw.hash) return false;
  return (request.method === 'GET' && url.pathname === pilot.configUrl) ||
    (request.method === 'POST' && url.pathname === pilot.askUrl);
}
