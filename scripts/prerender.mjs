import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { JSDOM } from 'jsdom';
import { readEntries, productAliases } from './sitemap.mjs';
import { metadata } from '../src/app/seo-metadata.mjs';
import { serveStatic } from './static-server.mjs';
import { faviconFor, checkFavicon, checkSnippetDirectives } from './search-appearance.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export const browserOptions = () => ({ headless: true, ...(process.env.PRERENDER_BROWSER_CHANNEL ? { channel: process.env.PRERENDER_BROWSER_CHANNEL } : {}) });
const selectors = { '/': 'app-home', '/shop/': 'app-shop', '/our-story/': 'app-our-story', '/contact/': 'app-contact' };

export function checkRenderedHtml(html, path, catalog, verification) {
  const dom = new JSDOM(html);
  try {
    const document = dom.window.document;
    const category = path.startsWith('/shop/') ? path.split('/')[2] : null;
    const listing = category ? catalog.filter(item => item.category === category) : catalog;
    const expected = metadata(path);
    const page = document.querySelector(`app-root main ${selectors[path] ?? 'app-shop'}`);
    assert(page && page.textContent.trim().length > 100, `Missing rendered Angular content: ${path}`);
    assert(!document.querySelector('noscript[data-zeleon-seo-content]'), 'A fallback is not prerendering');
    assert.equal(document.querySelectorAll('title').length, 1);
    assert.equal(document.title, expected.title);
    assert.equal(document.querySelectorAll('link[rel="canonical"]').length, 1);
    assert.equal(document.querySelector('link[rel="canonical"]').href, expected.canonical);
    assert.equal(document.querySelector('meta[name="robots"]').content, 'index, follow');
    assert.equal(document.querySelector('meta[name="description"]').content, expected.description);
    faviconFor(document);
    for (const tag of document.querySelectorAll('meta[name="robots"], meta[name="googlebot"]')) {
      checkSnippetDirectives(tag.content);
    }
    assert.equal(document.querySelector('meta[property="og:url"]').content, expected.canonical);
    assert.equal(document.querySelector('meta[property="og:title"]').content, expected.title);
    assert.equal(document.querySelector('meta[property="og:image"]').content, expected.image);
    assert.equal(document.querySelector('meta[name="twitter:title"]').content, expected.title);
    assert.equal(document.querySelector('meta[name="google-site-verification"]').content, verification);
    const schemas = [...document.querySelectorAll('script[type="application/ld+json"]')].map(script => JSON.parse(script.textContent));
    assert.deepEqual(schemas, expected.schemas, `Schema differs from the public catalog: ${path}`);
    assert(!document.querySelector('.profile-link, .manager-launcher, button[aria-label="Log out"]'), 'Authenticated UI was captured');
    assert(document.querySelector('a[aria-label="Sign in"]'), 'Anonymous header was not rendered');
    assert(!document.querySelector('app-root [role="alert"]'), `Rendered error state: ${path}`);
    if (path === '/' || path.startsWith('/shop/')) {
      const links = page.querySelectorAll(path === '/' ? '#featured-products a.card:not([data-loop-clone])' : '.product-name-link');
      assert.equal(links.length, path === '/' ? listing.length : Math.min(listing.length, 12), 'Incomplete category/catalog rendering');
      if (category) {
        assert.equal(page.querySelector('h1')?.textContent.trim(), { classic: 'Classic', 'boost-blends': 'Boost Blends', 'zero-sugar': 'Zero Sugar' }[category]);
        assert(page.querySelector('.category-description')?.textContent.trim(), 'Missing category content');
      }
      for (const link of links) assert(listing.some(item => link.getAttribute('href') === `/product/${item.id}`), 'Unknown product link');
    } else {
      assert(page.querySelector('h1')?.textContent.trim(), `Missing page heading: ${path}`);
      if (path === '/contact/') assert(page.querySelector('form'), 'Contact form was not rendered');
    }
    return { path, bytes: Buffer.byteLength(html), renderedComponent: page.localName };
  } finally { dom.window.close(); }
}

