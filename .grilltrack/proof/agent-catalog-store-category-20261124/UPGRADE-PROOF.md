# Upgrade proof: a catalog filled before 0003 still loads and answers

Run with `npm run proof:catalog-upgrade` (catalog/scripts/upgrade-proof.mjs). The Worker built from the commit before migration 0003 fills the catalog through its own timer; 0003 is applied to that filled catalog; then the Worker built from this branch answers from the very same D1 rows, before and after its first read of the stores. Workers AI and Vectorize have no local form, so the catalog's own category guesses are written where the old indexing step writes them, and the category door answers 503 here.

Output of the run on top of 8003cfb (full JSON answers trimmed to the checks):

```text
== 1. The catalog as it was (built from b7a65d1, migrations 0001_catalog.sql, 0002_meaning_and_categories.sql) fills itself ==
PASS  the old Worker stored the three store products (two hats, one tee family)
PASS  old Worker: one hat, both stores, lowest price first
PASS  old Worker: the catalog's guess is shown, marked inferred
== 2. Apply 0003_store_category.sql to the filled catalog ==
PASS  catalog_offer gains the store category columns
PASS  every stored product is still there, with no store pick yet
PASS  the old Worker still reads the stores and answers after the migration
== 3. The new Worker answers from the same stored rows, before it reads any store ==
PASS  search_catalog gives exactly the answer the old Worker gave
PASS  the tee family is the same answer too
PASS  lookup_catalog by the product id and a variant id an agent kept
PASS  get_product by product page address
PASS  get_product by a kept variant id
PASS  a category filter, with no category index here, gets the same answer and warning as before
PASS  and the warning names the filter it passed over
== 4. The new Worker reads the stores: a store pick wins, the rest keep the guess ==
PASS  the store's pick is stored on its own row only
PASS  the tee now shows the store's pick, not marked inferred
PASS  and keeps its product id, so an id an agent kept still opens it
PASS  the kept variant id still opens the same variant
PASS  the hats, with no store pick, keep the catalog's guess marked inferred
PASS  and keep the same product id and sellers
PASS  the agent-facing category list carries the store's pick
== 5. The category door on the built Worker ==
PASS  GET with no words is refused
PASS  a POST is refused
PASS  with no Workers AI or Vectorize bound (as on this machine) it says so, not an empty list
PASS  the old Worker never had the door
Every check passed.
```
