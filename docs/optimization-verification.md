# ZELEON test and performance verification

Verified locally on 2026-11-17 against the production GitHub Pages artifact.
The earlier category SEO changes were already present and remain uncommitted.
No commit or push was made during this task.

## Changes in this task

| Files | Change |
| --- | --- |
| `src/app/testing/auth-stub.ts` | Add the real Auth API's `getCurrentUser()` to the shared reactive stub. |
| `src/app/pages/support-rating/rating-link.spec.ts` | Use the authenticated shared stub, supply conversation ownership, and support lazy route substitution. |
| `src/app/pages/support-rating/support-rating.spec.ts` | Use the shared stub with a customer identity and matching conversation ownership. |
| `src/app/services/manager-dashboard.spec.ts` | Model `update().eq().select().maybeSingle()` and test both successful update and denied/zero-row update. |
| `src/app/components/manager-navigation/manager-navigation.spec.ts` | Cover active Admin/Support shortcuts and inactive assignments; a shortcut does not grant workspace access. |
| `src/app/pages/manager/support/manager-support.spec.ts` | Test the current full-screen thread: backdrop press retains it; Back closes it. |
| `src/app/app.routes.ts` | Lazy-load storefront, product, account and profile screens without changing guards, paths or category data. |
| `src/app/app.html` | Defer the actual homepage backdrop until the support-rating modal needs it. |
| `src/app/pages/home/home.ts`, `home.html`, `home.css` | Reuse the extracted hero, preserve section controllers, and remove duplicate mobile declarations already supplied by the tablet breakpoint. |
| `src/app/pages/home/hero/hero.ts`, `hero.html`, `hero.css` | Stateless hero component with the original markup, responsive styles and keyframes; `display: contents` preserves layout. |
| `angular.json` | Load the installed AOS 2.3.4 UMD file through Angular's global-script pipeline. Budgets are unchanged. |
| `src/app/aos-engine.ts`, `src/app/app.ts` | Inject that same AOS API instead of importing its CommonJS bundle into the ES module graph. Existing options, refreshes and observers are unchanged. |
| `src/app/app.spec.ts`, `app.aos.spec.ts`, `app.aos-layout.spec.ts` | Supply the animation API explicitly; retain the real-library layout and scroll replay regression test. |
| `scripts/verify-seo.mjs` | Explicitly assert anonymous Cart and Checkout redirects to login with the intended return URL. |
| `docs/optimization-verification.md` | This report. |

No production authentication, database, checkout, cart, Header or product-card logic
was changed. No packages were added or upgraded. No assertions or tests were
removed or skipped. The additional failures were stale test mocks/expectations.

## Bundle measurements

Decimal kB. Initial JavaScript includes the separately emitted AOS script.
Figures come from recursively following static imports in the built HTML entry
files and checking asset sizes, consistent with Angular's initial-bundle report.
The saved before artifact is the preceding category SEO production build.

| Measurement | Before | After | Change |
| --- | ---: | ---: | ---: |
| Initial JavaScript | 961.992 kB | 642.464 kB | -33.2% |
| Initial CSS | 26.975 kB | 26.975 kB | unchanged |
| Angular initial total | 988.967 kB | 669.439 kB | -32.3% |
| Estimated initial transfer, Angular CLI | 209.54 kB | 161.20 kB | -23.1% |
| Largest Home component stylesheet, minified before Angular scoping | 14.974 kB | 11.388 kB | below the unchanged 12 kB warning budget |

The extracted hero stylesheet is 3.768 kB. This is a real component boundary,
not a claim that combined homepage CSS downloads became smaller: shared typography
and component scoping add a small amount overall. Both components are loaded
with the Home route; other routes no longer load Home's presentation code.

## Verification results

| Check | Result |
| --- | --- |
| `npm run build -- --configuration production --base-href / --stats-json` | Pass, including preparation and prerendering of all seven public pages. |
| `npm test -- --watch=false` | All 275 tests pass across all 48 files. No skipped tests. |
| `npm run test:seo` | All 11 tests pass. |
| `npm run test:seo:local` | Pass against the built artifact over HTTP and in Chromium, including explicit Cart/Checkout login redirects. |
| `npm run test:prerender` | Pass: seven rendered public pages, 11 current product slug redirects, empty product/private shells. |
| Desktop/mobile visual comparison | All 18 screenshots match pixel-for-pixel at 1440px and 390px; computed geometry and styles also match. Covers every Home section plus Shop, Our Story and Contact, including the unchanged Header. |
| Normal-motion browser comparison | Hero transforms at five points in the 4-second animation and animation timing match; the real AOS trigger/reset/replay and timing match the before artifact. |
| `git diff --check` | Pass. |

Visual capture waits for visible images to load. Reduced-motion captures make
static comparisons reproducible; normal-motion checks separately cover animation
behavior. These samples are regression evidence, not an exhaustive browser/device
or Core Web Vitals certification. Temporary snapshots, screenshots and measurements
are in ignored `tmp/performance/` and are not deployed.

SEO verification confirms the exact seven-page sitemap, category filtering and
unique metadata, meaningful HTML without JavaScript, product `noindex, follow`,
ID/slug navigation, private noindex metadata, anonymous Add to Cart login gating,
and protected Cart/Checkout and staff routes. No product URLs enter the sitemap.
No persistent SSR server or deployment-architecture changes were introduced.

## Remaining warning and unresolved work

The initial bundle still exceeds the unchanged 500 kB warning budget by
169.439 kB. This warning remains visible; it has not been suppressed or moved
outside the reported initial total. The 1 MB error budget is satisfied.

Build stats show that the largest remaining initial dependencies are the full
Supabase client (~222.9 kB), Angular core/reactivity (~160.5 kB), and the router
(~99.4 kB across its inputs), followed by the live storefront shell. These support
existing session initialization, navigation, chat, and cart behavior. Getting
below 500 kB requires further architectural work on those dependencies; this task
does not rewrite authentication or delay the Header to make the budget pass.

The homepage CSS and AOS CommonJS warnings are resolved. There are no remaining
test failures or known functional regressions in the checks performed.