export async function validatePrerender(directory = join(root, 'dist/zeleon/browser')) {
  const entries = await readEntries(join(directory, 'sitemap.xml'));
  const catalog = JSON.parse(await readFile(join(root, 'tmp/seo-catalog.json'), 'utf8'));
  const source = new JSDOM(await readFile(join(root, 'src/index.html'), 'utf8'));
  const verification = source.window.document.querySelector('meta[name="google-site-verification"]').content;
  const favicon = faviconFor(source.window.document);
  const icon = checkFavicon(await readFile(join(directory, decodeURIComponent(favicon.url.pathname).slice(1))), favicon.sizes);
  source.window.close();
  const results = [];
  for (const { loc } of entries) {
    const path = new URL(loc).pathname;
    results.push(checkRenderedHtml(await readFile(join(directory, path.slice(1), 'index.html'), 'utf8'), path, catalog, verification));
  }
  for (const product of catalog) {
    const dom = new JSDOM(await readFile(join(directory, 'product', String(product.id), 'index.html'), 'utf8'));
    assert.equal(dom.window.document.querySelector('meta[name="robots"]').content, 'noindex, follow');
    assert.equal(dom.window.document.querySelector('app-root')?.innerHTML, '', 'Product must not contain a prerendered snapshot');
    dom.window.close();
  }
  const aliases = productAliases(catalog);
  for (const alias of aliases) {
    const dom = new JSDOM(await readFile(join(directory, alias.path.slice(1), 'index.html'), 'utf8'));
    const document = dom.window.document;
    assert.equal(document.querySelector('meta[name="robots"]').content, 'noindex, follow');
    assert.equal(document.querySelector('link[rel="canonical"]').href, alias.canonical);
    assert.equal(document.querySelector('meta[http-equiv="refresh"]').content, `0;url=${new URL(alias.canonical).pathname}`);
    assert(!document.querySelector('script[src]'), 'Redirect must not race Angular bootstrap');
    dom.window.close();
  }
  for (const path of ['404.html', ...['login', 'signup', 'profile', 'cart', 'checkout', 'forgot-password', 'reset-password', 'auth/callback', 'staff-auth', 'manager', 'admin', 'support'].map(path => path + '/index.html')]) {
    const dom = new JSDOM(await readFile(join(directory, path), 'utf8'));
    const document = dom.window.document;
    assert.equal(document.querySelector('app-root')?.innerHTML, '', `Private route contains a snapshot: ${path}`);
    assert.equal(document.querySelector('meta[name="robots"]').content, 'noindex, nofollow');
    assert.equal(document.querySelectorAll('link[rel="canonical"], script[data-zeleon-seo]').length, 0);
    dom.window.close();
  }
  console.log(JSON.stringify({ prerendered: results, favicon: { path: favicon.url.pathname, ...icon }, slugRedirects: aliases.length, privateShells: 'empty/noindex' }));
}

