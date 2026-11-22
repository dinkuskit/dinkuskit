# Merchant migration read batching

Captured 2026-11-04 on Node 24.22.0 from base `badde899a21369cce1c4fdaae9179644af3ed37d`. Branch `codex/ci-wait-times-20261104`. Numbers are local wall-clock receipts. Raw runs stayed on the work machine and are not part of this commit.

## Change

`tests/merchant-migrations.test.mjs` sends adjacent successful read-only `SELECT` and `PRAGMA` inspections through one local `wrangler d1 execute --json --command`. Each statement still returns its own result set and keeps its own assertion. The helper rejects empty input, an internal semicolon, a bound parameter, and anything other than one `SELECT` or a non-assigning `PRAGMA`.

Left on their own calls: all nine migration tests, every `applySql` file, `d1 migrations apply`, runtime start, stop, and restart, HTTP and token checks, and every mutating statement. Migration-prefix batching is not in this change.

Source hashes: baseline `778f018c06c7d6998502b04b953a78c2d22b2d173bc50c164bf250adcc6a40bb`, candidate `aaa95ceb18a770009573a64d73fb980ddd54cc3a365948f8cf7774b346e892d3`.

## Measurement

Serial order: baseline `npm run verify`, baseline focused file twice, candidate focused file twice, candidate `npm run test:merchant`, candidate `npm run verify`. Dependencies were already installed. No second machine and no parallel run.

Focused command:

```sh
node --experimental-strip-types --test --test-concurrency=1 --test-timeout=180000 tests/merchant-migrations.test.mjs
```

| Run | Exit | Wall seconds | Node tests |
| --- | ---: | ---: | --- |
| Baseline full verify | 0 | 449.2655355419847 | 259 pass, 0 fail (17 groups) |
| Baseline focused 1 | 0 | 81.53409337499761 | 9 pass, 0 fail |
| Baseline focused 2 | 0 | 79.12750262499321 | 9 pass, 0 fail |
| Candidate focused 1 | 0 | 66.53093712500413 | 9 pass, 0 fail |
| Candidate focused 2 | 0 | 70.30447925001499 | 9 pass, 0 fail |
| Candidate merchant suite | 0 | 119.4628942910058 | 24 pass, 0 fail |
| Candidate full verify | 0 | 453.1028552080097 | 259 pass, 0 fail (17 groups) |

Focused mean wall time is 80.33079799999541s on the baseline and 68.41770818750956s on the candidate. The candidate mean is 11.91308981248585s lower. The slower candidate run, 70.30447925001499s, is still 8.82302337497822s under the faster baseline run, 79.12750262499321s.

Full `npm run verify` passed on both sources. Candidate minus baseline is +3.837319666025s. That is one sample each, so this pair does not show a full-verifier saving.

`npm run test:merchant` was run only on the candidate. It passed 24 tests. There is no paired merchant-suite timing.

## Not claimed

- No production change and no deploy.
- No assertion removed, no timeout cut, and no SQLite substitution.
- No full-verifier or merchant-suite wall-time saving.
