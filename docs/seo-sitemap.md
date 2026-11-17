# Category-level SEO sitemap

The canonical origin is `https://zeleon.store`. The explicit allowlist in
`src/app/seo-pages.json` contains exactly seven indexable pages:

- `/`
- `/shop/`
- `/our-story/`
- `/contact/`
- `/shop/classic/`
- `/shop/boost-blends/`
- `/shop/zero-sugar/`

Every entry has an Angular route, unique title and description, a self-referencing
canonical with a trailing slash, and `index, follow`. The three category routes
reuse Shop and its filtering, sorting, pagination and product cards. Shop's
category filters are internal links to those routes; old query filters still work.

## Products and private routes

All individual product routes use `noindex, follow` before and after product
loading and during Angular navigation. ID/slug URLs remain accessible and retain
the existing ID canonical and sharing metadata. They never enter the sitemap.
Product static entry shells have an empty Angular root; product bodies are not
prerendered. Existing slug redirects preserve queries and fragments.

Cart, checkout, login, signup, profile, staff workspaces and authentication routes
remain `noindex, nofollow`. Static private shells and the 404 fallback contain no
public canonical or snapshot. The wildcard route displays the 404 page.

`public/robots.txt` continues to allow crawling and advertise the sitemap. Do not
add product disallow rules: crawlers must be able to see the noindex directive.
These directives do not replace authentication or access controls.

## Build and deployment

`npm run build -- --configuration production --base-href /` generates the sitemap,
compiles Angular, prepares entry files and prerenders only the seven approved
pages using Chromium. The existing read-only anonymous catalog snapshot supplies
real product listings; no product data is modified. API failures stop the build.
Product output is cleared before preparation so obsolete snapshots are removed.

GitHub Pages remains static hosting with no SSR server. The master push, manual
workflow and six-hour schedule are unchanged. Category content and static product
entry shells refresh on the next successful deployment; the sitemap allowlist
is independent of product additions, edits or deletions.

## Verification

```sh
npx playwright install --with-deps chromium
npm run test:seo
npm run test:public-safety
npm run build -- --configuration production --base-href /
npm run test:prerender
npm run test:seo:local
```

`test:seo:local` verifies the built artifact over HTTP and in a browser, including
category filtering, metadata changes on navigation, private guards, ID/slug links,
no-JavaScript public content, and the anonymous Add to Cart login requirement.
`test:seo:browser` uses the live domain unless `SEO_TEST_BASE_URL` is provided.
See [public prerendering](public-prerendering.md) for capture boundaries.
