import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname, join } from 'node:path';

export const ORIGIN = 'https://zeleon.store';
export const NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9';
const root = fileURLToPath(new URL('../', import.meta.url));
export const publicPages = JSON.parse(await readFile(new URL('../src/app/seo-pages.json', import.meta.url), 'utf8'));
const idPattern = /^(?:\d+|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i;

export const escapeXml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);

export function entriesFor(products) {
  const entries = new Map(publicPages.map(path => [ORIGIN + path, { loc: ORIGIN + path }]));
  for (const product of products) {
    if (product.is_active !== true) continue;
    const id = String(product.id);
    assert(idPattern.test(id), 'A public product has an unsupported route identifier');
    const loc = `${ORIGIN}/product/${encodeURIComponent(id)}/`;
    const entry = { loc };
    if (typeof product.updated_at === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(product.updated_at)) {
      const stamp = Date.parse(product.updated_at);
      if (Number.isFinite(stamp) && stamp <= Date.now()) entry.lastmod = new Date(stamp).toISOString();
    }
    const previous = entries.get(loc);
    if (!previous || (entry.lastmod ?? '') > (previous.lastmod ?? '')) entries.set(loc, entry);
  }
  assert(entries.size <= 50_000, 'Split the sitemap before exceeding 50,000 URLs');
  return [...entries.values()];
}

export function renderSitemap(entries) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${NAMESPACE}">\n${entries.map(entry => `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>${entry.lastmod ? `\n    <lastmod>${escapeXml(entry.lastmod)}</lastmod>` : ''}\n  </url>`).join('\n')}\n</urlset>\n`;
  assert(Buffer.byteLength(xml, 'utf8') <= 50 * 1024 * 1024, 'Sitemap exceeds 50 MB');
  return xml;
}

export async function fetchProducts(url, key, request = fetch, pageSize = 500) {
  assert(key?.startsWith('sb_publishable_'), 'Only a public Supabase publishable key is permitted');
  const base = new URL(url);
  assert(base.protocol === 'https:', 'Supabase API must use HTTPS');
  const products = [];
  for (let offset = 0; ;) {
    const endpoint = new URL('/rest/v1/products', base);
    endpoint.search = new URLSearchParams({ select: 'id,is_active,updated_at', is_active: 'eq.true', order: 'id.asc', offset: String(offset), limit: String(pageSize) });
    let response;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await request(endpoint, { headers: { apikey: key, Prefer: 'count=exact' }, signal: AbortSignal.timeout(30_000) });
        if (response.ok || (response.status !== 429 && response.status < 500)) break;
      } catch (error) { if (attempt === 2) throw error; }
      if (attempt < 2) await new Promise(done => setTimeout(done, 500 * (attempt + 1)));
    }
    assert(response?.ok, `Public product query failed (${response?.status ?? 'network error'}); sitemap was not replaced`);
    const rows = await response.json();
    assert(Array.isArray(rows), 'Product API returned an invalid result');
    products.push(...rows);
    const total = response.headers.get('content-range')?.match(/\/(\d+)$/)?.[1];
    offset += rows.length;
    if (total !== undefined ? offset >= Number(total) : rows.length < pageSize) return products;
    assert(rows.length > 0, 'Product pagination ended before the reported total');
    assert(products.length < 50_000, 'Catalog requires sitemap index pagination');
  }
}