export async function prerender(directory = join(root, 'dist/zeleon/browser')) {
  const entries = await readEntries(join(directory, 'sitemap.xml'));
  const rows = JSON.parse(await readFile(join(root, 'tmp/prerender-products.json'), 'utf8'));
  const offers = JSON.parse(await readFile(join(root, 'tmp/prerender-offers.json'), 'utf8'));
  const categories = JSON.parse(await readFile(join(root, 'tmp/prerender-categories.json'), 'utf8'));
  assert(rows.every(row => row.is_active === true), 'Only active anonymous product rows may be rendered');
  const config = await readFile(join(root, 'src/environments/environment.ts'), 'utf8');
  const apiOrigin = new URL(config.match(/supabaseUrl:\s*'([^']+)'/)[1]).origin;
  const server = await serveStatic(directory);
  let browser;
  try {
    browser = await chromium.launch(browserOptions());
    for (const { loc } of entries) {
      const path = new URL(loc).pathname;
      // No saved profile, cookies, sessions or staff credentials; isolate every page.
      const context = await browser.newContext({ serviceWorkers: 'block', reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 } });
      const violations = [];
      await context.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (request.method() === 'GET' && url.origin === server.origin) return route.continue();
        if (request.method() === 'GET' && url.origin === apiOrigin && url.pathname === '/rest/v1/products' && url.searchParams.get('is_active') === 'eq.true') {
          // Replay exactly the anonymous build snapshot, so body, metadata and
          // sitemap cannot disagree if a product changes mid-build. Never call auth.
          let products = rows;
          products = [...products].sort((a, b) => a.created_at.localeCompare(b.created_at) || String(a.id).localeCompare(String(b.id), 'en', { numeric: true }));
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(products), headers: { 'Access-Control-Allow-Origin': server.origin } });
        }
        if (request.method() === 'GET' && url.origin === apiOrigin && ['/rest/v1/catalog_product_offers', '/rest/v1/categories'].includes(url.pathname)) {
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(url.pathname.endsWith('/categories') ? categories : offers), headers: { 'Access-Control-Allow-Origin': server.origin } });
        }
        // The newsletter CAPTCHA is intentionally unavailable in the anonymous
        // static snapshot; loading it is neither needed nor appropriate here.
        if (request.method() === 'GET' && url.origin === 'https://challenges.cloudflare.com' && url.pathname === '/turnstile/v0/api.js') return route.abort();
        if (request.method() === 'GET' && ['image', 'font', 'stylesheet'].includes(request.resourceType()) && url.protocol === 'https:') return route.abort();
        // Fail closed on API writes, auth/private requests, external scripts, etc.
        violations.push(`${request.method()} ${url.origin}${url.pathname}`);
        return route.abort();
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto(server.origin + path, { waitUntil: 'domcontentloaded' });
        const selector = selectors[path] ?? 'app-shop';
        await page.locator(`app-root main ${selector}`).waitFor();
        await page.waitForFunction(() => document.querySelector('a[aria-label="Sign in"]') && document.querySelector('meta[name="robots"]')?.content === 'index, follow');
        if (path.startsWith('/shop/')) await page.locator('#shop-products[aria-busy="false"]').waitFor();
        if (path === '/') await page.waitForFunction(count => document.querySelectorAll('#featured-products a.card:not([data-loop-clone])').length === count &&
          ![...document.querySelectorAll('app-home [role="status"], app-home [role="alert"]')].some(element => element.textContent?.trim()), rows.length);
        await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
        assert.deepEqual(violations, [], `Non-public request during prerender: ${path}`);
        assert.deepEqual(errors, [], `Angular error during prerender: ${path}`);
        const storage = await context.storageState();
        assert.equal(storage.cookies.length, 0, 'Prerender acquired cookies');
        assert(storage.origins.every(origin => origin.localStorage.every(entry => !/auth-token/.test(entry.name))), 'Prerender acquired an auth session');
        await page.evaluate(() => {
          // These markers exist only on captured children. Angular replaces them
          // during its normal bootstrap, restoring all original animation behavior.
          document.querySelectorAll('app-root > *').forEach(element => element.setAttribute('data-zeleon-prerender', ''));
          const style = document.createElement('style');
          style.textContent = '[data-zeleon-prerender] [data-aos] { opacity: 1 !important; transform: none !important; transition: none !important; }';
          document.head.appendChild(style);
        });
        await writeFile(join(directory, path.slice(1), 'index.html'), await page.content(), 'utf8');
      } finally { await context.close(); }
    }
  } finally { await browser?.close(); await server.close(); }
  await validatePrerender(directory);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv[2] === 'validate') await validatePrerender();
  else await prerender();
}
