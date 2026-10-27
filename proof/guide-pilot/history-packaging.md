# History-preserving PR presentation

Baseline before cleanup: `449ae2d93b62fc60d9cff285f0714bc143ea87ff`.

The 82 immutable archive objects occupy 9,459,178 bytes. All 103 tracked files
under `.grilltrack` remain byte-identical to that baseline, including the active
ledger, events, retention roots and complete historical snapshots. No history
was removed, moved, rewritten, compressed or put behind an external service.

`.gitattributes` classifies only `.grilltrack/lineage/objects/sha256/*` as opaque,
generated archive payloads for diff presentation. Git still stores their full
original contents, and GrillTrack reads them at their existing paths. The active
ledger and event stream retain text diffs, as do the retention-root records and
all application source. The native review limit and its exemption labels are
unchanged.

The earlier PR exposed about 96,000 changed text lines, mostly full historical
snapshots. Rendering the immutable object store as archival blobs removes those
repeated snapshot dumps from the text diff. This changes review presentation,
not the repository's storage size or the underlying history.

Reproduce the full byte comparison and content-address checks:

```sh
node scripts/check-history-integrity.mjs --baseline 449ae2d93b62fc60d9cff285f0714bc143ea87ff
./scripts/grilltrack --project . validate
npm run test:history-integrity
```

The baseline comparison requires that commit to be available locally. The
ordinary CI check needs only the checked-out source: it verifies every object
against its SHA-256 filename and ensures that active ledger/events have not
been marked opaque. A synthetic fixture proves that corrupted archive bytes,
symlinks, changed baseline history and hidden active-ledger diffs are rejected.

Before and after cleanup the sorted history snapshot digest is
`c2d5cbbb8943e3ad119b88fa1773c7a237e96a149989e28069124397d777965c`.
