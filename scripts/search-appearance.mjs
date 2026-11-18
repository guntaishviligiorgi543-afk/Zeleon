import assert from 'node:assert/strict';
import { ORIGIN } from '../src/app/seo-metadata.mjs';

// Project contract: retain the existing, same-origin favicon at a stable URL.
// Google permits other formats and hosts; these checks protect this site's setup.
export function faviconFor(document) {
  const icons = document.querySelectorAll('link[rel~="icon"]');
  assert.equal(icons.length, 1, 'Expected one unambiguous favicon link');
  const icon = icons[0];
  const href = icon.getAttribute('href');
  assert(href?.startsWith('/'), 'Favicon must use the existing root-relative URL');
  const url = new URL(href, ORIGIN);
  assert.equal(url.origin, ORIGIN, 'Favicon origin changed');
  assert(!url.search && !url.hash, 'Favicon URL must remain stable, without query/hash variants');
  assert.equal(icon.type, url.pathname.endsWith('.svg') ? 'image/svg+xml' : 'image/png', 'Favicon declaration must match its format');
  return { url, sizes: icon.getAttribute('sizes') };
}

export function checkPngFavicon(bytes, declaredSizes) {
  assert(bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
    'Favicon is not a PNG (or is truncated)');
  assert.equal(bytes.readUInt32BE(8), 13, 'Invalid PNG header length');
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR', 'Missing PNG image header');
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  assert(width >= 8 && height >= 8, 'Favicon dimensions must be at least 8px');
  if (declaredSizes) assert.equal(declaredSizes, `${width}x${height}`, 'Declared favicon size differs from image');
  return { width, height, bytes: bytes.length };
}

export function checkSnippetDirectives(value = '') {
  assert(!/(?:^|[\s,:;])(?:nosnippet|noindex)(?=$|[\s,;])|max-snippet\s*:\s*0\b/i.test(value),
    'Indexable page contains a snippet/indexing blocker');
}

// The SVG embeds the original PNG and fits it within a square without stretching.
export function checkFavicon(bytes, declaredSizes) {
  if (!bytes.toString('utf8', 0, 4).startsWith('<svg')) return checkPngFavicon(bytes, declaredSizes);
  const svg = bytes.toString('utf8');
  assert(svg.includes('viewBox="76 8 448 448"') && svg.includes('preserveAspectRatio="xMidYMid meet"'), 'Favicon must preserve the artwork proportions');
  assert.equal(declaredSizes, '64x64');
  const embedded = svg.match(/href="data:image\/png;base64,([^"]+)"/);
  assert(embedded, 'Missing embedded favicon PNG');
  checkPngFavicon(Buffer.from(embedded[1], 'base64'));
  return { width: 64, height: 64, bytes: bytes.length };
}
