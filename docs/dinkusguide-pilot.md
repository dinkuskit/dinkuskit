# DinkusGuide website pilot

This is an optional, read-only guide to admitted public DinkusKit and EmDash
documentation. It returns complete validated answers with source links. It
cannot change products, orders, stores or accounts. Questions are independent;
the display history exists only on the current page and is lost on reload.

The pilot is **disabled by default**. Source in this repository does not mean
the plugin is published, installed or publicly activated. Deployment, public
ingress, secrets/permissions changes and merge require separate owner approval.
The owning plan and acceptance contract is
[issue #98](https://github.com/dinkuskit/dinkuskit/issues/98).

## Two separate installation pieces

The Registry-compatible `packages/dinkusguide-chat` plugin owns safe public configuration and the ask
transport. Set the exact approved ingress hostname in its manifest before building; `guide.example.com` is an inert example. The official Plugin CLI generates its descriptor and Registry bundle. Install it through the supported EmDash plugin flow and explicitly
approve its declared public routes and outbound host. Configure its Guide
endpoint and encrypted service credential in the server-side settings. Never
put credentials in browser props, URLs, this file or a build flag.

The frontend is separately bundled in `packages/dinkusguide-ui`. A host theme
deliberately imports its Astro component and supplies same-origin `configUrl`
and `askUrl` props. Sandboxed plugins cannot inject this script into arbitrary
themes. Deep Chat 2.5.1 is a replaceable local rendering dependency; it receives
only escaped text, with source links built separately from validated URLs.

On this website, `src/layouts/Site.astro` contains the opt-in. After an approved
installation, build with `DINKUS_GUIDE_PILOT=true` and
`DINKUS_GUIDE_PLUGIN_ID` set to that installation's actual runtime ID. Registry
IDs may differ from the logical plugin ID; do not guess or reuse another
installation's ID. Both values are non-secret build configuration.
Every later deploy must build with them too, or the bubble disappears. The
dinkuskit.com go-live order (Guide service, plugin, build switch, edge) and its
checks are in [DEPLOY.md](../DEPLOY.md#ask-dinkusguide-chat-bubble-optional).
The production build does not run sandboxed plugins yet, so going live also
needs the change that adds the sandbox runner (step 2 there).

The component appears only on `/`, `/start`, `/getting-started`, `/docs`, the
explicit `/docs/…` path family, `/support` and `/plugins`. Account, CMS/admin,
operator, API and unknown paths are excluded. Existing page content and account
authority remain unchanged.

## Public boundary and behavior

The outer namespace guards permit only `GET …/<installed-id>/config` and
`POST …/<installed-id>/ask` under `/_emdash/api/plugins/`, and only when the
build opt-in and installed ID are valid. Other methods, plugin IDs, path
suffixes and query strings retain the original CMS gate. EmDash still dispatches
the two operations through the plugin's declared public routes. A live edge
Access policy may require a matching narrow exception; no such live policy is
changed by this implementation. Do not exempt the entire `/_emdash` namespace.

Opening the panel lazily loads Deep Chat and safe public settings. It does not
start inference. The form submits exactly `{ "question": "…" }`, without
merchant cookies, conversation IDs, model settings or previous messages. The
server chooses the endpoint, instructions and source policy. The configured
character limit is visible; the default pilot limit is 2000 Unicode code points.
Server limits remain authoritative. The frontend rejects oversized replies
rather than truncating a successful answer.

The panel supports keyboard opening, Escape, a Close button, focus return,
status announcements and cancellation. Cancellation stops the browser request;
downstream cancellation depends on the installed EmDash runner. The plugin bounds visitor response wait to 20 seconds by default (25 seconds maximum). EmDash 1.2 does not forward the browser abort or an AbortSignal through its buffered HTTP bridge. Admission leases remain held until transport settlement or conservative expiry; the companion ask service independently bounds actual model work to 90 seconds and two active children.
Overload, timeout and unavailability produce safe feedback rather than a fake
answer. No raw model tokens or provider errors reach the visitor.

The component inherits the current ultraviolet and emerald CSS tokens in both themes; `design.md` points to `src/styles/site.css` and `.stitch/DESIGN.md` as the brand sources.

The model connection and knowledge admission are separate. This pilot uses the
existing DinkusGuide pipeline and admitted public corpus; configuring a model
does not authorize extra sources, drafts, account content or arbitrary URLs.
Other providers, actions, persistent memory, billing, analytics, training and
automatic script injection remain outside this pilot.

## Controlled UI verification

`fixtures/guide-preview` uses the real Site layout and component, an isolated
local EmDash database, and a **synthetic** Guide transport. It proves UI and
outer-gate behavior; it does not prove Registry installation, a live Guide
connection or public availability.

```sh
node node_modules/astro/bin/astro.mjs build --config fixtures/guide-preview/astro.config.mjs
HOST=127.0.0.1 PORT=4399 node .grilltrack/work/guide-preview/dist/server/entry.mjs
```

In another terminal, with Chrome installed:

```sh
GUIDE_PREVIEW_URL=http://127.0.0.1:4399 node scripts/dinkusguide-browser-proof.mjs
node --test tests/dinkusguide-ui.test.mjs
npm run test:access-gate
```

The browser script uses isolated temporary browser contexts and writes generated
results and screenshots under ignored `.local/dinkusguide-ui/`. Only selected,
sanitized captures belong in the immutable DinkusKit proof-media shelf. Keep
fixture, installed-plugin, real-model and deployed evidence distinct.
