import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { ORIGIN, publicPages, NAMESPACE } from './sitemap.mjs';
import { metadata } from '../src/app/seo-metadata.mjs';
import { browserOptions } from './prerender.mjs';
import { faviconFor, checkFavicon, checkSnippetDirectives } from './search-appearance.mjs';

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
const faviconUrls = new Map();

console.log('Checking initial HTML for all public sitemap URLs...');
assert.equal(new Set(locations).size, locations.length);
assert.deepEqual([...locations].sort(), publicPages.map(path => ORIGIN + path).sort());
assert(!locations.some(loc => new URL(loc).pathname.startsWith('/product/')));
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
  checkSnippetDirectives(response.headers.get('x-robots-tag') ?? '');
  for (const tag of head.querySelectorAll('meta[name="robots"], meta[name="googlebot"]')) checkSnippetDirectives(tag.content);
  const favicon = faviconFor(head);
  faviconUrls.set(favicon.url.href, favicon);
  assert.equal(head.querySelectorAll('title').length, 1);
  assert.notEqual(head.title, 'Zeleon');
  for (const selector of ['meta[name="description"]', 'meta[property="og:title"]', 'meta[property="og:description"]', 'meta[property="og:url"]', 'meta[property="og:image"]', 'meta[name="twitter:card"]']) assert.equal(head.querySelectorAll(selector).length, 1, `${selector}: ${loc}`);
  assert(head.querySelector('meta[property="og:image"]').content.startsWith('https://'));
  socialImages.add(head.querySelector('meta[property="og:image"]').content);
  assert(!head.querySelector('noscript[data-zeleon-seo-content]'), 'A noscript fallback is not prerendering');
  assert(head.querySelector('app-root main router-outlet + *')?.textContent.trim().length > 100, `Missing prerendered page: ${loc}`);

}
assert.equal(faviconUrls.size, 1, 'Public pages must share the stable site favicon');
for (const { url, sizes } of faviconUrls.values()) {
  const response = await fetch(base + url.pathname, { signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200, 'Favicon unavailable');
  assert.match(response.headers.get('content-type'), /^image\/(?:png|svg\+xml)(?:;|$)/i);
  checkSnippetDirectives(response.headers.get('x-robots-tag') ?? '');
  console.log(JSON.stringify({ favicon: url.pathname, ...checkFavicon(Buffer.from(await response.arrayBuffer()), sizes) }));
}
console.log('Checking public image URLs...');
for (const url of socialImages) {
  const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(30_000) });
  assert(response.ok, `Social image unavailable: ${url}`);
  assert.match(response.headers.get('content-type'), /^image\//);
}
console.log('Checking private shells and current product aliases...');
for (const path of ['/login/', '/signup/', '/cart/', '/checkout/', '/forgot-password/', '/reset-password/', '/auth/callback/', '/staff-auth/', '/profile/', '/manager/', '/admin/', '/support/', '/unknown-seo-route/']) {
  const response = await fetch(base + path);
  const head = new JSDOM(await response.text()).window.document;
  assert.equal(head.querySelector('meta[name="robots"]').content, 'noindex, nofollow', path);
  assert.equal(head.querySelectorAll('link[rel="canonical"],script[data-zeleon-seo]').length, 0, path);
  assert.equal(head.querySelector('app-root')?.innerHTML, '', `Private route contains public snapshot: ${path}`);
}
const config = await readFile(new URL('../src/environments/environment.ts', import.meta.url), 'utf8');
const setting = name => config.match(new RegExp(`${name}:\\s*'([^']+)'`))[1];
const productsResponse = await fetch(setting('supabaseUrl') + '/rest/v1/products?select=id,slug,name,price,currency,category:categories(slug)&is_active=eq.true&order=id.asc', { headers: { apikey: setting('supabasePublishableKey') } });
assert(productsResponse.ok);
const products = await productsResponse.json();
assert.equal(locations.length, publicPages.length);
for (const product of products) {
  assert(!locations.includes(`${ORIGIN}/product/${product.id}/`));
  const response = await fetch(base + `/product/${product.id}/`);
  assert.equal(response.status, 200);
  const head = new JSDOM(await response.text()).window.document;
  assert.equal(head.querySelector('meta[name="robots"]').content, 'noindex, follow');
  assert.equal(head.querySelector('app-root')?.innerHTML, '', 'Products must not be prerendered');
  if (product.slug && product.slug !== String(product.id)) {
    const response = await fetch(base + '/product/' + encodeURIComponent(product.slug) + '/', { redirect: 'manual' });
    assert.equal(response.status, 200, `Slug returned HTTP ${response.status}: ${product.slug}`);
    const head = new JSDOM(await response.text()).window.document;
    assert.equal(head.querySelector('meta[name="robots"]').content, 'noindex, follow');
    assert.equal(head.querySelector('link[rel="canonical"]').href, `${ORIGIN}/product/${product.id}/`);
    assert.equal(head.querySelector('meta[http-equiv="refresh"]').content, `0;url=/product/${product.id}/`);
    assert(!locations.includes(`${ORIGIN}/product/${product.slug}/`));
  }
}

