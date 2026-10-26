# Doc updates

Each `<article id>.md` here is a reviewed change to one article on dinkuskit.com/docs. Merging it to `main` publishes it, unless the live article changed in the admin after the file was written; then the **Docs publish** workflow opens an issue and changes nothing.

Start a file with `npm run docs:pull -- <article id>`. How it works: [`docs/documentation-authoring.md`](../documentation-authoring.md#doc-updates-from-merged-prs).

Commerce, Payments and Ship write their `reference/<plugin>.md` here themselves when they release; change those articles in the plugin's own `docs/website/` instead. See [plugin reference articles from releases](../documentation-authoring.md#plugin-reference-articles-from-releases).
