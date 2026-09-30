# Usable EmDash website follow-up

The public introduction in PR #1 is a useful initial landing release. It has the approved design, native EmDash-rendered public content and a verified static export. It is not completed production EmDash operation: it has no hosted content store, protected operator editing lane, complete installation/theme/storefront guidance or verified interactive demo links. This plan does not alter the frozen exporter review candidate.

## Smallest real remaining website slice

Prove the official EmDash Cloudflare D1/R2 runtime with persistent content and safe operator editing using supported CMS APIs. Decision website-operator-012 selects official Cloudflare Access as the sole hosted CMS identity mode, with a signed-token verifier and an additional runtime allowlist across the complete CMS namespace. Operator identities and deployment bindings stay outside public source. A local native passkey fixture qualifies storage and persistence only. Keep the static public release live while a protected candidate is staged. The human owner logs in first and initializes the CMS before the second editor is allowed through the runtime gate. Prove hosted authorized editing, publication and persistence, anonymous and spoofed denial, and closed setup before public cutover. New source merge and live activation require their current review and owner gates. Merchant identity remains outside this slice.

Add understandable EmDash installation, theme and storefront guidance using the coordinator's verified release matrix. Give a less technical user a clear sequence and screenshots tied to the actual release, not repositories alone. Do not mark checkout, payments, shipping, coupons or bundles available without the coordinator's corresponding proof. Exact pricing, billing and hosted service rollout remain undecided.

Inventory is Coming soon and is not a prerequisite for Commerce v1. Its development runs concurrently. Explain the eventual hosted inventory onboarding and documented open-source self-hosting paths without presenting either as currently provisioned.

Commerce v1 and Template Store ship as a verified exact-version pair. The coordinator owns Template Store implementation, compatibility evidence and demo preparation. The website consumes that handoff; it does not duplicate that work. When ready, add real verified "Try the demo" and "Use this template" links with setup guidance. Proposed simple placement: demo.dinkuskit.com, separately deployed and explicitly approved. It should run the actual matching frontend/release pair with synthetic content, visible demo limits and no real charges. The URL is a proposal, not a deployed destination; no DNS mutation is authorized by this plan.

## Acceptance and decision gates

The approved initial static introduction is live. Calling the website fully usable still requires hosted authorized CMS editing and persistence proof, supported setup guidance, verified demo/setup destinations and the coordinator's release-pair proof. Local workerd qualification alone does not meet the hosted criterion. The purchase/order path, shipping, coupons and bundles remain in the coordinated release checklist; a final compatibility/availability matrix is still needed. No blanket availability claim is made here.

Preserve the approved palette, type and simple layout. Do not infer merchant accounts, payments authority, hosted inventory provisioning, pricing, billing or an unrelated SaaS build. This is a bounded follow-up plan; current source merge and live deployment remain explicit human gates.
