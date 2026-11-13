-- The cross-store catalog's own database. It holds only what each listed store
-- already shows shoppers (GrillTrack agent-catalog-data-20261113).

CREATE TABLE catalog_store (
  site_id TEXT NOT NULL PRIMARY KEY,
  site_origin TEXT NOT NULL,
  store_name TEXT NOT NULL,
  policies TEXT NOT NULL DEFAULT '[]',
  feed_hash TEXT,
  read_at INTEGER,
  changed_at INTEGER,
  last_error TEXT
);

-- One row per product per store. Rows that share a upid are the same product sold by several stores.
CREATE TABLE catalog_offer (
  offer_id TEXT NOT NULL PRIMARY KEY,
  upid TEXT NOT NULL,
  upid_basis TEXT NOT NULL CHECK (upid_basis IN ('gtin', 'brand_mpn', 'store')),
  site_id TEXT NOT NULL REFERENCES catalog_store (site_id) ON DELETE CASCADE,
  store_product_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  brand TEXT,
  gtin TEXT,
  mpn TEXT,
  images TEXT NOT NULL DEFAULT '[]',
  options TEXT NOT NULL DEFAULT '[]',
  variants TEXT NOT NULL,
  highlights TEXT NOT NULL DEFAULT '[]',
  price_min INTEGER NOT NULL,
  price_max INTEGER NOT NULL,
  currency TEXT NOT NULL,
  sellable INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (site_id, store_product_id)
);

CREATE INDEX catalog_offer_upid_idx ON catalog_offer (upid);
CREATE INDEX catalog_offer_site_idx ON catalog_offer (site_id);

CREATE TABLE catalog_variant (
  variant_id TEXT NOT NULL PRIMARY KEY,
  offer_id TEXT NOT NULL REFERENCES catalog_offer (offer_id) ON DELETE CASCADE
);

CREATE INDEX catalog_variant_offer_idx ON catalog_variant (offer_id);

CREATE VIRTUAL TABLE catalog_text USING fts5 (
  offer_id UNINDEXED,
  title,
  brand,
  body,
  tokenize = 'porter unicode61'
);
