import test from 'node:test';
import assert from 'node:assert/strict';
import { entriesFor, escapeXml, fetchProducts, renderSitemap, readEntries, withHead, ORIGIN, publicPages, productAliases, redirectPage } from './sitemap.mjs';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { metadata, serializeJson, safeImage, BRAND_IMAGE } from '../src/app/seo-metadata.mjs';

test('metadata uses actual product data, currency and omits unsupported claims', () => {
  const item = { id: 7, name: 'Citrus & Lime', price: 9.75, currency: 'GEL', categoryName: 'Classic', image: 'https://example.com/can.png' };
  const page = metadata('/product/citrus/', item);
  assert.equal(page.title, 'Citrus & Lime | ZELEON');
  assert.equal(page.robots, 'noindex, follow');
  assert.equal(metadata('/product/missing/').robots, 'noindex, follow');
  assert.equal(page.canonical, ORIGIN + '/product/7/');
  assert(page.description.includes(item.name));
  const product = page.schemas[0];
  assert.equal(product.offers.price, 9.75);
  assert.equal(product.offers.priceCurrency, 'GEL');
  for (const name of ['description', 'sku', 'aggregateRating', 'review']) assert(!Object.hasOwn(product, name));
  assert(!Object.hasOwn(product.offers, 'availability'));
  assert(!Object.hasOwn(metadata('/product/7/', { ...item, price: NaN }).schemas[0], 'offers'));
  assert.equal(metadata('/product/missing/').schemas.length, 0);
  assert.equal(metadata('/login/').canonical, null);
});

test('static product social metadata is parseable, injection safe and private heads contain no stale data', async () => {
  const { JSDOM } = await import('jsdom');
  const item = { id: 7, name: '</script><script>alert("x")</script>', price: 1, currency: 'EUR', image: 'javascript:alert(1)' };
  const html = withHead('<html><head><title>Old</title></head><body></body></html>', { loc: ORIGIN + '/product/7/' }, item);
  const document = new JSDOM(html).window.document;
  assert.equal(document.title, item.name + ' | ZELEON');
  assert.equal(document.querySelector('meta[name="robots"]').content, 'noindex, follow');
  assert.equal(document.querySelectorAll('script').length, 1);
  assert.equal(JSON.parse(document.querySelector('script').textContent).name, item.name);
  assert.equal(document.querySelector('meta[property="og:image"]').content, BRAND_IMAGE);
  const privateDocument = new JSDOM(withHead(html, { index: false })).window.document;
  assert.equal(privateDocument.querySelectorAll('script,link[rel="canonical"],meta[property^="og:"]').length, 0);
  assert.equal(privateDocument.querySelector('meta[name="robots"]').content, 'noindex, nofollow');
  assert.equal(safeImage('http://unsafe.example/image'), BRAND_IMAGE);
  assert(!serializeJson({ name: item.name }).includes('<'));
});

test('public pages have unique titles/descriptions and only home carries organization/site schema', () => {
  const pages = publicPages.map(path => metadata(path));
  assert.equal(new Set(pages.map(page => page.title)).size, 7);
  assert.equal(new Set(pages.map(page => page.description)).size, 7);
  assert.deepEqual(pages[0].schemas.map(schema => schema['@type']), ['Organization', 'WebSite']);
  assert(pages.slice(1).every(page => page.schemas.length === 0));
  publicPages.forEach((path, index) => {
    assert.equal(pages[index].robots, 'index, follow');
    assert.equal(pages[index].canonical, ORIGIN + path);
  });
});

test('sitemap includes exactly seven approved pages regardless of catalog changes', () => {
  const products = [{ id: 1, is_active: true }, { id: 2, is_active: false }];
  const before = JSON.stringify(products);
  const expected = publicPages.map(path => ({ loc: ORIGIN + path }));
  assert.deepEqual(entriesFor(products), expected);
  assert.deepEqual(entriesFor([]), expected);
  assert.deepEqual(entriesFor([{ id: 3, is_active: true }]), expected);
  assert.equal(JSON.stringify(products), before);
  assert.equal(expected.length, 7);
  assert(!expected.some(entry => /product|login|signup|profile|cart|checkout|manager|admin|support/.test(new URL(entry.loc).pathname)));
});

test('escapes XML and omits absent, invalid and future modification dates', async () => {
  assert.equal(escapeXml(`&<>"'`), '&amp;&lt;&gt;&quot;&apos;');
  const entries = entriesFor([{ id: 1, is_active: true, updated_at: 'invalid' }, { id: 2, is_active: true, updated_at: '2999-01-01T00:00:00Z' }]);
  assert(entries.every(entry => !entry.lastmod));
  const directory = await mkdtemp(join(tmpdir(), 'zeleon-sitemap-'));
  try {
    const file = join(directory, 'sitemap.xml');
    await writeFile(file, renderSitemap(entries));
    assert.equal((await readEntries(file)).length, 7);
    await writeFile(file, renderSitemap([...entries, { loc: ORIGIN + '/product/1/' }]));
    await assert.rejects(readEntries(file), /Non-public route/);
    await writeFile(file, '<urlset>broken');
    await assert.rejects(readEntries(file));
  } finally {
    assert(directory.startsWith(join(tmpdir(), 'zeleon-sitemap-')));
    await rm(directory, { recursive: true });
  }
});

