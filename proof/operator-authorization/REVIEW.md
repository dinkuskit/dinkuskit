# Parent source review

Decision: `website-operator-authorization-027`.
Reviewed source identity: `sha256:cb90f11df3c3128370e159831e848d51fb5f75b7f7db64e25a2f100efc8c7340`.
The hash covers the sorted changed implementation, test, migration and design
files below as path + NUL + contents + NUL. Ledger/proof files are excluded.

- `docs/CHARTER.md`
- `docs/operator-directory.md`
- `migrations/merchant/0005_operator_authorization.sql`
- `scripts/operator-directory-proof.mjs`
- `src/account/config.ts`
- `src/account/migrate.ts`
- `src/account/migration-sql.ts`
- `src/account/operator-directory.ts`
- `src/account/transports.ts`
- `src/pages/account/operator/index.astro`
- `src/pages/account/operator/organizations/[id].astro`
- `src/pages/account/operator/people/[id].astro`
- `src/pages/account/operator/stores/[id].astro`
- `tests/cms-merchant-isolation.test.mjs`
- `tests/fixtures/built-test-entry.mjs`
- `tests/merchant-migrations.test.mjs`
- `tests/operator-directory-unit.test.mjs`
- `tests/operator-directory.test.mjs`

## Standards and approved intent

The provider reads the existing stable account identity and a dedicated
server-owned grant. It does not infer authority from email, CMS state, merchant
membership, selected organization or service ownership. No rows are seeded and
no grant-management endpoint ships. Only the directory read scope is accepted.
Grant decisions are uncached, current account and scope checks remain inside
the existing complete-response authorization fences, and service observation
authority remains separate. SQL bindings are parameterized. Synthetic fixture
controls remain in the test entry; the production entry rejects proof routes.

The additive migration follows the existing migration/ledger convention.
Generated SQL is regenerated from its source. Current D1 signatures were checked
against workers-types 5.20261009.1 without changing the repository type pin.
[Cloudflare D1 guidance](https://developers.cloudflare.com/d1/worker-api/d1-database/#withsession)
confirms ordinary binding queries remain on the primary when no Sessions API is
used. No cached or unconstrained replica-session authorization was introduced.

## Adjudication

- `required_fix`, resolved: the first handoff did not prove both organization
  detail reads, persisted revocation, disabled caller and live production-entry
  authority independently. Expanded the workerd production-entry test and
  persisted-provider mid-read tests; all pass.
- `required_fix`, resolved: whitespace-only grant provenance was accepted.
  Require trimmed nonblank actor/reference values and test rejection.
- `required_fix`, resolved: the previous documentation still described an
  absent production provider and the browser script used fake per-resource
  grants. Updated both for the persisted provider and documented separate live
  approval, retained revoke provenance and no regrant lifecycle.
- `reject_false_positive`: an added CMS isolation assertion expected an exact
  sign-in URL without its safe callback. The actual 303 correctly denied access;
  the assertion now checks the sign-in pathname and passes.
- `human_gate`: live principal binding, production writes, deployment and merge
  remain outside this source change.

No unresolved required fix was found in this parent review. External review
must still bind to the final PR base/head; this report is not merge authority.
