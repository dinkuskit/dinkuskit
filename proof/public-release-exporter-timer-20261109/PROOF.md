# Public release exporter cleanup timer

Base: `4cadb16d63ce3865cdbd6619ce0fadaae03528d3`. The exporter starts a five-second grace timer while waiting for the renderer to exit. Previously, a promptly exiting renderer won the race but the still-referenced timer kept the successful exporter alive. The change clears the timer when the race settles. It preserves SIGTERM, the full five-second grace for an unresponsive renderer, conditional SIGKILL and the awaited child exit. The existing seven-case reuse test and its entrypoint are unchanged.

## Matched local measurements

The command was `npm run test:public-release-reuse`, on Node `24.22.0` and npm `11.19.1`, Linux arm64. All four sequential A/B/B/A captures used fresh synthetic fixture roots and the exact original test file. Each A mounted the base exporter; each B used the changed exporter. Both versions were run in a user/PID/network namespace with only loopback, a fresh empty HOME and npm configuration, no credentials, and no dependency installation. The test itself uses a synthetic local renderer and temporary Git repository; no production renderer or deployment was exercised. Every run passed the same seven named checks, with zero remaining namespace processes.

| Order | Exporter | Wall s | User s | System s | Max RSS KiB | Result |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | Base | 12.238 | 1.898 | 0.827 | 113288 | 7 passed |
| 2 | Candidate | 2.204 | 1.940 | 0.818 | 113272 | 7 passed |
| 3 | Candidate | 2.168 | 1.798 | 0.821 | 113600 | 7 passed |
| 4 | Base | 12.114 | 1.877 | 0.820 | 112344 | 7 passed |

Median wall time was 12.176 s versus 2.186 s, a local difference of 9.990 s for the same seven cases. Max RSS is a waited-child metric, not a process-tree peak. The comparison used read-only test overlays to select the identical original test for both versions; it is not itself a measurement of the final default command. The final candidate's unmodified default command independently passed the same seven cases in 2.132 s with zero namespace processes remaining. These are local samples, not hosted CI duration or cost claims.

## Behavior and provenance

A separate instrumented observer wrapped the real exporter's child-process calls without changing the exporter source. Fresh synthetic fixtures covered a prompt SIGTERM exit, renderer startup failure, and a renderer that ignored SIGTERM. Against both base and candidate:

- Prompt exit returned success and closed both renderer pipes; the candidate process exited promptly after child exit.
- Startup failure returned nonzero with the expected startup diagnostic, after the child exited and both pipes closed; no public-release output was created.
- The TERM-resistant renderer received SIGTERM and was sent SIGKILL after the full grace interval (candidate: 5,001 ms), then exited by SIGKILL and closed both pipes before the successful exporter exited.

The normal and TERM-resistant synthetic cases produced four identical asset byte hashes across base and candidate, with artifact digest `9006f7b97b2483fbf13b26bc4893760c22504ae731e34ab4b7025c3eb8692346`. Their manifest `exporter_sha256` values intentionally differ because they attest to the exporter source: base `cfd059c4c805d8008f8215797bad5bfded476b11541b2bbf9c034331da4da937`, candidate `607d2c9950463c1aa12ead39748c18faf2ef1f7a761d531a1c1a5bcc9bdd130d`. Synthetic Git commits and full manifest bytes are not expected to match across separately created fixtures. These controls do not prove behavior of a real hosted renderer.

The capture helper's failure control verified exit 7 and distinct stdout/stderr. An initial baseline attempt failed before tests because the sandbox used the same empty npm config file for user and global configuration; it was retained and corrected to use separate empty files before sampling. A temporary expanded test harness detected the old timer but was removed after review identified a descendant-cleanup risk on timeout; its results are not final default-command evidence.

`npm run audit:repo` passed the path and manifest checks for 530 files, including the untracked proof path as it existed at audit time; it calls for separate content review. The audit checks paths and the manifest; the proof content was separately reviewed.

Full `npm run verify` was attempted in a credential-free loopback/PID-isolated writable overlay using a copy-on-write dependency tree with the same lockfile and Node version. The first attempt exited 1 because the sandbox did not expose system CA certificates to the local Cloudflare test runtime. A focused unchanged-source control passed after the existing system public CA bundle was mounted read-only; external networking remained unavailable. The corrected full run passed the preceding steps, including all seven public-release-reuse cases, but exited 1 after 1,101.34 seconds in `test:emdash-upgrade`: its disposable legacy fixture invoked `npm ci` and failed to fetch `zwitch-2.0.4.tgz` from the public npm registry with `EAI_AGAIN`. The attempt occurred in task-owned storage; no external registry access succeeded. The subsequent Cloudflare candidate stage was not reached, and no namespace processes remained. This is **not a full verify pass**, and no whole-verify speed claim follows. Hosted CI remains a separate check.

## Actual Cloudflare build diagnostic

A follow-up local diagnostic used the same retained production build and seed for the parent `4cadb16d63ce3865cdbd6619ce0fadaae03528d3` and timer-change commit `8c7b1870e04e17ae86849ae3ceff220b4d9f1c9b`. The build log identifies `@astrojs/cloudflare`; its retained `dist/server/entry.mjs` SHA-256 was `c00f436d5327fe02ff763f39ebc94ead43bf4c79ac508559082a2dbce07f09b8`, the seed SHA-256 was `824c979a41f6e677160fa4590a003090d8baca4f71599a8f95534ec942e94e00`, and the shared lockfile SHA-256 was `9e1625c7c994a0df66f4fa50ed4a9afa616fd4108f4c6e942c77dfa16c3b2630`. The exporter source hashes were `cfd059c4c805d8008f8215797bad5bfded476b11541b2bbf9c034331da4da937` for the parent and `607d2c9950463c1aa12ead39748c18faf2ef1f7a761d531a1c1a5bcc9bdd130d` for the timer change.

For each version, Node 24.22.0 ran `scripts/prepare-public-release.mjs` by absolute path from a fresh synthetic Git fixture, with the retained build and dependencies read-only. The environment was credential-free and isolated to loopback and an owned PID namespace. A task-owned observer recorded child and pipe events without changing exporter source. Both commands exited normally with code 1 and no signal: the exporter reported `Production renderer did not start` and Node reported `ERR_UNSUPPORTED_ESM_URL_SCHEME` for `cloudflare:`. Each child exited 1; both pipes ended and the child closed, no release artifact existed before or after, and no namespace processes remained.

The mismatch predates the timer change: both versions launch the Cloudflare build entrypoint directly with Node, which cannot load that scheme. This diagnostic does **not** establish a successful production-renderer release, hosted behavior or deployment; no deployment was attempted. The successful reuse tests above exercise a synthetic renderer.