for (const path of ['/product/zeleon-no-such-public-product/', '/product/999999999/', '/unknown-seo-route/']) {
  const response = await fetch(base + path, { redirect: 'manual' });
  assert.equal(response.status, 404, `Missing route must return HTTP 404: ${path}`);
}

const browser = await chromium.launch(browserOptions());
try {
  console.log('Checking Angular bootstrap and navigation...');
  const page = await browser.newPage();
  page.setDefaultTimeout(30_000);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const booted = async () => page.waitForFunction(() => document.querySelector('app-root main:not([data-zeleon-prerender]) router-outlet + *'));
  for (const path of publicPages) {
    console.log(`Browser: ${path}`);
    await page.goto(base + path, { waitUntil: 'domcontentloaded' });
    await booted();
    await page.waitForFunction(() => document.querySelector('meta[name="robots"]')?.content === 'index, follow');
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), ORIGIN + path);
    assert.equal(await page.title(), metadata(path).title);
    assert.equal(await page.locator('[data-zeleon-prerender]').count(), 0, 'Snapshot must be replaced by the interactive app');
    if (path === '/') {
      const icon = await page.evaluate(async () => {
        const image = new Image();
        image.src = document.querySelector('link[rel~="icon"]').href;
        await image.decode();
        return { width: image.naturalWidth, height: image.naturalHeight };
      });
      assert(icon.width >= 8 && icon.height >= 8, 'Browser could not decode the favicon');
    }
  }
  for (const path of ['/login', '/signup', '/cart', '/checkout', '/forgot-password', '/reset-password', '/auth/callback?error=access_denied']) {
    await page.goto(base + path, { waitUntil: 'domcontentloaded' });
    if (path === '/cart' || path === '/checkout') {
      await page.waitForURL(url => url.pathname.replace(/\/+$/, '') === '/login' &&
        url.searchParams.get('returnUrl')?.replace(/\/+$/, '') === path, { waitUntil: 'domcontentloaded' });
    }
    await page.waitForFunction(() => document.querySelector('meta[name="robots"]')?.content === 'noindex, nofollow');
    assert.equal(await page.locator('link[rel="canonical"]').count(), 0);
  }
  await page.goto(base + '/login', { waitUntil: 'domcontentloaded' });
  await page.locator('a[href="/shop"]').first().click();
  await page.waitForURL(url => url.pathname.replace(/\/+$/, '') === '/shop', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('meta[name="robots"]')?.content === 'index, follow');
  for (const value of products.length ? [String(products[0].id), products[0].slug, ...products.slice(1, 2).map(product => String(product.id))].filter(Boolean) : []) {
    await page.goto(base + '/product/' + value + '/', { waitUntil: 'domcontentloaded' });
    await booted();
    await page.waitForFunction(() => document.querySelector('meta[name="robots"]')?.content === 'noindex, follow');
    await page.locator('.product-page[aria-busy="false"] .product-info h1').waitFor();
    const expected = products.find(product => String(product.id) === value || product.slug === value);
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), `${ORIGIN}/product/${expected.id}/`);
    const productSchema = JSON.parse(await page.locator('script[data-zeleon-seo]').textContent());
    assert.equal(await page.title(), productSchema.name + ' | ZELEON');
    assert.equal(await page.locator('meta[property="og:title"]').getAttribute('content'), await page.title());
    assert.equal(await page.locator('script[data-zeleon-seo]').count(), 1);
  }
  if (products.length && products[0].slug && products[0].slug !== String(products[0].id)) {
    await page.goto(base + '/product/' + products[0].slug + '/?campaign=seo-check#details', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(url => url.pathname.replace(/\/+$/, '') === `/product/${products[0].id}` && url.search === '?campaign=seo-check' && url.hash === '#details', { waitUntil: 'domcontentloaded' });
    await booted();
  }
  await page.goto(base + '/product/zeleon-no-such-public-product/', { waitUntil: 'domcontentloaded' });
  await page.getByText('Product not found', { exact: false }).waitFor();
  assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex, follow');
  assert.equal(await page.locator('script[data-zeleon-seo]').count(), 0);
  await page.goto(base + '/shop/', { waitUntil: 'domcontentloaded' });
  await booted();
  if (products.length) {
    await page.locator('.product-name-link').first().click();
    await page.waitForURL(url => url.pathname.startsWith('/product/'), { waitUntil: 'domcontentloaded' });
    await page.locator('.product-page[aria-busy="false"] .product-info h1').waitFor();
    await page.waitForFunction(() => document.querySelector('meta[name="robots"]')?.content === 'noindex, follow');
    await page.locator('#product-quantity').fill('2');
    await page.locator('.add-cart').click();
    const loginDialog = page.getByRole('dialog', { name: 'Login Required' });
    await loginDialog.waitFor();
    assert.equal((await page.locator('.add-cart').textContent()).trim(), 'Add to Cart');
    assert.equal(await page.locator('.cart-item').count(), 0);
    await loginDialog.getByRole('button', { name: 'Log In', exact: true }).click();
    await page.waitForURL(url => url.pathname.replace(/\/+$/, '') === '/login' && url.searchParams.get('returnUrl') === '/cart', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('meta[name="robots"]')?.content === 'noindex, nofollow');
    const id = String(products[0].id);
    const slug = products[0].slug;
    if (slug && slug !== id) {
      await page.goto(base + `/product/${id}/`, { waitUntil: 'domcontentloaded' });
      await booted();
      // Exercise the existing Angular route directly without a document request.
      await page.evaluate(slug => { history.pushState({}, '', '/product/' + slug); dispatchEvent(new PopStateEvent('popstate')); }, slug);
      await page.waitForFunction(() => document.querySelector('meta[name="robots"]')?.content === 'noindex, follow');
      await page.locator('.product-page[aria-busy="false"] .product-info h1').waitFor();
      assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), `${ORIGIN}/product/${id}/`);
    }
  }
  await page.goto(base + '/shop/', { waitUntil: 'domcontentloaded' });
  await booted();
  for (const category of ['classic', 'boost-blends', 'zero-sugar']) {
    // Dynamic catalog filters use /shop?category=..., while SEO landing pages
    // remain available as canonical /shop/<category>/ routes.
    await page.locator(`.filters a[href="/shop?category=${category}"]`).click();
    await page.waitForURL(url => url.pathname.replace(/\/+$/, '') === '/shop' && url.searchParams.get('category') === category, { waitUntil: 'domcontentloaded' });
    await page.locator('#shop-products[aria-busy="false"]').waitFor();
    assert((await page.locator('.category-description').innerText()).length > 20);

    await page.goto(base + '/shop/' + category + '/', { waitUntil: 'domcontentloaded' });
    await booted();
    await page.locator('#shop-products[aria-busy="false"]').waitFor();
    await page.waitForFunction(() => document.querySelector('meta[name="robots"]')?.content === 'index, follow');
    assert.equal(await page.title(), metadata('/shop/' + category).title);
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), `${ORIGIN}/shop/${category}/`);
    const expected = products.filter(product => product.category?.slug === category);
    assert.equal(await page.locator('.product-name-link').count(), Math.min(expected.length, 12));
    for (const link of await page.locator('.product-name-link').all()) {
      const href = await link.getAttribute('href');
      assert(expected.some(product => `/product/${product.id}` === href));
    }
  }
  await page.locator('.filters a[href="/shop"]').click();
  await page.waitForURL(url => url.pathname.replace(/\/+$/, '') === '/shop', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('meta[name="robots"]')?.content === 'index, follow');
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), ORIGIN + '/shop/');
  for (const path of ['/profile/info', '/manager/users', '/admin/users', '/support/', '/staff-auth/']) {
    await page.goto(base + path, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(url => url.pathname.replace(/\/$/, '') === '/login', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('meta[name="robots"]')?.content === 'noindex, nofollow');
    assert.equal(await page.locator('.manager-launcher').count(), 0);
  }
  console.log('Checking every public page with JavaScript disabled...');
  const noScript = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await noScript.newPage();
  for (const path of publicPages) {
    await staticPage.goto(base + path, { waitUntil: 'domcontentloaded' });
    assert((await staticPage.locator('app-root main').innerText()).trim().length > 100);
    assert.equal(await staticPage.locator('app-root main [role="alert"]').count(), 0);
    if (path === '/our-story/') assert(await staticPage.locator('h1').isVisible());
  }
  await noScript.close();
  assert.deepEqual(pageErrors, [], 'Browser encountered runtime errors');
  console.log(JSON.stringify({ sitemapHttp: 200, robotsHttp: 200, urls: locations.length, products: products.length, allIndexablePagesHttp200: true, googleVerificationPreserved: true, initialHtmlMetadata: true, renderedAngularBody: true, categoryNoJavaScriptContent: true, productsNoindex: true, jsonLd: true, slugHttp200: true, slugRedirect: true, missingHttp404: true, privateInitialNoindex: true, privateNoindex: true, anonymousGuards: true, navigationUpdates: true, idAndSlugCanonical: true, missingProductNoindex: true, productLinks: true, anonymousCartLoginRequired: true }, null, 2));
} finally { await browser.close(); }
