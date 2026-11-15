# Product ratings and reviews: research

Status: research only. Product ratings are deferred (`agent-catalog-ratings-20261113`, deferred 15 Nov 2026). Nothing here is decided or scheduled. Sources were read on 15 Nov 2026.

## Short answer

Build ratings the way WooCommerce does, with the record shape Shopify standardised:

- A small **Reviews plugin** beside Commerce. A shopper who bought a product gets one email link a week after it ships, picks a star rating, and may add words. The owner can hide spam and reply.
- Each product then carries two numbers, **average rating** and **number of reviews**. Every big platform exposes exactly these two.
- Those two numbers flow to the product page, to search engines, to the store's catalog feed, and from there to the cross-store agent catalog, which can then turn on the rating filter it lacks today.

## What the big platforms do

| | Shopify | WooCommerce | BigCommerce |
| --- | --- | --- | --- |
| Built in? | No. Shopify retired its own Product Reviews app in May 2024. Review apps do the work. | Yes, in core. A review is a WordPress comment with a star rating. | Yes, in core. |
| What a product carries | Two standard fields any app writes and any theme reads: `reviews.rating` and `reviews.rating_count`. Owners cannot edit them. | `average_rating`, `rating_count`, and a per-product "reviews allowed" switch. | Rating and review count per product. |
| What a review holds | A standard review record: rating (1 to 5), title, body, submitted and published dates, display name, product, variant, order, owner reply and its date, language, photos, and a verification status of `verified_buyer`, `verified_reviewer` or `unverified`. | Rating, text, name, email, status. A "verified owner" label when the reviewer bought the product. | Name, rating, title, body, status. |
| Who may review | Up to the app. | Anyone, or a setting limits it to verified owners. Stars can be optional or required. | Anyone, or a setting limits it to past customers with a Shipped or Completed order holding that product. |
| Asking for reviews | Up to the app. | New (beta): an email a set number of days after the order is completed, default seven, off by default. One link opens a "Review your order" page listing every product in that order. Works for guests. Star required, words optional. | An email a set number of days after the order is Shipped or Completed. One day minimum, seven recommended. Guests optional. |
| Moderation | Published or draft. | Approve, unapprove, reply, edit, spam, trash, in bulk. | Pending, approved, disapproved. Approval is required unless auto-approve is on. A rate limit and reCAPTCHA fight spam. |
| For AI agents | The cross-store catalog filters on a minimum rating (0 to 5) and a minimum review count. | Reviews are in its REST and Store APIs. | Reviews are in its catalog API. |

UCP, the protocol our catalog speaks, already has a place for this: a product may carry `rating` with `value`, `scale_max`, optional `scale_min` and `count`.

## What EmDash already gives us

EmDash has comments built in, as WordPress does: statuses of pending, approved, spam and trash, moderation hooks a plugin can join, and a moderation screen. A comment has no field for a star rating, an order, a variant or an owner reply, and its only spare field is private to moderators.

So the WooCommerce trick of "a review is a comment plus a star" does not fit as is. The plugin should keep its own review records and borrow EmDash's status names. Asking EmDash for public extra fields on comments is a possible later simplification.

## Recommended shape for DinkusKit

1. **Its own plugin.** Commerce is close to its size limit, and Coupons already set the pattern of a companion plugin. Reviews depends on Commerce for one fact only: did this order contain this product and was it paid.
2. **Record.** Copy Shopify's standard review fields, minus photos: rating 1 to 5, title, body, submitted, published, display name, product, variant, order, owner reply, verification status.
3. **Collecting.** Copy WooCommerce's new flow. One email a set number of days after the order ships (default seven). One link opens a page for that order, listing each product. Star required, words optional. Works for guests. The link is the proof of purchase, so every review is a verified buyer and no captcha is needed.
4. **Moderation.** A Block Kit list: publish, hide, mark spam, reply. No way to change a shopper's stars or words.
5. **On the store.** Stars and count on the product page and product cards, the reviews underneath, and the owner's reply. The same two numbers go into the page's Product structured data so search engines can show stars.
6. **For agents.** The store's catalog feed adds `rating` per product in UCP's shape. The cross-store catalog passes it through and adds Shopify's filter: minimum rating and minimum review count.
7. **Later.** Google's product ratings programme needs 50 reviews across a store and a reviews file sent monthly, so it waits for real volume. Photos, review import and a store-wide rating also wait.

## Rules that shape the design

- **US law (FTC rule on reviews, in force since October 2024):** no fake reviews, no reviews by the owner or staff without saying so, no reward tied to a good review, and no hiding bad reviews while presenting the rest as the whole picture. This is why the owner cannot edit stars, why hiding is for spam and abuse, and why any reward must be offered whatever the rating.
- **Google:** star markup is allowed on a store's own product pages and the reviews must be visible on the page. Reviews written by software are treated as spam, rewarded reviews must be flagged, and full names should not be published. Show a first name and last initial.

## Open questions for the owner

1. **Own plugin or inside Commerce?** Recommended: own plugin.
2. **Who may review?** Recommended: buyers only, through the emailed link.
3. **Publish straight away or wait for approval?** Recommended: publish straight away, since only buyers can review, with hide and spam afterwards. BigCommerce defaults to approval first.
4. **Same product sold by several stores in the catalog: one blended rating or each store's own?** Recommended: each store's own, shown with that store's offer. Shopify filters on the offer's own rating.
5. **Review photos?** Recommended: later.

## Still to prove before building

- How the Reviews plugin learns that an order shipped and what it held, without reading Commerce's data directly.
- That stores have an email sender set up, since the review request is an email.
- Whether the catalog's UCP version carries `rating` unchanged from the version read here (2026-04-08).

## Sources

- Shopify: [standard review record](https://shopify.dev/docs/apps/build/metaobjects/standard-review-metaobject), [standard rating fields](https://shopify.dev/docs/apps/build/metafields/list-of-standard-definitions), [catalog rating filter](https://shopify.dev/docs/agents/catalog/global-catalog-extension), [Product Reviews app migration](https://help.shopify.com/en/manual/products/product-reviews/migrate)
- WooCommerce: [Product reviews](https://woocommerce.com/document/product-reviews/)
- BigCommerce: [Managing reviews](https://support.bigcommerce.com/articles/en_US/Knowledge/Managing-Reviews)
- UCP: [rating schema](https://ucp.dev/2026-04-08/schemas/shopping/types/rating.json)
- Google: [review snippet structured data](https://developers.google.com/search/docs/appearance/structured-data/review-snippet), [Product Ratings eligibility](https://support.google.com/merchants/answer/14549080?hl=en), [Product Ratings policies](https://support.google.com/merchants/answer/6098512?hl=en)
- FTC: [rule banning fake reviews and testimonials](https://www.ftc.gov/news-events/news/press-releases/2024/08/federal-trade-commission-announces-final-rule-banning-fake-reviews-testimonials)

Limits: the FTC summary comes from the press release and law-firm summaries, not a reading of the rule text. Shopify review apps differ, so "up to the app" hides real variety.
