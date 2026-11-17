# Public prerendering on GitHub Pages

The production build now saves actual Angular-rendered HTML for `/`, `/shop/`,
`/our-story/`, `/contact/`, `/shop/classic/`, `/shop/boost-blends/`, and
`/shop/zero-sugar/`. These are the only seven indexable pages. It uses
build-time Chromium rendering, not Angular server rendering or hydration. No
server runs in production. Visitors receive the rendered HTML first; the normal
Angular bootstrap replaces it and attaches the existing behavior.

## Build and verify

```sh
npm ci
npx playwright install --with-deps chromium
npm run test:seo
npm run test:public-safety
npm run build -- --configuration production --base-href /
npm run test:seo:local
```

For local Windows machines with Google Chrome already installed, set
`PRERENDER_BROWSER_CHANNEL=chrome` in the environment instead of downloading
Chromium. CI installs the browser pinned by the Playwright lockfile. To verify
the live deployment, use `npm run test:seo:browser` (optional
`SEO_TEST_BASE_URL` override).

## Data and rendering boundaries

1. `scripts/sitemap.mjs generate` reads active products using the existing public
   Supabase publishable key. Only the explicitly selected public catalog fields
   are saved in `tmp/prerender-products.json` and `tmp/seo-catalog.json`.
2. `ng build` produces the unchanged browser application.
3. `scripts/sitemap.mjs prepare` writes public heads, private noindex shells,
   the empty SPA `404.html`, empty product ID shells (`noindex, follow`), and
   product slug redirects. It first removes the old product output directory,
   preventing obsolete product snapshots from surviving preparation.
4. `scripts/prerender.mjs` opens only sitemap routes in a fresh anonymous browser
   context per page. Public product GETs replay the same build snapshot; auth,
   private API calls, writes, and external scripts fail the build. Remote media
   requests are skipped during capture; their original URLs remain in HTML.
5. It waits for the routed Angular components and product data, saves their DOM
   and component styles, and validates visible content and all SEO metadata.
   A snapshot-only selector makes AOS content visible before JavaScript; Angular
   removes those marked children when bootstrapping, preserving runtime motion.
6. CI validates generated files and tests them with and without JavaScript before
   uploading `dist/zeleon/browser` to Pages.

The temporary snapshots and browser state are never deployed. Private routes are
not rendered. OAuth callback handling, Supabase Auth, Staff MFA, guards, RLS,
cart behavior and product records are unchanged. Category routes reuse the Shop
component, catalog and product cards. Its existing filters are now crawlable
links, and each category has a heading and short introduction.

## Product aliases and 404s

Only existing catalog slugs receive `/product/<slug>/index.html`. These files
return HTTP 200 from static hosting, contain `noindex, follow`, and point their
canonical and zero-second meta refresh to `/product/<id>/`. A small
`location.replace` preserves query strings and fragments when JavaScript is on.
No Angular bundle runs on the redirect page. Neither ID nor slug product URLs
appear in the sitemap. Product ID entry files contain an empty Angular root
with `noindex, follow`; product bodies load through the existing client route.
Unsafe, duplicate, or ID-like conflicting slugs fail the build rather than
overwriting another route. Numeric and UUID product IDs remain supported.

GitHub Pages does not expose per-product HTTP redirect configuration, so these
are HTML redirects, not HTTP 301/308 responses. Unknown/unpublished products have
no generated directory and receive the genuine HTTP 404 SPA fallback. Internal
Angular navigation still uses the existing ID/slug lookup and ID canonical.

## Operational limits

- Catalog edits become static HTML at the next successful build/deployment:
  push to master, manual dispatch, or the existing six-hour schedule. There is
  no new database webhook. Until then, a newly created product can still have a
  static 404 until deployment refreshes its entry shell. Product bodies always
  load current public data in the browser.
- This is a full browser DOM snapshot followed by client bootstrap, not Angular
  hydration. Live data is fetched again after bootstrap. Normal CSR loading
  states can briefly appear; no LCP/INP/CLS improvement is claimed without measurement.
- Shop prerendering preserves the existing first-page pagination; all active
  products remain accessible through client-side routes but never enter the
  sitemap or browser snapshot loop. Category listings use the existing filters.
- The custom-domain/Pages settings and robots policy are unchanged.
- Auth/guard unit tests and anonymous browser checks do not replace real-user
  Google OAuth or Staff MFA acceptance tests. No production account or MFA
  challenge is exercised by the build.
