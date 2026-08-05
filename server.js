/* 로컬/자체 서버 실행용 — Vercel 없이도 동작하는 웹앱 서버
 *   GH_TOKEN=... GH_REPO=소유자/저장소 node server.js
 * 실행 후 http://localhost:3000 접속. /api/state 는 api/state.js(깃허브 백엔드)를 그대로 사용.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import handler from './api/state.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.md': 'text/plain; charset=utf-8' };

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/api/state') {
    let body = '';
    for await (const c of req) body += c;
    const vreq = { method: req.method, query: Object.fromEntries(u.searchParams), body: body || undefined };
    const vres = {
      status(c) { res.statusCode = c; return this; },
      json(o) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return this; },
    };
    try { await handler(vreq, vres); }
    catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e) })); }
    return;
  }
  const p = u.pathname === '/' ? '/index.html' : decodeURIComponent(u.pathname);
  const f = path.normalize(path.join(ROOT, p));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.statusCode = 404; res.end('not found'); return;
  }
  res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('좌석 배치도 서버 실행: http://localhost:' + PORT));
