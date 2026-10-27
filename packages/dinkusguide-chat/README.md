# `@dinkuskit/dinkusguide-chat`

Reusable EmDash Registry/sandbox chat plugin for read-only **Ask DinkusGuide** public documentation Q&A ([issue #98](https://github.com/dinkuskit/dinkuskit/issues/98)).

## Capabilities & sandbox boundaries

- **Format**: EmDash standard/Registry sandbox plugin (`emdash-plugin.jsonc` + `src/plugin.ts`, built with `@emdash-cms/plugin-cli`).
- **Capabilities**: `["network:request"]` only. No `network:request:unrestricted`, `content:*`, `users:*`, `page:inject`, or Node.js built-ins.
- **Build-time `allowedHosts`**: `["guide.example.com"]` is an inert example. Set the one approved ingress hostname in `emdash-plugin.jsonc` and rebuild before installing elsewhere. The generated descriptor and Registry bundle carry that exact host; there is no runtime wildcard or custom descriptor factory.
- **Install consent**: Declares two public HTTP routes (`GET /_emdash/api/plugins/<installed-plugin-id>/config` and `POST /_emdash/api/plugins/<installed-plugin-id>/ask`). EmDash Registry installations require explicit operator consent for public routes (`allowPublicRoutes`) and declared capabilities (`allowCapabilities`).

## Separation of responsibilities

1. **Plugin & model/service connection (`@dinkuskit/dinkusguide-chat`)**:
   - Stores `serviceToken` as an encrypted EmDash `secret` setting (`OptionsRepository` + `secretRedactor`), never in browser config or logs.
   - Serves safe public UI config (`GET /config`) and proxies validated, stateless single-question requests (`POST /ask`) to the authenticated DinkusGuide `/ask` endpoint (`Authorization: Bearer <serviceToken>`).
   - Enforces server-side UTF-8 JSON body cap (`16384` bytes), Unicode code-point cap (default `2000`, max `8000`), bounded visitor response deadline (default `20000` ms, max `25000` ms below the 30 s EmDash sandbox wall-clock limit), atomic KV concurrency leases (default `2`, max `16`), and per-minute rate caps (default `20` global / `6` per trusted client IP). EmDash 1.2 buffers bridge HTTP and does not forward an AbortSignal: a visitor timeout does not prove inference stopped. The lease remains held until transport settlement or its conservative expiry; the companion service independently bounds model work to 90 seconds and two active children.
   - Verifies completed responses (`answered | insufficient_evidence | out_of_scope`) and immutable `https://github.com/<owner>/<repo>/blob/<40-hex-sha>/...` citation URLs before returning JSON (`Cache-Control: no-store`). Never streams unvalidated tokens or persists visitor transcripts.
2. **Knowledge admission & retrieval (`dinkus-guide`)**:
   - Admitted public documentation sources, embeddings, retrieval, model invocation, and citation verification remain owned by DinkusGuide (`dinkuskit/dinkus-guide#14`). Unpublished CMS drafts, private operator data, and merchant accounts never enter retrieval.
3. **One-time host frontend integration**:
   - Registry/sandbox plugins cannot inject scripts into site pages. The host Astro layout opts in to a bundled frontend component on approved public routes and connects it to this plugin's `/config` and `/ask` endpoints.

## Build & validate

From the repository root:

```bash
npm run build:dinkusguide-plugin
npm run test:dinkusguide-plugin
```
