import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { ORIGIN, publicPages, NAMESPACE } from './sitemap.mjs';

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
}
const config = await readFile(new URL('../src/environments/environment.ts', import.meta.url), 'utf8');
const setting = name => config.match(new RegExp(`${name}:\\s*'([^']+)'`))[1];
const productsResponse = await fetch(setting('supabaseUrl') + '/rest/v1/products?select=id,slug&is_active=eq.true&order=id.asc', { headers: { apikey: setting('supabasePublishableKey') } });
assert(productsResponse.ok);
const products = await productsResponse.json();
assert.equal(locations.length, products.length + publicPages.length);
for (const product of products) assert(locations.includes(`${ORIGIN}/product/${product.id}/`));

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  for (const path of publicPages) {
    await page.goto(base + path, { waitUntil: 'domcontentloaded' });
    await page.locator('app-root router-outlet + *').first().waitFor({ state: 'attached' });
    await page.waitForFunction(() => document.querySelector('meta[name="robots"]')?.content === 'index, follow');
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), ORIGIN + path);
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
  for (const value of [String(products[0].id), products[0].slug]) {
    await page.goto(base + '/product/' + value + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('meta[name="robots"]')?.content === 'index, follow');
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), `${ORIGIN}/product/${products[0].id}/`);
  }
  await page.goto(base + '/product/zeleon-no-such-public-product/', { waitUntil: 'domcontentloaded' });
  await page.getByText('Product not found', { exact: false }).waitFor();
  assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex, nofollow');
  console.log(JSON.stringify({ sitemapHttp: 200, robotsHttp: 200, urls: locations.length, products: products.length, allPublicPagesHttp200: true, googleVerificationPreserved: true, privateNoindex: true, navigationUpdates: true, idAndSlugCanonical: true, missingProductNoindex: true }, null, 2));
} finally { await browser.close(); }
