# Getting started with EmDash and DinkusKit

This is setup guidance for people who already plan to run an EmDash site. It is not an installer, storefront, or account service.

## Install EmDash

Official installation: [Create your first EmDash site](https://docs.emdashcms.com/getting-started/).

```sh
npm create emdash@latest
```

Official themes are complete Astro templates, not a runtime theme pack. See [Themes](https://docs.emdashcms.com/themes/overview/) and [Create a theme](https://docs.emdashcms.com/themes/creating-themes/). Cloudflare D1/R2 and Access are documented at [Deploy to Cloudflare](https://docs.emdashcms.com/deployment/cloudflare/).

## Inventory is coming soon

Hosted Inventory is coming soon and is **not** a prerequisite for Commerce. When it exists, stock stays in EmDash. An open-source self-host path will be documented. Neither the hosted nor the self-host inventory path is provisioned on this website today.

## Hosted and self-host paths

DinkusKit intends both a hosted onboarding path and documented self-hosting. Pricing, billing, trial length, and rollout timing are undecided. This site does not sell a plan or collect payment details.

## Commerce and Template Store

Commerce and the Template Store will be released together as a verified pair. You can explore the interactive storefront demo with a synthetic catalog to test browsing and cart behavior; checkout is disabled and no real purchases can be made. Template Store setup guidance is available for the development source pilot, while released installable packages and artifacts remain pending.

- **Try the demo**: [https://demo.dinkuskit.com/](https://demo.dinkuskit.com/) (browse and cart testing on synthetic catalog; checkout disabled)
- **Template setup**: [https://github.com/dinkuskit/template-store/blob/main/docs/v1-setup.md](https://github.com/dinkuskit/template-store/blob/main/docs/v1-setup.md) (development source pilot documentation; no released installer or package artifact exists)

### Operator note on content persistence

Updating `seed/seed.json` provides starter content for fresh local or newly initialized environments. Changing seed definitions does not overwrite existing pages on initialized live CMS databases. After this change merges, an authorized website editor can update the existing "Getting started" section and both native links directly through the EmDash CMS editor. No database reseed, schema update, data migration, or live mutation is performed in this task.

## This website

The public marketing pages are the approved EmDash native-block introduction. The initial public static release that is actually deployed is approved version `1e0e915f-bf79-4ec7-8527-e87e7d46f8e2` with artifact digest `e8b8f3cf01158a3f3c259fbfb1511e1f0f779829e97872e866f600ff646243f4`. A later hosted CMS candidate is prepared in-repo and is not activated; see [hosted runtime candidate](hosted-runtime-candidate.md).
