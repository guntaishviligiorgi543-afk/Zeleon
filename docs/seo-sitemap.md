# SEO sitemap

The canonical origin is `https://zeleon.store`. The public page list in
`src/app/seo-pages.json` contains home, shop, our-story and contact. Active,
anonymously accessible Supabase products add `/product/{id}/` entries. IDs match
the existing Angular route and provide one canonical URL even when a product is
also reachable by slug. Canonical URLs use trailing slashes so GitHub Pages can
serve their generated directory entry pages with HTTP 200.

## Generation and deployment

- `npm run sitemap` refreshes `public/sitemap.xml` using the existing public
  Supabase configuration and anonymous RLS. Only id, is_active and updated_at
  are requested. No service credentials or unpublished product data are used.
- `npm run build -- --configuration production --base-href /` runs generation
  before Angular, then validates XML/robots and creates public static entry
  pages with canonical and robots metadata. Existing SPA fallback handling,
  base href and Google verification are preserved.
- The deployment workflow runs on master pushes, manual dispatch and the cron
  `17 */6 * * *` (UTC). Each run queries current products. Admin additions,
  edits, unpublishing and deletion appear after the next successful deployment;
  this is not instantaneous. Dispatch the workflow for an earlier refresh.
  GitHub schedules can be delayed. Scheduled execution itself must be observed
  separately; build-time regeneration and simulated catalog changes are tested.
- API failure stops the build rather than replacing the deployed sitemap with
  an incomplete catalog. The committed XML is a snapshot; deployment regenerates
  it. Reliable product modification timestamps supply lastmod; static page
  timestamps are omitted.

`public/robots.txt` allows crawling and advertises the root sitemap. Private
routes are excluded from the sitemap and receive noindex metadata through the
new Angular Seo service, including during client navigation. This metadata is
not access control. Authentication, staff MFA and RLS remain unchanged.

## Verification

`npm run test:seo` tests XML, filtering, catalog changes, pagination, failure
handling, static metadata and workflow hooks. Angular metadata tests live in
`src/app/services/seo.spec.ts`.

For headless HTTP and browser verification, run `node scripts/verify-seo.mjs`
with Playwright installed externally and `PLAYWRIGHT_MODULE_PATH` pointing to
its package. `SEO_TEST_BASE_URL` defaults to production. It verifies the XML and
robots MIME types, every public URL's HTTP 200 status, canonical metadata,
Google verification, private noindex rules and product ID/slug equivalence.
No database mutations are made.

The initial generated catalog contains 16 URLs: four public pages and 12 active
products. Production build, seven generator tests and 28 focused Angular tests
passed. The broader existing suite also contains unrelated failures; it is not
claimed to pass.

Submit `https://zeleon.store/sitemap.xml` in the verified Search Console
property. Sitemap availability does not guarantee Google indexing. GitHub Pages
continues to serve Angular client-rendered content; these entry pages provide
HTTP 200 and static head metadata, not server-rendered product content.
