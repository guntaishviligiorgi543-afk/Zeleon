# ZELEON Google Search appearance audit

Audited production `https://zeleon.store` and the Angular 22 source on 2026-11-17.
Changes in this audit are local only: no commit, push, deployment, DNS change,
or live GitHub Pages settings change was made.

## Conclusion

The current production homepage already delivers a descriptive title, the expected
meta description, meaningful Angular-rendered HTML, and an accessible compliant
favicon before JavaScript runs. No confirmed missing-tag, empty-body, broken-favicon,
incorrect-MIME, robots-blocking, or bad asset-path defect explains the reported
Google result. Google's stored version and current query-specific result were not
available through Search Console, so a stale crawl is a possibility, not a proven
root cause. A search-provider query is not a substitute for URL Inspection.

One separate hosting defect was confirmed: HTTP is served without an HTTPS
redirect. One browser-test synchronization problem was also confirmed and fixed.

## Findings and evidence

| Area | Production observation | Assessment/action |
| --- | --- | --- |
| Homepage title | Exactly one title: `ZELEON | Premium Energy Drinks` | Descriptive and correct; unchanged. |
| Homepage description | Exactly one description: `Discover ZELEON premium energy drinks. Explore bold flavors and our collection of classic, boost blend, and zero sugar drinks.` | Relevant and present in the initial response; unchanged. |
| HTML delivery | HTTP 200, `text/html; charset=utf-8`, approximately 106.7 kB | GitHub Pages serves the generated page, not an empty Angular shell. |
| No-JavaScript content | Homepage main contains approximately 983 characters of text: hero copy, category names, actual product links/names/prices, promotion and subscription content | Meaningful body is present before JavaScript. Browser tests separately disable JavaScript. No new hidden text was added. |
| Prerender/source distinction | `src/index.html` contains the generic shell title, but `sitemap.mjs prepare` and `prerender.mjs` replace it with route-specific metadata and rendered content | The generic source shell is not the live homepage's title. No SSR migration is needed. |
| Canonical | Exactly one `https://zeleon.store/` canonical; all six other approved pages self-canonicalize with trailing slashes | Correct; unchanged. |
| Robots and snippets | Public pages contain `index, follow`. No `nosnippet`, `max-snippet:0`, Googlebot-specific blocker, `data-nosnippet`, or `X-Robots-Tag` blocker was found | No snippet suppression was found. Regression checks added. |
| Sitemap | Exactly seven approved HTTPS URLs; none are products or private pages | Correct; unchanged. |
| Product routes | ID/slug routes remain accessible and `noindex, follow`; slug redirects retain ID canonicals | Correct; unchanged. |
| Private routes | Cart/Checkout/auth/profile/staff entry shells are noindex; browser guards and anonymous cart login remain tested | Correct; unchanged. |
| Open Graph | Title, description, type, URL, brand image, site name and image alt are in the initial HTML | Correct and consistent with the homepage; unchanged. |
| Twitter | Card, title, description, image and image alt are in the initial HTML | Correct metadata presence; unchanged. Social tags do not force Google's normal text snippet or favicon. |
| Structured data | Homepage Organization and WebSite data identify ZELEON and the canonical domain | Present without adding fictitious company details; unchanged. |
| Mixed content | No `http://` image, script or stylesheet URLs were found in the HTTPS homepage | No mixed-content asset-path defect found. |
| `www` hostname | `https://www.zeleon.store/` returns 301 to `https://zeleon.store/` | Correct hostname consolidation. |
| HTTP hostname | Repeated requests to `http://zeleon.store/` return 200 with no Location header, served by GitHub.com; the HTML canonical still points to HTTPS | Confirmed hosting issue. Enable GitHub Pages **Enforce HTTPS**; see the pending action below. |
| GitHub project URL | `https://guntaishviligiorgi543-afk.github.io/Zeleon/` returns 301 to `http://zeleon.store/` | The same HTTPS enforcement issue affects this redirect target. |
| Trailing slash | `/shop/classic` redirects 301 to `/shop/classic/` | Matches canonical/sitemap conventions. |

### The seven approved canonical pages

Each returns HTTP 200, a unique title/description, `index, follow`, and its own canonical:

- `https://zeleon.store/`
- `https://zeleon.store/shop/`
- `https://zeleon.store/our-story/`
- `https://zeleon.store/contact/`
- `https://zeleon.store/shop/classic/`
- `https://zeleon.store/shop/boost-blends/`
- `https://zeleon.store/shop/zero-sugar/`

This audit adds no routes and changes neither the allowlist nor product indexing.
The existing HTTP duplicate is a hosting variant, not an additional application route.

## Favicon audit

The existing stable URL is:

`https://zeleon.store/images/favicon.png`

- The link is in the original homepage head and every prerendered public page.
- The root-relative path resolves correctly on both root and nested category URLs.
- GET returns HTTP 200 with `Content-Type: image/png`; no authentication is needed.
- PNG signature and IHDR dimensions are valid: **500 x 500**, square, **186,971 bytes**.
- Browser decoding confirms the image is valid, not an HTML fallback masquerading as an icon.
- The live bytes equal the source asset byte-for-byte. SHA-256:
  `e03700efc69b5a6a59baa64fb2317fdd8cc8984c2eccc2e026529fb755ba93bc`.
