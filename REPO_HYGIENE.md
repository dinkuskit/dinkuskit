# Repository hygiene

Keep stable front-door documentation at the root: README.md, AGENTS.md, REPO_HYGIENE.md, LICENSE, and design.md when needed. Put product and architecture depth in docs/, checks in scripts/ or tests/, and curated proof in proof/ or .grilltrack/proof/.

The GrillTrack CLI owns .grilltrack/ledger.json and its append-only events. Preserve same-repository track history. Keep working candidates and generated logs in ignored .grilltrack/work/; never commit local databases, browser sessions, raw service responses, dependencies, build output, credentials or environment files.

Run npm run audit:repo before every commit. Changes must originate here or have explicit public-source provenance. Do not import unrelated Git history or copy another product's private operational files.
