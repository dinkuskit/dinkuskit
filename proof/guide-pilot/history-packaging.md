# Decision-history packaging for PR #100

The original PR accumulated two full GrillTrack reconciliation trees. This
cleanup carries the same approved pilot onto the current main ledger and keeps
the complete original branch history in a verified archive. It does not change
the application's implementation or the native review size limit.

## Original history remains available

- Original source: `80779c031bd9dfd0e204e426ecf805d7c7a266ef`.
- Retained Git tag: `archive/pr-100-pre-cleanup-20261027`.
- [Original history in Git](https://github.com/dinkuskit/dinkuskit/tree/archive/pr-100-pre-cleanup-20261027/.grilltrack).
- [`history/pre-cleanup.tar.gz`](history/pre-cleanup.tar.gz) contains all 103
  original `.grilltrack` files, including every ledger, event stream, immutable
  object and retention root: 10,574,627 original bytes.
- [`history/manifest.json`](history/manifest.json) records every original path,
  byte count and SHA-256, plus the source Git commit/tree and archive hash.
- The cleanup commit retains the original PR head as a merge parent. It is a
  non-forced branch update. The tag and in-repository archive also preserve the
  history independently of a later squash merge or branch deletion.

The active `.grilltrack` tree retains main's complete history unchanged and
adds `dinkusguide-pilot-098` through the normal CLI. Its choice is identical to
the earlier approved choice; its carry-forward rationale links the original
archive rather than pretending its old lifecycle happened again. No original
decision, review finding, timestamp or event has been discarded from history.

The original and carried-forward ledgers contain the same 104 decision IDs and
choices. Both validate with the normal GrillTrack CLI. The initial cleaned tree
has 4,993 additions and 177 deletions across 46 files, compared with over 96,000
changed lines before cleanup. Subsequent proof-only updates may change that
small count; GitHub's current PR metadata is the final size authority.

## Verification

```sh
npm run test:history-archive
./scripts/grilltrack --project . validate
```

The archive check bounds decompression, rejects links, duplicate/missing paths
and path escapes, verifies the compressed archive and all individual hashes,
and compares every byte directly with the original Git source. CI fetches the
complete commit history for that independent comparison. Four synthetic tests
also prove valid archives pass and corruption, missing members, unsafe paths
and symlinks fail.

To inspect the original ledger with the normal CLI, first verify the archive,
then extract it into a fresh temporary directory and run the CLI with that
directory as `--project`. The active ledger need not be modified for inspection.

Only the machine-readable history packaging changes. The active ledger and
application source keep ordinary text diffs. No generated-data exemption label,
review threshold change, force push, merge to main or deployment is used.
