import { MerchantUnavailableError, SHIP_AUDIENCE, SHIP_ORIGIN } from './config.ts';

export const SHIP_SANDBOX_ORIGIN = 'https://ship.sm0ky.dev';
export const SHIP_SANDBOX_AUDIENCE = 'dinkus-ship-sandbox';
export const SHIP_GENERATION_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
export type ShipSandboxRegistration = { siteId: string; generation: string };
export type ShipRecipient = { recipient: 'ship-sandbox'; generation: string; mode: 'test' };
export type StoredShipRecipient = { ship_recipient: string | null; ship_generation: string | null; ship_mode: string | null };

/** Server-owned activation only. Empty/malformed configured values never enable a fallback. */
export function readShipSandboxRegistration(raw: unknown): ShipSandboxRegistration | undefined {
  if (raw === undefined) return undefined;
  try {
    if (typeof raw !== 'string') throw new Error();
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join(',') !== 'generation,siteId'
      || typeof value.siteId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value.siteId)
      || typeof value.generation !== 'string' || !SHIP_GENERATION_PATTERN.test(value.generation)) throw new Error();
    return { siteId: value.siteId, generation: value.generation };
  } catch { throw new MerchantUnavailableError(); }
}

export function shipRecipient(siteId: string, registration?: ShipSandboxRegistration): ShipRecipient | null {
  return registration?.siteId === siteId ? { recipient: 'ship-sandbox', generation: registration.generation, mode: 'test' } : null;
}
export function shipClaims(recipient: ShipRecipient | null): Record<string, string> {
  return recipient ? { ship_recipient: recipient.recipient, ship_generation: recipient.generation, ship_mode: recipient.mode } : {};
}
export function shipDestination(recipient: ShipRecipient | null) {
  return recipient
    ? { origin: SHIP_SANDBOX_ORIGIN, audience: SHIP_SANDBOX_AUDIENCE, ...recipient }
    : { origin: SHIP_ORIGIN, audience: SHIP_AUDIENCE };
}
export function sameShipRecipient(stored: StoredShipRecipient, current: ShipRecipient | null): boolean {
  return current ? stored.ship_recipient === current.recipient && stored.ship_generation === current.generation && stored.ship_mode === current.mode
    : stored.ship_recipient === null && stored.ship_generation === null && stored.ship_mode === null;
}
export async function shipTestMode(db: D1Database, siteId: string, recipient: ShipRecipient | null): Promise<boolean> {
  if (!recipient) return true;
  const settings = await db.prepare('SELECT live FROM dinkuskit_commerce_settings WHERE site_id = ?').bind(siteId).first<{ live: number }>();
  return settings?.live === 0;
}
