/**
 * Render-time http(s) allowlist for native text-section link fields.
 * Rejects missing values and any non-http(s) scheme.
 */
export function safeHttpUrl(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
  } catch {
    return null;
  }
}