test('paginates the anonymous API and fails closed rather than replacing a good sitemap', async () => {
  const calls = [];
  const products = await fetchProducts('https://example.supabase.co', 'sb_publishable_test', async (url, options) => {
    calls.push({ url: new URL(url), options });
    const id = calls.length;
    return new Response(JSON.stringify(id <= 2 ? [{ id, is_active: true }] : []));
  }, 1);
  assert.equal(products.length, 2);
  assert.deepEqual(calls.map(call => call.url.searchParams.get('offset')), ['0', '1', '2']);
  assert(calls.every(call => call.url.searchParams.get('is_active') === 'eq.true'));
  assert(calls.every(call => Object.keys(call.options.headers).includes('apikey') && !call.options.headers.Authorization));
  await assert.rejects(fetchProducts('https://example.supabase.co', 'sb_secret_forbidden'));
  await assert.rejects(fetchProducts('https://example.supabase.co', 'sb_publishable_test', async () => new Response('{}', { status: 403 })));
});

test('static public shells preserve app scripts, base and Google verification with one canonical', () => {
  const html = '<head><base href="/"><meta name="google-site-verification" content="keep"><meta name="robots" content="noindex"><link rel="canonical" href="wrong"></head><body><app-root></app-root><script src="main.js"></script></body>';
  const result = withHead(html, { loc: ORIGIN + '/shop/' });
  assert.equal((result.match(/rel="canonical"/g) ?? []).length, 1);
  assert(result.includes('content="index, follow"'));
  assert(result.includes('<base href="/">'));
  assert(result.includes('content="keep"'));
  assert(result.includes('src="main.js"'));
});

test('handles an API row cap smaller than the requested page size', async () => {
  const rows = await fetchProducts('https://example.supabase.co', 'sb_publishable_test', async url => {
    const offset = Number(url.searchParams.get('offset'));
    return new Response(JSON.stringify([{ id: offset + 1, is_active: true }]), { headers: { 'Content-Range': `${offset}-${offset}/3` } });
  });
  assert.deepEqual(rows.map(row => row.id), [1, 2, 3]);
});

test('deployment runs generation hooks on pushes, manual dispatch and scheduled refresh', async () => {
  const workflow = await readFile(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  assert.match(workflow, /branches:\s*- master/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /cron: '17 \*\/6 \* \* \*'/);
  assert.match(workflow, /npm run build -- --configuration production --base-href \//);
  assert(!workflow.includes('cp dist/zeleon/browser/index.html'), 'Never copy a public snapshot into the private fallback');
  assert.match(workflow, /npm run test:seo:local/);
  assert.match(workflow, /playwright install --with-deps chromium/);
});

test('slug compatibility pages preserve ID canonicals and cannot create duplicate indexable pages', async () => {
  const { JSDOM } = await import('jsdom');
  const product = { id: 1, slug: 'paradise-boost', name: 'Paradise & Boost', price: 15, currency: 'USD' };
  const aliases = productAliases([product]);
  assert.equal(aliases[0].path, '/product/paradise-boost/');
  const html = redirectPage('<html><head><meta name="google-site-verification" content="keep"></head><body><app-root></app-root><script src="main.js" type="module"></script></body></html>', aliases[0]);
  const dom = new JSDOM(html);
  const document = dom.window.document;
  assert.equal(document.querySelector('link[rel="canonical"]').href, ORIGIN + '/product/1/');
  assert.equal(document.querySelector('meta[name="robots"]').content, 'noindex, follow');
  assert.equal(document.querySelector('meta[http-equiv="refresh"]').content, '0;url=/product/1/');
  assert.equal(document.querySelector('meta[name="google-site-verification"]').content, 'keep');
  assert.equal(document.querySelector('a').textContent, 'Continue to Paradise & Boost');
  assert.equal(document.querySelectorAll('script[src]').length, 0);
  assert(html.includes('location.search + location.hash'));
  assert.equal(JSON.parse(document.querySelector('script[data-zeleon-seo]').textContent).offers.price, 15);
  dom.window.close();
});

test('slug generation rejects traversal, ID collisions and duplicate aliases without changing data', () => {
  for (const slug of ['../login', 'a/b', 'a\\b', '%2e%2e', 'a?b', 'a#b', 'a;b', '2', 'CON', 'nul', '00000000-0000-0000-0000-000000000000']) {
    assert.throws(() => productAliases([{ id: 1, slug }]));
  }
  assert.throws(() => productAliases([{ id: 1, slug: 'same' }, { id: 2, slug: 'same' }]));
  assert.deepEqual(productAliases([{ id: 1, slug: null }, { id: 2, slug: '2' }]), []);
  const catalog = [{ id: 1, slug: 'real-slug' }];
  const before = JSON.stringify(catalog);
  productAliases(catalog);
  assert.equal(JSON.stringify(catalog), before);
  assert(!entriesFor([{ ...catalog[0], is_active: true }]).some(entry => entry.loc.includes('real-slug')));
});
