/**
 * Ids the catalog hands to agents. A product sold by several stores has one
 * universal product id (GrillTrack agent-catalog-grouping-20261113): matched on an
 * exact GTIN, or on brand plus MPN. With neither, the product stays its store's own.
 */
export type UpidBasis = 'gtin' | 'brand_mpn' | 'store';

async function digest(text: string, length: number): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, length);
}

const fold = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '');

export async function universalProductId(input: {
  gtin: string | null; brand: string | null; mpn: string | null; siteId: string; storeProductId: string;
}): Promise<{ upid: string; basis: UpidBasis }> {
  if (input.gtin) return { upid: `dkp_${await digest(`gtin:${input.gtin.padStart(14, '0')}`, 24)}`, basis: 'gtin' };
  const brand = input.brand ? fold(input.brand) : '', mpn = input.mpn ? fold(input.mpn) : '';
  if (brand && mpn) return { upid: `dkp_${await digest(`brand_mpn:${brand}:${mpn}`, 24)}`, basis: 'brand_mpn' };
  return { upid: `dkp_${await digest(`store:${input.siteId}:${input.storeProductId}`, 24)}`, basis: 'store' };
}

export const offerId = (siteId: string, storeProductId: string) => `${siteId}|${storeProductId}`;

export async function variantId(siteId: string, storeItemId: string): Promise<string> {
  return `dkv_${await digest(`variant:${siteId}:${storeItemId}`, 24)}`;
}
