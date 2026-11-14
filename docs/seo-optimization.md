# ZELEON on-page SEO implementation

## Audit and decisions

The existing sitemap already contained four public pages and 12 anonymously
accessible active products. Its ID-based, HTTPS, non-www, trailing-slash
canonicals, anonymous RLS query, six-hour scheduled refresh and robots file were
retained. Google verification was preserved. The initial public HTML previously
provided canonical/robots tags but an empty Angular root; every page shared the
generic title and lacked descriptions, social metadata and structured data.

The existing Seo service was extended rather than replaced. No database,
permissions, route guards, authentication or product records were changed.
The unrelated local profile security template edit was excluded.

## Metadata and product SEO

`src/app/seo-metadata.mjs` is shared by Angular and the Node build. Its declaration
file provides TypeScript types. Public static pages have distinct titles and
descriptions. Product titles use the actual product name; descriptions mention
only the actual name/category and viewing details/price. The product service has
no description, SKU or inventory field, and the visible product description is
placeholder copy. That placeholder is not copied into SEO. Product JSON-LD omits
description instead of asserting unverified product claims.

The service uses Angular Title/Meta and updates canonical, description, Open
Graph, Twitter Card and JSON-LD tags on navigation and product load. Product ID
and slug routes canonicalize to one ID URL. Old metadata is removed during
navigation, missing products have no Product schema, and repeated calls cannot
accumulate duplicate tags. JSON-LD uses JSON serialization with HTML-sensitive
characters escaped and script textContent in the browser.

Product/Offer schema uses the actual name, public image, brand, price and
configured currency. It does not assume USD. Reviews, ratings, stock,
discounts, SKU, shipping and return policies are omitted because no reliable
corresponding fields exist. Organization and WebSite schema appear only on the
home page and contain the known brand, URL and existing logo. There are no
invented legal details, addresses, phone numbers or social profiles.

Public pages have Open Graph title, description, type, URL, image, image alt and
site name, plus Twitter Card title/description/image/alt. The existing logo is
the default; product pages use their public product image. Unsafe/missing image
URLs fall back to the HTTPS brand image. No assets were regenerated or moved.

## Initial HTML, crawlability and prerendering

Build-time generation now fetches the same public product fields and primary
image ordering as the browser product service. The catalog snapshot lives in
ignored `tmp/seo-catalog.json`, outside the deployed asset tree. Static entry
pages contain page-specific titles, descriptions, canonical, social tags and
JSON-LD before JavaScript runs. Crawlers that do not execute JavaScript can read
these tags. Public pages additionally contain a no-JavaScript fallback with
navigation and real product names/prices/links where appropriate.

This is static head generation, not full Angular prerendering. The normal page
body still depends on JavaScript; Google must render Angular to see that body.
The noscript fallback is not claimed to replace rendered content for Google.
Full prerendering was deferred: the current application initializes browser-only
auth/storage and animation code, and products load in afterNextRender. Adopting
Angular SSR/hydration would require a separate broader compatibility change and
dependencies. No hosting migration or speculative auth changes were made.

Google recommends making content accessible and testing rendered HTML:
https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
Angular describes the CSR/prerender trade-offs:
https://angular.dev/guide/ssr

## Indexing and deployment

Home, shop, our-story, contact and resolved active products are indexable.
Login, signup, profile, cart, checkout, password recovery/reset, auth callback,
staff authentication and manager/admin/support workspaces are noindex. Unknown
URLs initially receive the noindex 404 shell. The existing wildcard route may
subsequently redirect to the public home page; that existing behavior remains.

Private root entry pages carry static noindex and no public canonical/schema.
Nested private routes and unknown paths receive the noindex SPA fallback.
Angular also applies route-specific indexing directives during navigation.
The original workflow copy from index.html to 404.html remains; a subsequent
step removes public metadata and applies noindex to that fallback. Base href,
custom domain, root sitemap/robots and Google verification remain intact.

Every successful master push, manual dispatch or scheduled deployment regenerates
public metadata and the sitemap from current active products. Admin changes
appear on the next successful deployment, not immediately. The six-hour cron is
configured; an actual scheduled event has not been observed in this task.
Build/API failure prevents deployment of an incomplete catalog.

## Internal links, images and performance

Navigation/footer and home product cards already used real links. Shop product
cards previously used a clickable div; their names now contain a standard
RouterLink anchor. The existing outer-card behavior and independent cart button
are preserved. Product images already used product names as alt text. Shop
images now load lazily with async decoding; detail images keep eager loading
and receive high priority. Hero images retain eager loading, gain clearer alt
text/async decoding, and the central hero can receives high priority.

No image dimensions, layout, animations, colors or assets changed. Existing
font connections and display=swap were retained. No dependencies were added.
Bundle size warnings, the home stylesheet warning and AOS CommonJS warning
remain. No field LCP/CLS/INP improvement is claimed; evaluate these with actual
traffic and PageSpeed Insights after deployment.

## Validation performed

- Production Angular build and post-build sitemap/entry-page validation passed.
- Ten Node SEO tests passed: product values/currency, unsupported claims,
  injection escaping, social/private head handling, distinct public metadata,
  sitemap filtering, XML, pagination, failure handling and workflow hooks.
- 63 focused Angular tests passed across SEO, product detail/card, Auth, login,
  OAuth callback and staff/manager/MFA access guard services.
- A separate 14-test run passed for updated SEO navigation tests, password
  recovery and manager users. The latter two had setup/timeout failures in the
  concurrent full-suite run and passed in isolation.
- Full suite: 212 passed, 31 failed out of 243 across 47 files. Existing support
  rating mocks lack auth.initialized; dashboard mocks lack select; support and
  navigation assertions also fail. The full suite is not claimed green.
- Local HTTP/headless browser verification passed for all 16 public URLs,
  initial head metadata, private noindex, JSON-LD, canonical consistency,
  product ID/slug navigation, missing products and real shop product links.
- Desktop product layout geometry, colors and fonts matched the production
  baseline at 1440px. This is a focused visual regression check, not exhaustive
  device coverage.

Tests exercise auth logic with mocks. No real user OAuth consent, email/password
login or staff MFA challenge was performed; live credential-based flows are not
claimed verified. No messages were sent or database records mutated.

## Modified files

- `.github/workflows/deploy.yml`
- `scripts/sitemap.mjs`
- `scripts/sitemap.test.mjs`
- `scripts/verify-seo.mjs`
- `src/app/seo-metadata.mjs` (new)
- `src/app/seo-metadata.d.mts` (new)
- `src/app/services/seo.ts`
- `src/app/services/seo.spec.ts`
- `src/app/components/product-card/product-card.ts`
- `src/app/components/product-card/product-card.html`
- `src/app/components/product-card/product-card.css`
- `src/app/components/product-card/product-card.spec.ts`
- `src/app/pages/home/home.html`
- `src/app/pages/product-details/product-details.ts`
- `src/app/pages/product-details/product-details.html`
- `docs/seo-optimization.md` (this report)
- `docs/seo-sitemap.md` (report link)

## Remaining verification

The sitemap is already submitted. Use Search Console URL Inspection on home,
shop and a product to inspect rendered HTML and optionally request recrawling.
Use Google's Rich Results Test on a product; local checks validate syntax and
the supported Product/Offer fields, not Google's live eligibility decision:
https://developers.google.com/search/docs/appearance/structured-data/product-snippet
Real social-platform preview cards/caches and rich result appearance are not
guaranteed by valid tags. Full page-body prerendering, field Core Web Vitals and
real credential-based auth smoke tests remain outside the verified results.
