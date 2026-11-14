import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';

// Local build/test helper only. Missing paths retain HTTP 404, as on GitHub Pages.
export async function serveStatic(directory) {
  const root = resolve(directory);
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain', '.png': 'image/png', '.jpg': 'image/jpeg', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  const server = createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
      const url = new URL(request.url, 'http://localhost');
      const pathname = decodeURIComponent(url.pathname);
      let target = resolve(root, '.' + pathname);
      if (target !== root && !target.startsWith(root + sep)) { response.writeHead(403).end(); return; }
      let status = 200;
      try {
        if ((await stat(target)).isDirectory()) {
          if (!pathname.endsWith('/')) {
            response.writeHead(301, { Location: url.pathname + '/' + url.search }).end(); return;
          }
          target = resolve(target, 'index.html');
        }
        await stat(target);
      } catch {
        target = resolve(root, '404.html'); status = 404;
      }
      const content = await readFile(target);
      response.writeHead(status, { 'Content-Type': types[extname(target)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch { response.writeHead(500).end(); }
  });
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((done, reject) => { server.close(error => error ? reject(error) : done()); server.closeAllConnections(); }),
  };
}
