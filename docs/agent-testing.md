# Local agent testing

This lane tests the built DinkusKit merchant application without human email
clicks. It is a **local HTTP end-to-end test**, not a deployed authentication
service, a browser visual test, or proof that real email was delivered.

## Run

Use the repository's Node 22 version and install dependencies with `npm ci`.
Then run:

```sh
npm run agent:test
```

The command prepares and builds the application, starts a disposable local
workerd runtime, exercises the merchant flows, emits a sanitized result, and
stops the runtime. SIGINT/SIGTERM also trigger owned-runtime cleanup. No email inbox, production credential, deployed endpoint,
or existing database is accepted. It does not deploy anything.

After an existing build, run the guard and regression tests with:

```sh
npm run test:agent-routes
```

These tests also run in `npm run verify`. Run only one build/test pipeline in a
checkout at a time: the existing harness prepares generated test modules under
`dist/server`.

## Isolation

The agent wrapper is `tests/fixtures/built-agent-test-entry.mjs`. It is copied
into the generated local test build by the harness and is never imported by
`src/` or the production entry. Production configuration has no switch that
turns it on. Regression tests probe the normal production entry with rogue test
flags and verify that agent routes still return 404.

The launcher always creates a fresh, disposable database. It binds to loopback,
requires the exact configured loopback Origin and a random per-run credential,
and rejects external targets and redirect following. Only the fixed identities
`agent-owner@example.test` and `agent-staff@example.test` are available. They
are synthetic reserved-domain addresses, unrelated to real merchant accounts.
The simulated store is `https://agent-store.example.test`.

The run has a ten-minute lifetime, a 160-request budget, and an 8 KiB request
body cap. Individual requests, including response body reads, have a 15-second
timeout. The harness strips its credential before delegating requests to the
application. Runtime shutdown clears tracked session jars and removes the
owned temporary database and generated secret-bearing configuration. Generated
working material stays ignored; do not publish it or raw response headers.

## Backend interface

Call through `startAgentTestRuntime()` from
`tests/helpers/agent-test-harness.mjs`; it supplies the private per-run header
without printing it. Each actor uses its own in-memory cookie jar.

| Local route | Input | Purpose |
| --- | --- | --- |
| POST `/__agent/auth/start` | Fixed `identity` and `intent` | Submit the actual signup, sign-in, or recovery form for the synthetic identity |
| POST `/__agent/auth/complete` | Fixed `identity` | Consume the local captured email through Better Auth; never return its link; failed completion returns 401 without cookies |
| POST `/__agent/expire-auth` | Empty object | Expire local verification records for negative tests |
| POST `/__agent/receipt` | Strict synthetic store receipt | Simulate store-ownership transport for the normal consent flow |

The normal account and service authorization handlers remain in use. The
wrapper does not write a privileged login directly into the database or grant
staff permissions itself. Signup still runs the normal intake and admission
logic. The scenario grants and removes staff permissions through normal owner
actions, checks an already signed-in employee, and checks a fresh employee
login. Employee membership is also removed, and both sessions must lose the
owner business. It also exercises store consent, code replay, and local mail expiry.

The ordinary unrestricted test-fixture routes are not exposed by this wrapper.
No CMS editor identity or platform operator authority is provided by an agent
merchant session.

## What this proves, and what it does not

The runner proves HTTP behavior in the built application with local persistence,
normal Better Auth sessions, separate owner/staff state, and the production
permission handlers. The email sink and store-proof response are simulations.
No Ship label is bought, no payment is made, and no remote service is contacted
by those simulations. The script does not follow redirect destinations.

Browser layout, keyboard navigation, 390-pixel rendering, a real installed
Payments plugin, hosted store connectivity, and real mailbox delivery remain
separate acceptance checks. A passing runner must not be reported as completing
those checks. The header-authenticated helper is intended for an automated HTTP
runner; it is not an interactive browser sign-in page.

## Why this lane exists

During the original live browser test, the browser tool refused navigation to
email sign-in links and explicitly prohibited alternate-route retries. The user
could open those links and obtain valid sessions. That establishes a tool-policy
barrier for that run, not a demonstrated defect in the website's authentication.
The exact policy trigger was not diagnosed.

This separate local lane does not retrieve or open those blocked live links.
It uses only its own synthetic mail sink. Real email delivery and user-facing
single-use/expiry behavior still need their own supported acceptance lane.

A future hosted staging route would need a separate security design and explicit
approval: isolated storage and synthetic principals, authenticated runner
identity, bounded sessions, audit records without secrets, and production
rejection. Do not deploy this test entry or expose the local server through a
tunnel. This change grants no deployment or production-account authority.
