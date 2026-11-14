import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { ORIGIN, publicPages, NAMESPACE } from './sitemap.mjs';
import { metadata } from '../src/app/seo-metadata.mjs';

const base = process.env.SEO_TEST_BASE_URL || ORIGIN;
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { JSDOM } = await import('jsdom');
const sitemap = await fetch(base + '/sitemap.xml');
assert.equal(sitemap.status, 200);
assert.match(sitemap.headers.get('content-type'), /xml/);
const xml = await sitemap.text();
const document = new JSDOM(xml, { contentType: 'application/xml' }).window.document;
assert.equal(document.documentElement.namespaceURI, NAMESPACE);
const locations = [...document.getElementsByTagNameNS(NAMESPACE, 'loc')].map(element => element.textContent);
const socialImages = new Set();
const staticProducts = new Map();
assert.equal(new Set(locations).size, locations.length);
const robots = await fetch(base + '/robots.txt');
assert.equal(robots.status, 200);
assert.match(robots.headers.get('content-type'), /text\/plain/);
assert.match(await robots.text(), /Sitemap: https:\/\/zeleon\.store\/sitemap.xml/);
for (const loc of locations) {
  const url = new URL(loc);
  assert.equal(url.origin, ORIGIN);
  const response = await fetch(base + url.pathname, { redirect: 'manual' });
  assert.equal(response.status, 200, `Public sitemap entry did not return HTTP 200: ${loc}`);
  const html = await response.text();
  assert(html.includes(`<link rel="canonical" href="${loc}">`));
  assert(html.includes('content="index, follow"'));
  assert(html.includes('name="google-site-verification"'));
  const head = new JSDOM(html).window.document;
  assert.equal(head.querySelectorAll('title').length, 1);
  assert.notEqual(head.title, 'Zeleon');
  for (const selector of ['meta[name="description"]', 'meta[property="og:title"]', 'meta[property="og:description"]', 'meta[property="og:url"]', 'meta[property="og:image"]', 'meta[name="twitter:card"]']) assert.equal(head.querySelectorAll(selector).length, 1, `${selector}: ${loc}`);
  assert(head.querySelector('meta[property="og:image"]').content.startsWith('https://'));
  socialImages.add(head.querySelector('meta[property="og:image"]').content);
  assert(head.querySelector('noscript[data-zeleon-seo-content]'), 'No public no-JavaScript fallback');
  if (url.pathname.startsWith('/product/')) {
    const schema = JSON.parse(head.querySelector('script[data-zeleon-seo]').textContent);
    assert.equal(schema['@type'], 'Product');
    assert.equal(typeof schema.offers.price, 'number');
    assert.match(schema.offers.priceCurrency, /^[A-Z]{3}$/);
    staticProducts.set(url.pathname, schema);
  }
}
for (const url of socialImages) {
  const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(30_000) });
  assert(response.ok, `Social image unavailable: ${url}`);
  assert.match(response.headers.get('content-type'), /^image\//);
}
for (const path of ['/login/', '/signup/', '/cart/', '/checkout/', '/forgot-password/', '/reset-password/', '/auth/callback/', '/staff-auth/', '/profile/', '/manager/', '/admin/', '/support/', '/unknown-seo-route/']) {
  const response = await fetch(base + path);
  const head = new JSDOM(await response.text()).window.document;
  assert.equal(head.querySelector('meta[name="robots"]').content, 'noindex, nofollow', path);
  assert.equal(head.querySelectorAll('link[rel="canonical"],script[data-zeleon-seo]').length, 0, path);
}
const config = await readFile(new URL('../src/environments/environment.ts', import.meta.url), 'utf8');
const setting = name => config.match(new RegExp(`${name}:\\s*'([^']+)'`))[1];
const productsResponse = await fetch(setting('supabaseUrl') + '/rest/v1/products?select=id,slug,name,price,currency&is_active=eq.true&order=id.asc', { headers: { apikey: setting('supabasePublishableKey') } });
assert(productsResponse.ok);
const products = await productsResponse.json();
assert.equal(locations.length, products.length + publicPages.length);
for (const product of products) {
  assert(locations.includes(`${ORIGIN}/product/${product.id}/`));
  const schema = staticProducts.get(`/product/${product.id}/`);
  assert.equal(schema.name, product.name);
  assert.equal(schema.offers.price, Number(product.price));
  assert.equal(schema.offers.priceCurrency, product.currency);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  for (const path of publicPages) {
    await page.goto(base + path, { waitUntil: 'domcontentloaded' });
    await page.locator('app-root router-outlet + *').first().waitFor({ state: 'attached' });
    await page.waitForFunction(() => document.querySelector('meta[name="robots"]')?.content === 'index, follow');
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), ORIGIN + path);
    assert.equal(await page.title(), metadata(path).title);
  }
  for (const path of ['/login', '/signup', '/cart', '/checkout', '/forgot-password', '/reset-password', '/auth/callback?error=access_denied']) {
    await page.goto(base + path, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('meta[name="robots"]')?.content === 'noindex, nofollow');
    assert.equal(await page.locator('link[rel="canonical"]').count(), 0);
  }
  await page.goto(base + '/login', { waitUntil: 'domcontentloaded' });
  await page.locator('a[href="/shop"]').first().click();
  await page.waitForURL(url => url.pathname.replace(/\/+$/, '') === '/shop');
  await page.waitForFunction(() => document.querySelector('meta[name="robots"]')?.content === 'index, follow');
  for (const value of [String(products[0].id), products[0].slug, ...products.slice(1, 2).map(product => String(product.id))]) {
    await page.goto(base + '/product/' + value + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('meta[name="robots"]')?.content === 'index, follow');
    const expected = products.find(product => String(product.id) === value || product.slug === value);
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), `${ORIGIN}/product/${expected.id}/`);
    const productSchema = JSON.parse(await page.locator('script[data-zeleon-seo]').textContent());
    assert.equal(await page.title(), productSchema.name + ' | ZELEON');
    assert.equal(await page.locator('meta[property="og:title"]').getAttribute('content'), await page.title());
    assert.equal(await page.locator('script[data-zeleon-seo]').count(), 1);
  }
  await page.goto(base + '/product/zeleon-no-such-public-product/', { waitUntil: 'domcontentloaded' });
  await page.getByText('Product not found', { exact: false }).waitFor();
  assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex, nofollow');
  assert.equal(await page.locator('script[data-zeleon-seo]').count(), 0);
  await page.goto(base + '/shop/', { waitUntil: 'domcontentloaded' });
  await page.locator('.product-name-link').first().click();
  await page.waitForURL(url => url.pathname.startsWith('/product/'));
  await page.waitForFunction(() => document.querySelector('meta[name="robots"]')?.content === 'index, follow');
  console.log(JSON.stringify({ sitemapHttp: 200, robotsHttp: 200, urls: locations.length, products: products.length, allPublicPagesHttp200: true, googleVerificationPreserved: true, initialHtmlMetadata: true, jsonLd: true, privateInitialNoindex: true, privateNoindex: true, navigationUpdates: true, idAndSlugCanonical: true, missingProductNoindex: true, productLinks: true }, null, 2));
} finally { await browser.close(); }
