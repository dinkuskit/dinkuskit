-- Free shipping over an amount the owner sets beside a flat charge
-- (checkout-free-shipping-over-20261027). NULL means no such amount. Commerce gets it
-- only when it asks for it, so an older Commerce keeps charging the flat amount.
ALTER TABLE dinkuskit_commerce_settings ADD COLUMN shipping_free_over_minor INTEGER CHECK (shipping_free_over_minor IS NULL OR shipping_free_over_minor > 0);

INSERT OR IGNORE INTO dinkuskit_schema_migrations (version, name, applied_at)
VALUES (15, '0015_free_shipping_over.sql', unixepoch());
