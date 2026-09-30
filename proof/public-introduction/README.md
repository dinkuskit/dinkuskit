# Public introduction candidate

This change retains the approved native EmDash homepage and Getting started design and adds a reproducible frozen export. The output contains two public HTML pages, one shared 404 and their referenced CSS. No merchant, CMS, account, email or database runtime is published by this preparation command.

The package's former Node range admitted versions below the locked dependency contract. `@emdash-cms/registry-verification` 0.3.3 requires `^22.22.2 || ^24.15.0 || >=26.0.0`; the bounded Node 22 range is therefore `>=22.22.2 <23`. The existing `.nvmrc` and CI use 22.23.2. Dependency versions are unchanged.

Verification uses the committed lockfile's engine ranges (including platform applicability), a fresh engine-strict install on Node 22.23.2, the full website verification command, repeated native export, and a local Workers Static Assets dry run/route check. The exported 404 omits its request-specific canonical URL. Reusing an existing asset directory must reject unexpected files/directories or wrong entry types rather than preserving unlisted upload assets. The regression uses synthetic files in a task-owned temporary fixture, preserving existing evidence and approved output. Public pages and CSS retain their previously approved bytes.

Artifact digest: `e8b8f3cf01158a3f3c259fbfb1511e1f0f779829e97872e866f600ff646243f4`. The exporter records exact file hashes, source commit and dirty status in its ignored output manifest. Run `npm run prepare:public-release` to reproduce. Generated databases, local logs and deployment configuration are excluded from Git.

Review boundary: previous OpenClaw/ClawSweeper evidence belongs to its original exact source tuple. Successful execution is not by itself a clean verdict. An independent review of the frozen candidate is pending; this change does not waive the repository's current-source formal-review policy. The standalone review-command matcher defect remains a review-infrastructure issue, outside the public static artifact runtime; this candidate does not change or activate that workflow.

Merge, publication, custom-domain binding and receiver activation require their own explicit authorization. No deployment is performed by the exporter, and merchant integrations remain unavailable.
