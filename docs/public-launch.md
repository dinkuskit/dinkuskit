# Public introduction release

The approved early release is the homepage and Getting started content rendered by the existing EmDash native-block website. Preserve the accepted colors and simple layout.

Publish a frozen rendering through Cloudflare Workers Static Assets on dinkuskit.com. The source remains EmDash/native blocks. Content edits require a fresh native render, verification, and approved republication. This does not select a permanent replacement for the later CMS/merchant hosting architecture.

Merchant accounts, hosted Connect, trial activation, and payments remain unavailable. The release contains only the public HTML, 404 page, and referenced CSS. It includes no CMS bundle, fixture entry, database, account/API routes, mail transport, or credentials.

The approved direction authorizes local preparation. Current source reviews, explicit merge approval, target Cloudflare account/zone and route verification, and separate publication approval still precede live changes. No receiver activation is included.

## Reproduce the candidate

Use Node 22.23.2, run npm ci, then npm run prepare:public-release. The command seeds only this checkout, builds the existing Node renderer, packages exactly two public pages plus 404 and their CSS, records immutable hashes, and stops its own renderer. Output stays under ignored .grilltrack/work/public-release/. It never deploys. Use the emitted wrangler.jsonc for a local dry run and request explicit approval before live publication.
