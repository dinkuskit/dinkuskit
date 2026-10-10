# Charter wording: dinkuskit/blocks is archived

`dinkuskit/blocks` is now archived as reference only. `docs/CHARTER.md` still
called it "the retiring DinkusKit blocks package". It now says the archived
`dinkuskit/blocks` repository is reference only and must not be depended on.

Docs-only change. `scripts/audit-repo.mjs` keeps its guard that refuses
`@dinkuskit/blocks` as a dependency; it passes on this branch
(`audit-repo.txt`). GrillTrack ledger history is left as written.
