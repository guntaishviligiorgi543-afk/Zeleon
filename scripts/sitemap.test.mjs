import test from 'node:test';
import assert from 'node:assert/strict';
import { entriesFor, escapeXml, fetchProducts, renderSitemap, readEntries, withHead, ORIGIN } from './sitemap.mjs';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { metadata, serializeJson, safeImage, BRAND_IMAGE } from '../src/app/seo-metadata.mjs';

test('metadata uses actual product data, currency and omits unsupported claims', () => {
  const item = { id: 7, name: 'Citrus & Lime', price: 9.75, currency: 'GEL', categoryName: 'Classic', image: 'https://example.com/can.png' };
  const page = metadata('/product/citrus/', item);
  assert.equal(page.title, 'Citrus & Lime | ZELEON');
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
  const pages = ['/', '/shop/', '/our-story/', '/contact/'].map(path => metadata(path));
  assert.equal(new Set(pages.map(page => page.title)).size, 4);
  assert.equal(new Set(pages.map(page => page.description)).size, 4);
  assert.deepEqual(pages[0].schemas.map(schema => schema['@type']), ['Organization', 'WebSite']);
  assert(pages.slice(1).every(page => page.schemas.length === 0));
});

test('includes only real public paths and unique published product IDs', () => {
  const entries = entriesFor([
    { id: 1, is_active: true, updated_at: '2026-11-01T12:00:00Z' },
    { id: 1, is_active: true, updated_at: '2026-11-02T12:00:00Z' },
    { id: 2, is_active: false }, { id: 3 },
  ]);
  assert.equal(entries.length, 5);
  assert.equal(entries.at(-1).loc, ORIGIN + '/product/1/');
  assert.equal(entries.at(-1).lastmod, '2026-11-02T12:00:00.000Z');
  assert(!entries.some(entry => /login|signup|profile|cart|checkout|manager|admin|support/.test(new URL(entry.loc).pathname)));
  assert.throws(() => entriesFor([{ id: '../admin', is_active: true }]));
});

test('regeneration reflects creation, unpublishing and deletion without changing products', () => {
  const before = [{ id: 1, is_active: true }, { id: 2, is_active: true }];
  const snapshot = JSON.stringify(before);
  assert.equal(entriesFor(before).length, 6);
  assert.equal(JSON.stringify(before), snapshot);
  const after = [{ id: 2, is_active: false }, { id: 3, is_active: true }];
  const locations = entriesFor(after).map(entry => entry.loc);
  assert(locations.includes(ORIGIN + '/product/3/'));
  assert(!locations.includes(ORIGIN + '/product/1/'));
  assert(!locations.includes(ORIGIN + '/product/2/'));
});

test('escapes XML and omits absent, invalid and future modification dates', async () => {
  assert.equal(escapeXml(`&<>"'`), '&amp;&lt;&gt;&quot;&apos;');
  const entries = entriesFor([{ id: 1, is_active: true, updated_at: 'invalid' }, { id: 2, is_active: true, updated_at: '2999-01-01T00:00:00Z' }]);
  assert(entries.every(entry => !entry.lastmod));
  const directory = await mkdtemp(join(tmpdir(), 'zeleon-sitemap-'));
  try {
    const file = join(directory, 'sitemap.xml');
    await writeFile(file, renderSitemap(entries));
    assert.equal((await readEntries(file)).length, 6);
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
  assert.match(workflow, /cp dist\/zeleon\/browser\/index.html dist\/zeleon\/browser\/404.html/);
});