- The navy Z and yellow lightning artwork was visually inspected and is unchanged.
- Googlebot-like requests can retrieve the homepage and Googlebot-Image-like requests
  can retrieve the PNG with HTTP 200. Spoofing a user agent does not prove what the
  real Google crawler has fetched; Search Console is needed for that history.
- `robots.txt` allows crawling and has no product/image disallow rules. Neither
  tested response has an indexing-blocking response header.
- Cache-Control is `max-age=600`; the URL is stable and has no query-version suffix.
- Spaces are correctly percent-encoded. Parentheses in this working URL are not a defect.
- `/favicon.ico` returns 404, but it is not referenced. Google accepts an explicit
  PNG favicon at another URL; an ICO file, manifest and apple-touch icon are not
  prerequisites for the organic Search favicon.
- The missing optional `sizes` attribute was not a Google eligibility failure.
  The local source now accurately declares `sizes="500x500"` as a small hardening change.
- Google's current requirements are a square image of at least 8px, with a higher
  resolution above 48px recommended. A 500px PNG qualifies; the current requirements
  do not demand dimensions that are an exact multiple of 48.

No favicon artwork, file bytes, file location or social image was replaced.

## Local changes made

1. `src/index.html`: add the accurate optional favicon `sizes="500x500"` declaration.
   This does not promise a Google favicon update or fix an otherwise invalid image.
2. `scripts/search-appearance.mjs`: reusable checks for this project's stable favicon
   declaration, PNG header/dimensions, and snippet/indexing blockers.
3. `scripts/prerender.mjs`: check favicon declarations and snippet directives in
   generated public HTML; validate the actual copied favicon bytes during prerender
   validation and report the dimensions.
4. `scripts/verify-seo.mjs`: check favicon HTTP status, MIME type, PNG dimensions,
   header/meta snippet blockers, one consistent icon URL across public pages, and
   actual browser decoding. Also fix route waits described below.
5. `scripts/sitemap.test.mjs`: three regression tests cover the unchanged source
   artwork and preserved generated link, bad/missing/ambiguous icon metadata,
   HTML fallbacks, wrong dimensions/sizes, and snippet blockers.
6. `docs/google-search-appearance-audit.md`: this report.

The browser verifier previously used Playwright's default `load` wait for Angular
client navigation. The audit reproduced timeouts even with navigation to the
expected product URL, and a second timeout during category navigation. Route waits
now use `domcontentloaded` plus the existing URL/metadata checks and explicit
product/category readiness selectors. This avoids waiting for unrelated external
assets; it does not relax URL, metadata, category, cart or checkout assertions.

No production component, color, layout, animation, SEO description, Auth, Cart,
Checkout or Supabase code was changed. The pre-existing local formatting edit to
`src/app/services/cart.spec.ts` was left untouched and is not part of this audit.

## Pending hosting correction

Enable **Settings > Pages > Enforce HTTPS** for the existing repository, then
verify that HTTP permanently redirects to the HTTPS canonical and the project
URL no longer lands on HTTP. This is a GitHub Pages administrative setting;
static Angular files cannot send an HTTP redirect status. No JavaScript redirect
or meta-refresh workaround was added. The live setting was left unchanged while
these audit changes are awaiting approval.

This improves canonical URL consolidation but is not proof of the cause of the
reported missing snippet/favicon. The HTTPS page and icon already work today.

## Verification

- Production build, including static preparation and prerendering: passed.
- Complete Angular suite: 275 tests passed across all 48 files; none skipped.
- SEO tests: 14 passed, including the three new regression tests.
- Prerender validation: all seven public pages, favicon PNG, product noindex shells,
  private shells and existing slug redirects passed.
- Local artifact browser verification (`npm run test:seo:local`): passed, including favicon decoding and all seven pages with JavaScript disabled.
- Live browser verification (`npm run test:seo:browser`): passed, including the existing production favicon without a `sizes` attribute, all seven approved URLs, 11 current products, category navigation, anonymous Add to Cart, and Cart/Checkout/staff guards.
- `git diff --check`: passed.
- The existing 669.44 kB initial-bundle warning remains. No budget was raised.

The favicon and metadata audit data and downloaded production responses are kept
in ignored `tmp/search-appearance/`; they are not public/deployed assets.

## What Google must do after a deployment

After approval and deployment, use the verified Search Console property's URL
Inspection for `https://zeleon.store/`:

1. Inspect the indexed version: check last crawl, selected canonical and fetched HTML.
2. Run **Test live URL** and inspect rendered HTML to confirm the title, description,
   favicon link and body are present. Compare the live test with the indexed version.
3. Request indexing of the homepage once. Keep the existing seven-URL sitemap
   submitted; do not submit product URLs or request their indexing.
4. Allow Google to recrawl/process the homepage and icon. Track the actual affected
   query/device/country over time rather than assuming a live test updates Search.

Google generates query-dependent snippets from page content and may choose the
meta description when appropriate. A valid description cannot force exact result
text. Favicon inclusion is also discretionary even when every technical requirement
is met. Existing search results can reflect older fetched content. Recrawling and
processing can take days to weeks; requests do not guarantee timing or appearance.
Open Graph/Twitter tags and sitemap submission do not force these choices.

### Primary references

- [Google: favicon eligibility and recrawling](https://developers.google.com/search/docs/appearance/favicon-in-search)
- [Google: how snippets are generated](https://developers.google.com/search/docs/appearance/snippet)
- [Google: requesting a recrawl](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl)
- [GitHub: enforcing HTTPS for Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)
