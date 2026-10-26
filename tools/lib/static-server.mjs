/**
 * 钦天监 · 门禁用本地静态服务（零依赖）
 *
 * 给 verify-browser.mjs / verify-offline.mjs 复用：
 *   const srv = await startStaticServer(APP_DIR, { offlineFile: '/tmp/qt-offline' });
 *   srv.url / srv.port / srv.close()
 *
 * offlineFile 存在时，除 /__health 外一律返回 503——用来模拟"断网但 SW 有缓存"。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};

export function startStaticServer(root, opts = {}) {
  const offlineFile = opts.offlineFile || null;
  const stats = { requests: 0, hits: {}, notFound: [], served: 0, offlineDropped: 0 };
  const isOffline = () => !!(offlineFile && fs.existsSync(offlineFile));
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
    if (urlPath === '/__health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, offline: isOffline() }));
      return;
    }
    if (isOffline()) {
      // 真"断网"必须让 fetch 直接 reject，而不是返回 503：
      // sw.js 的 networkFirst 只在 fetch 抛错时才回退缓存，503 会被当成正常响应透传给页面。
      // 所以这里直接掐掉 socket（浏览器侧表现为 ERR_EMPTY_RESPONSE / 连接中断）。
      stats.requests++;
      stats.offlineDropped++;
      req.socket.destroy();
      return;
    }
    let rel = path.posix.normalize(urlPath).replace(/^\/+/, '');
    if (rel === '' || rel === '.' || urlPath.endsWith('/')) rel = path.posix.join(rel, 'index.html');
    if (rel.startsWith('..')) { res.writeHead(403); res.end('forbidden'); return; }
    const abs = path.join(root, rel);
    if (!abs.startsWith(root)) {
      res.writeHead(403); res.end('forbidden'); return;
    }
    fs.readFile(abs, (err, buf) => {
      stats.requests++;
      stats.hits[urlPath] = (stats.hits[urlPath] || 0) + 1;
      if (err) {
        stats.notFound.push(urlPath);
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('not found: ' + rel);
        return;
      }
      stats.served++;
      res.writeHead(200, {
        'content-type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(buf);
    });
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        server,
        port,
        url: `http://127.0.0.1:${port}`,
        stats,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}
