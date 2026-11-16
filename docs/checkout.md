# Checkout

The `/checkout` page uses the shared in-memory Cart service. Its carousel changes
between cart products, with quantity changes and removals written only to that
service. The reactive customer form stays mounted while slides change. Checkout
can be opened from the cart drawer or an existing product's Buy Now action.

The checkout header reuses the original header wordmark through one shared
Angular template, including the existing Climate Crisis font and original color.
Storefront navigation, footer and customer chat return when leaving checkout.

## Catalog contract verified on 2026-11-16

Read-only inspection of the Zeleon Supabase project confirmed:

- `products`: `id`, `price`, `currency`, `is_active`.
- `product_inventory`: `product_id`, nullable integer `quantity`. A missing row or
  null quantity means unconfigured inventory; zero means out of stock.
- `product_sales`: `product_id`, numeric `sale_price`, `is_active`, nullable
  `starts_at` and `ends_at`. Start is inclusive; end is exclusive. The lowest
  currently active price below the regular price is used for the display estimate.
- Both inventory and active sales have public SELECT grants and RLS enabled.
- `orders` supports customer email, optional first/last names and phone, a JSONB
  shipping address, USD totals, and separate order/payment statuses. Customer
  access to orders and order items is SELECT-only.

Checkout reads fresh product prices, inventory and sales for cart product IDs.
It refreshes every minute, checks loaded sale windows each second, aborts stale
requests, and offers manual retry. Read errors prevent quantity increases and
block checkout; they are never interpreted as unconfigured inventory. Totals
use integer cents and include every line, grouped by currency. Non-USD products
are blocked because the existing orders table only supports USD.

## Remaining backend requirements

There is no checkout/order RPC or deployed order-processing Edge Function, payment
integration, or verified shipping/tax quote contract. Place Order is therefore
disabled with an explicit explanation. No order inserts, payment calls, success
screens, fake receipts, or database schema changes were introduced. Form data
stays local to the page. Phone and postal code are optional; the schema does not
establish a required phone or postal-code format.

Before enabling ordering, define and implement a backend contract that validates
customer/address inputs, reloads authoritative active product prices and sale
windows, checks and reserves inventory atomically, calculates shipping/tax,
enforces currency, and prevents duplicate orders using idempotency. Payment
confirmation must come from the chosen provider. Do not enable the button by
changing the frontend flag alone.

The task attachment contained written requirements only, with no reference
image. The implementation follows its two-column layout and navy/cyan/purple
visual direction using existing product imagery and branding.

## Verification

- Focused Angular tests cover checkout, catalog pricing/queries, cart, drawer,
  header, and application shell.
- `scripts/verify-checkout.mjs` checks live anonymous catalog reads and checkout
  navigation, responsive layouts at six widths, branding, carousel navigation,
  form persistence/validation, quantities, touch handling, reduced motion, and
  empty-cart behavior. Sale and stock edge cases intercept public reads only;
  the script does not change the database.
- Screenshots: `tmp/checkout/375.png` and `tmp/checkout/1440.png`.
- Run the browser check against an Angular dev server using
  `RESPONSIVE_BASE_URL` (default `http://127.0.0.1:4300`) and
  `PLAYWRIGHT_CHANNEL` (default `msedge`).
