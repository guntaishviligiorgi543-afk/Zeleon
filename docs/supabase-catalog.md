# Supabase catalog

The browser uses the existing project's public publishable key in
`src/environments/environment.ts`. No service-role or secret key belongs in Angular.
To rotate configuration, replace `supabasePublishableKey` with another enabled
`sb_publishable_...` key from Supabase Project Settings → API Keys.

`Products` reads active products and their category/image relationships in one
query. Numeric/UUID IDs and slugs are supported by the unchanged `/product/:id`
route. Prices use each product's stored currency. Primary images are preferred;
the earliest available image is a deterministic fallback. Public URLs use
`product-images`. The application never uploads, inserts, or changes RLS.

The catalog and Auth now share one client. Browser sessions persist through the
Supabase SDK; signed-in reads use authenticated RLS permissions and signed-out
reads use anonymous permissions. If reads fail, check the existing SELECT
policies for all three related tables; do not disable RLS. See `authentication.md`.

Shop keeps its existing three-column grid, filtering, sort menu, card DOM/classes,
and CSS. The attribute-form ProductCard component reuses the unchanged Shop CSS.
Product Details was a placeholder, so its data view reuses those same styles.

Verification:

```
node scripts/verify-catalog.mjs
npm.cmd run build
```

The verification script performs public read-only API calls and checks the six
existing products, categories, primary image responses, ID/slug lookup, and an
unknown slug. It requires network access. No database or Storage mutations occur.
