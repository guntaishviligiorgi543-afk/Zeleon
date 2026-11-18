import assert from 'node:assert/strict';
import { ORIGIN } from '../src/app/seo-metadata.mjs';

// Project contract: retain the existing, same-origin PNG favicon at a stable URL.
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
  assert.equal(icon.type, 'image/png', 'Favicon declaration must match its PNG bytes');
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
