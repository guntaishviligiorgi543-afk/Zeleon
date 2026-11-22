// Local mocked browser integration only. No requests reach hosted APIs.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serveStatic } from './static-server.mjs';
const server = await serveStatic('dist/zeleon/browser');
const browser = await chromium.launch({ headless: true });
const artifact = 'tmp/catalog-qa';
await mkdir(artifact, { recursive: true });
const categories = [
  { id: 1, name: 'Classic', slug: 'classic' },
  { id: 2, name: 'New category', slug: 'new-category' },
];
const products = [1, 2].map((id) => ({
  id,
  name: id === 1 ? 'Paradise Boost' : 'Berry Blast',
  slug: `drink-${id}`,
  description: 'A refreshing ZELEON energy drink.',
  brand: 'ZELEON',
  category_id: id,
  product_type_id: null,
  flavor_id: null,
  price: 15,
  currency: 'USD',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  category: categories[id - 1],
  product_type: null,
  flavor: null,
  images: [
    { id, storage_path: 'product.avif', is_primary: true, created_at: '2026-01-01T00:00:00Z' },
  ],
  inventory: { quantity: id === 1 ? 20 : 0, low_stock_threshold: 10 },
}));
const offers = products.map((p) => ({
  product_id: p.id,
  regular_price: 15,
  effective_price: p.id === 1 ? 10 : 15,
  currency: 'USD',
  stock_quantity: p.id === 1 ? 20 : 0,
  on_sale: p.id === 1,
  out_of_stock: p.id === 2,
}));
const user = {
  id: '11111111-1111-4111-8111-111111111111',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'manager@example.test',
  email_confirmed_at: '2026-01-01T00:00:00Z',
  app_metadata: {},
  user_metadata: {},
  factors: [
    { id: '22222222-2222-4222-8222-222222222222', factor_type: 'totp', status: 'verified' },
  ],
};
const encode = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, aud: 'authenticated', role: 'authenticated', aal: 'aal2', session_id: '33333333-3333-4333-8333-333333333333', exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) })}.local-test-signature`;
let checks = 0;
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    });
    await context.addInitScript(
      ({ token, user }) =>
        localStorage.setItem(
          'sb-nunxmgltzvknnmkdvjsw-auth-token',
          JSON.stringify({
            access_token: token,
            refresh_token: 'local-mocked-refresh',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            expires_in: 3600,
            token_type: 'bearer',
            user,
          }),
        ),
      { token, user },
    );
    const errors = [];
    await context.route('**/*', async (route) => {
      const req = route.request(),
        url = new URL(req.url());
      if (url.origin === server.origin) return route.continue();
      const headers = {
        'Access-Control-Allow-Origin': server.origin,
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      };
      const json = (data) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers,
          body: JSON.stringify(data),
        });
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (url.pathname === '/auth/v1/user') return json(user);
      if (url.pathname === '/rest/v1/staff_roles')
        return json({ user_id: user.id, role: 'manager', status: 'active' });
      if (url.pathname === '/rest/v1/rpc/staff_session') return json(true);
      if (url.pathname === '/rest/v1/products') {
        const id = url.searchParams.get('id')?.replace('eq.', '');
        const rows = id ? products.filter((p) => String(p.id) === id) : products;
        return json(req.headers()['accept']?.includes('object') ? rows[0] : rows);
      }
      if (url.pathname === '/rest/v1/catalog_product_offers') return json(offers);
      if (url.pathname === '/rest/v1/categories') return json(categories);
      if (url.pathname.startsWith('/storage/v1/object/public/product-images/'))
        return route.fulfill({
          status: 200,
          contentType: 'image/avif',
          headers,
          body: await readFile('public/images/middleone.avif'),
        });
      if (url.pathname.startsWith('/rest/v1/')) return json([]);
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(server.origin + '/shop/');
    await page.locator('#shop-products[aria-busy="false"]').waitFor();
    assert.equal(await page.locator('.productCard').count(), 2);
    assert.equal(await page.locator('.sale-badge').count(), 1);
    assert.match(await page.locator('.productCard').nth(1).innerText(), /OUT OF STOCK/);
    assert.equal(
      await page.locator('.productCard').nth(1).locator('.cart-action').isDisabled(),
      true,
    );
    assert.equal(
      await page.locator('.filters').getByText('New category', { exact: true }).count(),
      1,
    );
    await page.screenshot({ path: `${artifact}/shop-${width}.png`, fullPage: true });
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Shop overflow at ${width}`,
    );
    checks += 6;
    await page.goto(server.origin + '/product/1');
    await page.locator('.product-info h1').waitFor();
    assert.match(await page.locator('.product-info').innerText(), /Paradise Boost/);
    assert.equal(await page.locator('.product-info s').count(), 1);
    await page.screenshot({ path: `${artifact}/details-${width}.png`, fullPage: true });
    checks += 2;
    await page.getByRole('button', {name:'Buy Now',exact:true}).click();
    await page.locator('#checkout-demo-title').waitFor();
    await page.locator('.order-summary[aria-busy="false"]').waitFor();
    assert.equal(await page.locator('.place-order').isDisabled(),true);
    assert.equal(await page.locator('app-checkout input').count(),0);
    assert.match(await page.locator('app-checkout').innerText(),/learning and demonstration project/);
    assert.equal(await page.locator('.demo-actions a[href="/cart"]').count(),1);
    assert.equal(await page.locator('.product-slide').count(),1);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`${artifact}/checkout-${width}.png`,fullPage:true});checks+=6;
    await page.goto(server.origin + '/manager/catalog');
    await page.locator('h1').filter({ hasText: 'Catalog management' }).waitFor();
    await page.getByRole('heading', { name: 'Categories', exact: true }).waitFor();
    await page.screenshot({ path: `${artifact}/catalog-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Discounts', exact: true }).click();
    await page.getByRole('heading', { name: 'Create discount', exact: true }).waitFor();
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Discount editor overflow at ${width}`,
    );
    await page.screenshot({ path: `${artifact}/discounts-${width}.png`, fullPage: true });
    checks += 2;
    await page.goto(server.origin + '/manager/products');
    await page.getByRole('button', { name: 'Add product', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    assert.equal(
      await page.getByRole('dialog').getByText('Product Image', { exact: true }).count(),
      1,
    );
    await page.screenshot({ path: `${artifact}/product-editor-${width}.png`, fullPage: true });
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Product editor overflow at ${width}`,
    );
    await page.getByRole('button', { name: 'Save product', exact: true }).scrollIntoViewIfNeeded();
    assert(await page.getByRole('button', { name: 'Save product', exact: true }).isVisible());
    await page.screenshot({
      path: `${artifact}/product-editor-lower-${width}.png`,
      fullPage: true,
    });
    checks += 3;
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(
    JSON.stringify({
      checks,
      viewports: [1440, 390],
      screenshots: artifact,
      mode: 'local mocked API; no hosted writes or charges',
    }),
  );
} finally {
  await browser.close();
  await server.close();
}
