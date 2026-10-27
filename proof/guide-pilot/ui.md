# DinkusGuide frontend and route proof

Repository: dinkuskit/dinkuskit. UI slice base: caba44c5afcabec3a6f0d41f2d096290c900e80c.
Acceptance: https://github.com/dinkuskit/dinkuskit/issues/98.

## Source and configuration

The separately bundled component is under packages/dinkusguide-ui. Site.astro opts in only on explicit public paths. Activation requires DINKUS_GUIDE_PILOT=true and a valid actual installed plugin ID; default builds remain disabled. The two namespace guards admit only that exact ID's GET config and POST ask. Other methods, IDs, suffixes and query strings remain gated. No live Access or permission policy has changed.

## Measured checks

- Node 24.22.0; Deep Chat 2.5.1; Playwright 1.62.1 with installed Chrome.
- Five focused contract/route/safe-text tests pass.
- Existing Access namespace tests pass, including anonymous denial, malformed/forged identity, and service-token protections.
- Astro typecheck: zero errors/warnings, five existing vendor hints.
- Production-built isolated guide-preview fixture: 15 browser checks pass. They cover lazy loading without inference on open; keyboard open/Escape/focus return; completed answer and citation; inert HTML, links and image syntax; exact/over-limit Unicode questions; unsafe backend citation rejection; overload, failure and timeout; cancellation; account exclusion; two independent visitor contexts; no transcript after reload; mobile viewport fit; and light/dark CSS tokens in the shadow-rendered chat.
- Eight production-fixture HTTP cases pass: config GET and ask POST succeed; anonymous CMS/admin/setup, other plugin IDs, wrong methods and encoded ask paths are denied.
- Screenshots are generated under ignored .local/dinkusguide-ui; selected immutable media links belong in final PR proof after source identity is fixed.

## Proof limits

The fixture uses the real Site layout and Deep Chat component with a synthetic transport and isolated local EmDash database. It is not an installed-plugin test, a live Guide response, hosted Access proof or a public deployment. Guide real-model and adapter proof belong to the companion PR. Installed sandbox evidence belongs to the plugin slice. The full website verification result and final exact-head review are recorded at PR closeout.

No model tokens stream before validation. No transcripts are persisted. Model-provided HTML/Markdown remains plain text; only validated citation URLs receive links. Browser requests omit merchant cookies and send one question with no history, model controls or visitor ID.
