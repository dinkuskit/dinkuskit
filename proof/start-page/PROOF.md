# /start browser proof

Source: `git:9bc7f58c45028814101f6e9d2a1240a3879efd55` (dinkuskit#71), GrillTrack `start-landing-page-20261022`.

## How it was captured

The docs-preview fixture (its own EmDash SQLite database, seeded from
`seed/seed.json`) ran as Astro's development server in the cloud container.
`/start` there is the same `ContentPage` and blocks the Worker serves, drawn
from the CMS `pages` entry `start`. Its `?as=` parameter stands in for the
Worker's signed-in check, which needs the account database the fixture lacks.
The Worker side is covered separately by `tests/start-page.test.mjs`.
Chromium 1194 (headless) through playwright-core 1.56.1, at a 1280x900
desktop viewport and a 390x844 phone viewport.

## What each image shows

| File | Viewport | State |
| --- | --- | --- |
| `desktop-signed-out.png` | 1280x900, full page | First visit: Create account and Sign in; four numbered steps, step 1 marked next |
| `phone-signed-out.png` | 390x844, full page | Same at phone width; no sideways scroll |
| `desktop-two-ticked-after-reload.png` | 1280x900, full page | Steps 1 and 2 ticked, page reloaded, "Don't have one yet?" opened: ticks kept in the browser, "2 of 4 done", step 3 marked next |
| `phone-two-ticked-after-reload.png` | 390x844, full page | Same at phone width |
| `desktop-all-done.png` | 1280x900, full page | All four ticked: "4 of 4 done" and the done message shown |
| `desktop-signed-in.png` | 1280x900, top of page | Signed in (fixture stand-in): "Signed in as owner@example.com", Your stores and Your account in place of Create account and Sign in; ticks from earlier still kept |

Logged by the capture script: after reload `2 of 4 done` with 2 boxes checked
(both viewports); all ticked `4 of 4 done`, done message visible (both
viewports); signed-in panel text `Signed in as owner@example.com`.

## Limits

This is a local fixture, not dinkuskit.com. The live page appears only after
the owner's deploy and the one-time `pages:import` in DEPLOY.md. The real
signed-in check runs only in the Worker. The owner reviewed the first mock-up
of this design in the project thread on 22 Oct 2026.
