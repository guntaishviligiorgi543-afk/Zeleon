import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const base = process.env.RESPONSIVE_BASE_URL || 'http://127.0.0.1:4300';
const output = 'tmp/checkout';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/shop`, { waitUntil: 'domcontentloaded' });
  await page.locator('.productsContainer[aria-busy="false"]').waitFor();
  await page.evaluate(() => document.fonts.ready);
  const logoStyle = await page.locator('header .logo').evaluate(el => {
    const s = getComputedStyle(el); return { font: s.fontFamily, weight: s.fontWeight, color: getComputedStyle(el.querySelector('span')).color };
  });
  const cards = page.locator('.productCard');
  const names = await cards.locator('.prodNam').allTextContents();
  for (let i = 0; i < 3; i++) await cards.nth(i).locator('.cart-action').click();
  await page.locator('.cart-toggle').click();
  await page.locator('.checkout-button').click();
  await page.waitForURL('**/checkout');
  await page.locator('.order-summary[aria-busy="false"]').waitFor();
  assert.equal(await page.locator('.checkout-error').count(), 0, 'Live prices and public stock must load');
  assert.equal(await page.locator('header .logo').count(), 1);
  assert.equal(await page.locator('header h1').textContent(), 'Checkout');
  assert.equal(await page.locator('header .logo').getAttribute('href'), '/');
  assert.deepEqual(await page.locator('header .logo').evaluate(el => {
    const s = getComputedStyle(el); return { font: s.fontFamily, weight: s.fontWeight, color: getComputedStyle(el.querySelector('span')).color };
  }), logoStyle);
  const slide = () => page.locator('.product-slide:not([inert])');
  assert.equal(await slide().locator('h3').textContent(), names[0]);
  assert.equal(await page.locator('#checkout-demo-title').textContent(), 'Checkout Is Coming Soon!');
  assert.equal(await page.locator('app-checkout input').count(), 0);
  const total = await page.locator('.summary-total dd').textContent();
  await page.getByRole('button', { name: 'Next cart product', exact: true }).click();
  assert.equal(await slide().locator('h3').textContent(), names[1]);
  assert.equal(await page.locator('.summary-total dd').textContent(), total);
  await page.getByRole('button', { name: 'Previous cart product', exact: true }).click();
  const increase = slide().getByRole('button', { name: 'Increase quantity', exact: true });
  if (await increase.isEnabled()) {
    await increase.click();
    assert.equal(await slide().locator('output').textContent(), '2');
    assert.notEqual(await page.locator('.summary-total dd').textContent(), total);
    await page.getByRole('button', { name: 'Next cart product', exact: true }).click();
    assert.equal(await slide().locator('output').textContent(), '1');
    await page.getByRole('button', { name: 'Previous cart product', exact: true }).click();
    assert.equal(await slide().locator('output').textContent(), '2');
  }
  assert.equal(await page.locator('.place-order').isDisabled(), true);
  for (const width of [320, 375, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(400);
    const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth,
      cards: [...document.querySelectorAll('.cart-viewer,.checkout-details')].map(el => ({ x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y })) }));
    assert.ok(size.document <= size.viewport, `No page overflow at ${width}px`);
    if (width <= 760) assert.ok(size.cards[1].y > size.cards[0].y);
    else assert.ok(size.cards[1].x > size.cards[0].x);
    const logo = await page.locator('header .logo').boundingBox();
    assert.ok(logo.x > width / 2, 'Logo is on the right');
    if ([375, 1440].includes(width)) await page.screenshot({ path: `${output}/${width}.png`, fullPage: true });
    console.log(`PASS live checkout ${width}px: layout, logo, no page overflow`);
  }
  // Fixtures only intercept public catalog reads; they never write to the database.
  const firstPrice = Number((await slide().locator('.product-price strong').textContent()).replace(/[^0-9.]/g, ''));
  let ids = [];
  await page.route('**/rest/v1/product_inventory?**', async route => {
    ids = new URL(route.request().url()).searchParams.get('product_id').slice(4, -1).split(',');
    await route.fulfill({ json: [{ product_id: ids[0], quantity: 0 }] });
  });
  await page.route('**/rest/v1/product_sales?**', async route => {
    const saleIds = new URL(route.request().url()).searchParams.get('product_id').slice(4, -1).split(',');
    await route.fulfill({ json: [{ product_id: saleIds[0], sale_price: firstPrice / 2, is_active: true, starts_at: null, ends_at: null }] });
  });
  await page.getByRole('button', { name: 'Refresh prices', exact: true }).click();
  await page.locator('.order-summary[aria-busy="false"]').waitFor();
  assert.ok((await slide().locator('.stock').textContent()).includes('OUT OF STOCK'));
  assert.equal(await slide().getByRole('button', { name: 'Increase quantity', exact: true }).isDisabled(), true);
  assert.equal((await slide().locator('.sale-badge').textContent()).trim(), '−50%');
  assert.equal(await slide().locator('del').count(), 1);
  await page.getByRole('button', { name: 'Next cart product', exact: true }).click();
  assert.equal(await slide().getByRole('button', { name: 'Increase quantity', exact: true }).isEnabled(), true, 'Missing inventory is not zero stock');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.carousel-track').evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  await page.locator('.carousel').evaluate(el => {
    for (const [name, key, x, y] of [['touchstart', 'touches', 250, 200], ['touchend', 'changedTouches', 100, 205]]) {
      const event = new Event(name, { bubbles: true });
      Object.defineProperty(event, key, { value: [{ clientX: x, clientY: y }] });
      el.dispatchEvent(event);
    }
  });
  assert.equal(await slide().locator('h3').textContent(), names[2]);
  for (let i = 0; i < 3; i++) await slide().getByRole('button', { name: 'Remove', exact: true }).click();
  await page.locator('#empty-title').waitFor();
  assert.equal(await page.locator('.place-order').count(), 0);
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS carousel, form persistence/validation, quantities, live catalog reads, discounts, stock, swipe, reduced motion, empty cart, and no fake order');
} finally { await browser.close(); }
