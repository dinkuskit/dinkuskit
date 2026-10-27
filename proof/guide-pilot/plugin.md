# DinkusGuide sandbox plugin proof

Repository: `dinkuskit/dinkuskit`. Base: `caba44c5afcabec3a6f0d41f2d096290c900e80c`.
Contract: [website pilot #98](https://github.com/dinkuskit/dinkuskit/issues/98).
Companion: [authenticated Guide ask service #14](https://github.com/dinkuskit/dinkus-guide/pull/14).

## Reproducible checks

Use Node 24.22.0 and the lockfile, then run:

```sh
npm run build:dinkusguide-plugin
npm run test:dinkusguide-plugin
npm run verify
```

The official EmDash Plugin CLI generates the descriptor, wire manifest and Registry tarball from `packages/dinkusguide-chat`. The build asserts one `network:request` capability, one exact example hostname, encrypted secret schema, two public method-bound routes and a private admin route. No descriptor factory, native hook injection, wildcard network capability or model SDK is included.

`tests/dinkusguide-sandbox.test.ts` loads that compiled plugin through the production Cloudflare sandbox runner and PluginBridge, backed by isolated local D1. Runtime actions use the production request dispatcher and settings encryption. They verify disabled defaults; encrypted storage and secret-free config; complete answers and citations; exact one-question outbound payload; private admin and valid Block Kit; method/body restrictions; abstention and malformed/oversized response rejection; host allowlist denial; and persistent global rate state across sandbox restart. The host-denial case deliberately produces an upstream bridge diagnostic while returning a safe 503 and making no outbound request.

Focused contract tests cover code-point and byte validation, concurrent compare-and-set admission, trusted-IP/global budgets and immutable public citation URLs. A controlled deferred transport verifies that a response deadline does not release admission while the transport is still pending.

## Runtime limits and evidence boundaries

The website and plugin default off. `guide.example.com` is an inert build-time hostname, not deployed infrastructure. An installer must select the actual approved host, rebuild, approve the declared capabilities/public routes, and configure encrypted settings. This proof does not represent a Registry UI installation, public ingress, production secrets, live Access policy or deployment.

The runtime sandbox checks use synthetic public answers. The companion PR separately records an actual admitted-corpus/model call and the authenticated HTTP adapter, including a supported answer and an insufficient-evidence response. Those are distinct evidence layers; the UI fixture also remains explicitly synthetic.

EmDash 1.2 buffers bridge HTTP and does not forward AbortSignal. The plugin bounds the visitor response wait and conservatively retains an admission lease until transport settlement or expiry. The companion service independently bounds actual child-process work to 90 seconds and two active children. Browser cancellation suppresses late display; it does not promise model cancellation.

No raw transcripts, raw IPs or credentials are persisted by the plugin. The host's independent infrastructure logging policy is outside this source proof. No holdout corpus was accessed, and no raw model fallback was added.
