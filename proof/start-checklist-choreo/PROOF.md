# `/start` checklist animations: no-JavaScript tick and reduced motion

Source: branch `agy/start-checklist-choreo` with `main` `7a50d83` merged in (after #85). Fixes the two ClawSweeper findings on `1b9c1ad`.

## What changed in the fix

- `src/styles/site.css`: the filled box, the drawn tick and the strikethrough now also follow `input:checked` (`.start-step input:checked`, `input:checked + .start-step-check-svg`, `label:has(input:checked) .start-step-strike-svg path`), so a visitor without JavaScript sees the step ticked. With JavaScript the `.is-done` rules still apply as before.
- The reduced-motion rule now names `.start-step.is-next .start-step-rough-focus .rough-pass-1` and `.rough-pass-2`, the same specificity as the active underline rules, so `prefers-reduced-motion: reduce` turns the underline animation off.
- `tests/start-page.test.mjs` checks both rules in the stylesheet.

## Browser checks

Chromium headless via Playwright, the docs-preview EmDash fixture seeded with `/start` (`scripts/lib/docs-preview.mjs`, dev setup bypass), Node 24.22.0, 1280×900.

| # | Situation | Before the fix (`1b9c1ad` stylesheet) | After the fix |
| --- | --- | --- | --- |
| 1 | JavaScript off, tick step 1 | `checked: true`, box background `rgb(255, 255, 255)`, tick `stroke-dashoffset: 24px`, strike `250px` (nothing visible) | `checked: true`, box background `rgb(126, 34, 206)`, tick `0px`, strike `0px` (filled box, tick and strikethrough drawn) |
| 2 | `prefers-reduced-motion: reduce`, tick step 1, read the `is-next` step's underline | `rough-pass-1` `stroke-dashoffset 0.55s`, `rough-pass-2` `0.52s` (still animates) | both `transition-property: none`, `0s`; tick `0s` |
| 3 | No motion preference, same steps | n/a | `rough-pass-1` `0.55s`, `rough-pass-2` `0.52s`, tick `0.32s` (animations kept) |

## Also run

- `node --experimental-strip-types --test tests/start-page.test.mjs`: 3/3 pass
- `npm run audit:repo`, `npm run typecheck`, `npm run test:theme-switch`: see the PR description

## Limits

Local fixture and headless Chromium only, not live `dinkuskit.com`. Deploying is a maintainer step.
