-- Search by meaning, photo search and categories
-- (GrillTrack agent-catalog-first-version-20261113).

-- Which products already have a search vector, and for which words and picture.
-- Kept apart from catalog_offer so a price change does not work the vector out again.
CREATE TABLE catalog_vector (
  offer_id TEXT NOT NULL PRIMARY KEY,
  vector_id TEXT NOT NULL UNIQUE,
  content_hash TEXT NOT NULL,
  -- Shopify Standard Product Taxonomy id and full name, worked out by the catalog (inferred).
  category_id TEXT,
  category_name TEXT
);

CREATE INDEX catalog_vector_category_idx ON catalog_vector (category_id);
