import { fileURLToPath } from 'node:url';
import { serveStatic } from './static-server.mjs';
import { validatePrerender } from './prerender.mjs';

const directory = fileURLToPath(new URL('../dist/zeleon/browser', import.meta.url));
await validatePrerender(directory);
const server = await serveStatic(directory);
try {
  process.env.SEO_TEST_BASE_URL = server.origin;
  await import('./verify-seo.mjs');
} finally { await server.close(); }