async function checkRoutes() {
  const source = await readFile(join(root, 'src/app/app.routes.ts'), 'utf8');
  const paths = new Set([...source.matchAll(/path:\s*'([^']*)'/g)].map(match => match[1]));
  for (const path of publicPages) assert(paths.has(path.replace(/^\/+|\/+$/g, '')), `Sitemap path has no Angular route: ${path}`);
  assert(paths.has('product/:id'), 'Product route changed; update sitemap generation');
}

export async function generate() {
  await checkRoutes();
  const config = await readFile(join(root, 'src/environments/environment.ts'), 'utf8');
  const setting = name => config.match(new RegExp(`${name}:\\s*'([^']+)'`))?.[1];
  const products = await fetchProducts(process.env.SUPABASE_URL || setting('supabaseUrl'), process.env.SUPABASE_PUBLISHABLE_KEY || setting('supabasePublishableKey'));
  const entries = entriesFor(products);
  await writeFile(join(root, 'public/sitemap.xml'), renderSitemap(entries), 'utf8');
  console.log(JSON.stringify({ sitemapUrls: entries.length, productUrls: entries.length - publicPages.length, access: 'anonymous/public RLS' }));
  return entries;
}

export async function readEntries(file) {
  // Use the already-installed test DOM dependency as a real XML parser.
  const { JSDOM } = await import('jsdom');
  const document = new JSDOM(await readFile(file, 'utf8'), { contentType: 'application/xml' }).window.document;
  assert.equal(document.documentElement.localName, 'urlset');
  assert.equal(document.documentElement.namespaceURI, NAMESPACE);
  const entries = [...document.getElementsByTagNameNS(NAMESPACE, 'url')].map(element => {
    const locations = element.getElementsByTagNameNS(NAMESPACE, 'loc');
    assert.equal(locations.length, 1, 'Each sitemap entry needs exactly one loc');
    return { loc: locations[0].textContent, lastmod: element.getElementsByTagNameNS(NAMESPACE, 'lastmod')[0]?.textContent };
  });
  assert.equal(new Set(entries.map(entry => entry.loc)).size, entries.length, 'Duplicate sitemap URLs');
  for (const { loc, lastmod } of entries) {
    const url = new URL(loc);
    assert.equal(url.origin, ORIGIN);
    assert(!url.search && !url.hash, 'Sitemap URLs cannot include credentials or query variants');
    assert(publicPages.includes(url.pathname) || (url.pathname.startsWith('/product/') && url.pathname.endsWith('/') && idPattern.test(url.pathname.slice(9, -1))), `Non-public route in sitemap: ${url.pathname}`);
    if (lastmod) assert(Number.isFinite(Date.parse(lastmod)), 'Invalid lastmod');
  }
  for (const path of publicPages) assert(entries.some(entry => entry.loc === ORIGIN + path));
  return entries;
}

export function withHead(html, { loc, index = true }) {
  html = html.replace(/<meta\b(?=[^>]*\bname=["']robots["'])[^>]*>\s*/gi, '').replace(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>\s*/gi, '');
  const tags = `<meta name="robots" content="${index ? 'index, follow' : 'noindex, nofollow'}">\n${loc ? `<link rel="canonical" href="${escapeXml(loc)}">\n` : ''}`;
  return html.replace('</head>', tags + '</head>');
}

export async function prepare(directory = join(root, 'dist/zeleon/browser')) {
  const entries = await readEntries(join(directory, 'sitemap.xml'));
  const shell = await readFile(join(directory, 'index.html'), 'utf8');
  for (const entry of entries) {
    const target = join(directory, new URL(entry.loc).pathname.slice(1), 'index.html');
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, withHead(shell, entry), 'utf8');
  }
  await validate(directory);
}

export async function validate(directory = join(root, 'dist/zeleon/browser')) {
  await checkRoutes();
  const entries = await readEntries(join(directory, 'sitemap.xml'));
  const robots = await readFile(join(directory, 'robots.txt'), 'utf8');
  assert.match(robots, /^User-agent:\s*\*\s*$/m);
  assert.match(robots, /^Allow:\s*\/\s*$/m);
  assert.match(robots, /^Sitemap:\s*https:\/\/zeleon\.store\/sitemap\.xml\s*$/m);
  assert(!/^Disallow:\s*\S/m.test(robots), 'Public pages must remain crawlable');
  for (const entry of entries) {
    const html = await readFile(join(directory, new URL(entry.loc).pathname.slice(1), 'index.html'), 'utf8');
    assert(html.includes(`href="${escapeXml(entry.loc)}"`), 'Static entry page canonical mismatch');
    assert(html.includes('content="index, follow"'), 'Public entry page is not indexable');
    assert(html.includes('<base href="/">') || html.includes('<base href="/" />'));
  }
  await access(join(directory, 'sitemap.xml'));
  console.log(JSON.stringify({ xml: 'valid', uniqueUrls: entries.length, staticEntryPages: entries.length, robots: 'valid', routeCompatibility: 'valid' }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const action = process.argv[2] ?? 'generate';
  if (action === 'generate') await generate();
  else if (action === 'prepare') await prepare();
  else if (action === 'validate') await validate();
  else throw new Error(`Unknown sitemap command: ${action}`);
}
