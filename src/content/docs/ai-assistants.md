---
title: Read the docs from your coding assistant
summary: Use the same version-scoped articles as the website and keep documentation access separate from store administration.
audience: Developers
product: DinkusKit documentation
version: Draft publishing foundation; public docs MCP and client verification pending
draft: true
updated: 2026-10-19
---

## Read the same source

The documentation is authored as Markdown in the website repository. The HTML page, native Markdown endpoint, human search data, and discovery file are intended to come from the same selected articles. An assistant should read that source rather than relying on a separate, manually maintained agent guide.

Each article includes product and version scope. Ask your assistant to compare that scope with the repository or installed artifact it is changing. A source-backed example is not proof that another version exports the same contract.

## Publication status

This contribution contains article drafts. Local development can preview them, but drafts are excluded from production HTML and Markdown, the public search index, and `llms.txt`. Local development also exposes draft Markdown through the article’s Copy as Markdown and View as Markdown actions. A missing article or an empty public index must not be worked around by requesting arbitrary repository files through a documentation API.

The implemented route design for selected, published articles is:

| Format | Route pattern |
| --- | --- |
| HTML | `/docs/<article-id>` |
| Native Markdown | `/docs/markdown/<article-id>.md` |
| Public search data | `/docs/search.json` |
| Discovery | `/llms.txt` |

These are implementation routes, not a claim that they are already live on dinkuskit.com. In production, while every article remains a draft, Markdown requests return not found, public search returns an empty array, and `llms.txt` returns not found. Approved publication and deployed-route checks must precede connection instructions aimed at the live site.

## Ask for evidence before changes

A useful request is: “Find the article for integrating the installed public catalog. Read its version scope and sources, compare them with my project, and explain the mismatch before proposing code.”

Have the assistant follow links to the canonical reference instead of duplicating an API description from memory. For a test checkout, require both provider-confirmed TEST payment and the corresponding Commerce Orders record. Never let a browser return or a generated example become evidence that a payment succeeded.

## Public documentation MCP

The planned MCP is a small read-only search-and-fetch service over the selected public articles. It is not implemented or client-qualified in this contribution. There is no connection command to copy yet.

Before this section becomes a connection tutorial, verify an actual client, transport, endpoint, search query, and article fetch. Results must include titles, canonical source URLs, and version context. Unknown or private article IDs must return no content. Retrieval must not accept arbitrary paths or fetch arbitrary URLs.

The public docs MCP must expose no CMS, merchant, payment, or mutation tools, and must require no administrative token. Giving an assistant documentation access does not authorize it to modify a store.

## Next step

Read [site integration](/docs/developers/integrate) or [contribution guidance](/docs/developers/contribute). Exact client instructions and a tested search-and-fetch transcript remain a publication gate for this article.
