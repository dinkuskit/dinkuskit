# Docs-sync fixture wait comparison

## Claim and scope

The docs-sync integration test used two 1.1-second waits for every throwaway Git commit. This change keeps both waits at the three commits that establish the admin-before-commit, admin-race and stale-checkout chronology, while the other commits still execute normally. It changes the test fixture only: it does not change the publisher, production clocks, articles, permissions, or service behavior.

At base `4cadb16d63ce3865cdbd6619ce0fadaae03528d3`, three paired local whole-command comparisons averaged **80.755 seconds before and 48.236 seconds after**, 32.520 seconds (40.27%) less wall time. This is a Linux ARM64 local result with identical observation preload, not a hosted CI or billing measurement. The test file under measurement had SHA-256 `5237c293cbe651c561de20d9a6062a052f0622ed6626f30bd938de41633ef205` before and `4117daab875a666b3e5c6f729703e55ad4395a5aeed16bd51a944c25b84d7743` after. Full machine-readable receipts are in [measurements.json](measurements.json).

## Measurement

The unchanged repository command was `npm run test:docs-sync`, with the same [`observe.cjs`](observe.cjs) preload on every paired run. The observer records results from the real spawned docs-sync CLI and the test's local synthetic HTTP endpoints; it does not substitute an implementation or change the test assertions. An additional uninstrumented baseline passed in 81.436 seconds. After the paired measurements, one uninstrumented candidate control passed all 14 scenarios in 47.162 seconds with stdout and stderr byte-identical to that plain baseline. These single controls establish normal-entrypoint execution; the three-pair result remains explicitly instrumented. The two baseline warmups, then six paired samples, used the same lockfile, installed dependencies and built preview. Each test invocation reset its disposable SQLite database and throwaway Git repository. Operating-system caches were not cleared.

The paired sequence was **B C C B B C**. All six exited zero and passed the same 14 named scenarios. Their complete captured stdout and stderr were byte-identical; stderr was empty. Wall and waited-child resource values below come from the capture receipts. RSS is the waited-child maximum in KiB, not a process-tree peak; cost is unknown.

| Order | Variant | Wall seconds | User seconds | System seconds | Max RSS KiB |
| ---: | --- | ---: | ---: | ---: | ---: |
| 1 | Baseline | 79.434 | 39.970 | 8.800 | 1,306,812 |
| 2 | Candidate | 47.644 | 41.115 | 9.534 | 1,325,880 |
| 3 | Candidate | 48.311 | 41.685 | 9.658 | 1,305,956 |
| 4 | Baseline | 81.559 | 42.593 | 9.930 | 1,315,656 |
| 5 | Baseline | 81.272 | 42.199 | 9.859 | 1,328,264 |
| 6 | Candidate | 48.752 | 43.088 | 9.883 | 1,308,832 |

Environment: Node 24.22.0, npm 11.19.1, Git 2.56.0, Linux aarch64 on a 20-CPU Cortex-X925/A725 host. The Node archive matched the official release SHA-256. `npm ci --no-audit --no-fund` installed the unchanged lockfile; `npm run build:docs-preview` built the local fixture before measurement. The lockfile Git blob was `0631d59d65b1db250633dfbb7807b2745d401245`. No live store, hosted benchmark, or external send was involved.

## Behavioral comparison

The observer recorded 124 ordered synthetic events per run: 45 spawned docs-sync CLI outcomes and their stdout/stderr, 46 issue-operation methods, paths, request bodies and statuses, and 33 proxied docs-write methods, paths and statuses, including the expected HTTP 409. It does **not** record docs-write request or response bodies. Existing assertions and live-content hashes provide separate coverage of persisted content, issue handling, 409 behavior, release waiting, stale checkouts and the other scenarios.

[`compare-traces.cjs`](compare-traces.cjs) consistently symbolizes only local ports, synthetic ULIDs and Git commit identifiers in their observed output contexts, preserving repeated-identifier relationships. It requires all 45 CLI, 46 issue and 33 docs-write events and the 409; checks using empty traces, a missing event and changed literal content correctly failed. Every run matched the baseline's complete normalized event sequence, SHA-256 `e756ed4cfce6b9eee3921f35371dad2169c85de9acaf85b283f5dadba11485a9`. This is evidence for the exercised fixture paths, not a proof of all possible scheduling or clock behavior. Synthetic raw traces remain local and are not committed.

To reproduce the observation in an isolated checkout after installing dependencies and building the preview, set `NODE_OPTIONS` to `--require=<absolute path to observe.cjs>` and `DOCS_SYNC_TRACE_OUT` to a fresh task-local JSONL path, then run `npm run test:docs-sync`. Compare two runs with `node proof/ci-docs-sync-waits/compare-traces.cjs <baseline.jsonl> <candidate.jsonl>`. The observer's output contains synthetic request bodies; keep the raw files in ignored working storage.

The pre-existing GrillTrack decision `website-docs-sync-077` is marked `needs_reverification` after earlier composition. This fixture optimization does not settle or alter that product decision. Exact-diff independent review, current-head CI, comprehensive review and native review remain separate gates; merge requires human authorization.
