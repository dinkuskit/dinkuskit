# /start checklist order: browser proof (issue #73)

Source: this PR's head with main merged in (StartSteps.astro from `ad205c8`).

## How it was captured

The docs-preview fixture (its own EmDash SQLite database, seeded from
`seed/seed.json`) ran as Astro's development server in the cloud container,
the same way as [../PROOF.md](../PROOF.md). Chromium (headless) through
playwright-core, at 1280x900 and 390x844. The script drove the real checkbox
clicks and wrote `localStorage` (`dinkuskit-start-steps`) by hand to stand in for
progress saved by the old page.

## What it showed (both viewports, logged by the script)

| Case | Result |
| --- | --- |
| First visit | step 1 open, steps 2 to 4 locked; step 3's hint "Finish step 1 first", linked by `aria-describedby="start-step-hint-3"`; "0 of 4 done" |
| Click on a locked step | nothing ticks |
| Tick steps 1 and 2 | step 3 opens, step 4 stays locked; "2 of 4 done"; saved `["start-2","start-3"]` |
| Reload with that save | the same two ticks kept: a valid saved prefix survives |
| Untick step 1 | every later tick clears and locks; saved `[]` |
| Old gapped save (steps 1, 3, 4) | on load only step 1 stays ticked; the save is rewritten to `["start-2"]`; "1 of 4 done" |
| Old full save (all four) | all four kept, "4 of 4 done", done message shown |
| No JavaScript | all four boxes usable, hints hidden |

## Images

`desktop-fresh.png`, `phone-fresh.png` (first visit),
`desktop-two-ticked-after-reload.png`, `phone-two-ticked-after-reload.png`
(valid save kept), `desktop-gapped-save-trimmed.png`,
`phone-gapped-save-trimmed.png` (old gapped save trimmed to step 1).

## Also run on this head

`npx tsc --noEmit -p .`, `npm run build`, `npm run test:foundation` (11 of 11,
including `tests/start-page.test.mjs`), `npm run test:pages-import`, and
`npm run audit:repo` all pass.

## Limits

A local fixture, not dinkuskit.com. Ticks are kept in the browser only and grant
nothing.
