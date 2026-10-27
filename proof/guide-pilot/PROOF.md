# DinkusGuide pilot evidence

Contract: [issue #98](https://github.com/dinkuskit/dinkuskit/issues/98).
Companion ask service: [dinkus-guide #14](https://github.com/dinkuskit/dinkus-guide/pull/14), reviewed at `b12a902961987af5095cdfc8ffffc0fa72c2cfa5`.

## Source and verification

- Initial website base: `caba44c5afcabec3a6f0d41f2d096290c900e80c`.
- Pilot implementation: `ca11ec10294128201727ba9e51a6b591eca8c7ae`.
- Integrated website base: `3b0efcadfa670851fc990ff8d77ffb654096413f`.
- Integration commit: `c402127827857576fa18e4b7ddf81d5f7eef9382`. The Guide packages, route guards, layout opt-in and policy are byte-identical to the verified implementation.
- The subsequent Access API-token base `77a91632c6808045d82061e941012a04b9907a34` is also integrated. The Guide exception remains restricted to its two configured routes, alongside the new independent token gate. The current Access gate tests pass, including token-path restrictions, cookie refusal and the required enabled Admin.
- Node 24.22.0; EmDash remains pinned to 1.2.0.
- Full `npm run verify` passed on the pilot implementation, including build/type checks, 5 UI contracts, 4 plugin contracts, 8 sandbox/transport cases, existing account/CMS checks, actual local upgrade and production-candidate denial.
- The integrated branch's production-built Guide fixture passes 15 Chrome checks and 8 HTTP namespace cases. It uses the real Site layout and Deep Chat with a synthetic Guide response. The current CSS tokens reach both the dialog and shadow-rendered messages in light/dark themes.
- After rebuilding the integrated branch, all 36 affected account migration and shared-store tests pass. The initially started post-merge run used the previous compiled site and was stopped; it is not verification evidence.

Detailed boundaries and reproduction: [plugin](plugin.md), [UI](ui.md), [setup](../../docs/dinkusguide-pilot.md).

## Review and activation

Current-head CI, comprehensive review and native review are recorded on the PR. A previous-head verdict is not current review evidence. Screenshots are selected synthetic fixture captures; immutable asset references are added to the PR after its number is allocated.

This is an opt-in source pilot. No Registry package was published, no production plugin was installed, and no live Access policy, secret, service or website was changed. The independent Guide real-model proof is not a claim that this browser fixture used a model. Merge and deployment remain owner decisions.
