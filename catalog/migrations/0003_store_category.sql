-- Each store's own pick of a product's Shopify Standard Product Taxonomy category
-- (GrillTrack agent-catalog-store-category-20261124). It wins over the category the
-- catalog works out itself in catalog_vector, which now fills in only when this is empty.
ALTER TABLE catalog_offer ADD COLUMN category_id TEXT;
ALTER TABLE catalog_offer ADD COLUMN category_name TEXT;
CREATE INDEX catalog_offer_category_idx ON catalog_offer (category_id);
