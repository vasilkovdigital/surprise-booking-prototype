import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { get, run, initSchema } from './src/db.js';
import { createSession } from './src/auth.js';
import { seed } from './src/seed.js';
import { match, html } from './src/router.js';
import { render, esc } from './src/views.js';
import './src/routes/public.js';
import './src/routes/pages.js';
import './src/routes/client.js';
import './src/routes/gift.js';
import './src/routes/cart.js';
import './src/routes/partner.js';
import './src/routes/admin.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const MIME = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

initSchema();
if (!get('SELECT COUNT(*) c FROM users').c) seed();

function parseCookies(h = '') {
  return Object.fromEntries(h.split(';').map((s) => s.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, v.join('=')]));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString('utf8');
  return Object.fromEntries(new URLSearchParams(text));
}

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/style.css') {
        res.writeHead(200, { 'Content-Type': MIME['.css'] });
        return res.end(fs.readFileSync(path.join(root, 'public', 'style.css')));
      }
      if (req.method === 'GET' && (url.pathname === '/wizard.js' || url.pathname === '/home.js')) {
        res.writeHead(200, { 'Content-Type': MIME['.js'] });
        return res.end(fs.readFileSync(path.join(root, 'public', url.pathname.slice(1))));
      }
      if (req.method === 'GET' && url.pathname === '/catalog-core.js') {
        res.writeHead(200, { 'Content-Type': MIME['.js'] });
        return res.end(fs.readFileSync(path.join(root, 'src', 'catalog-core.js')));
      }
      if (req.method === 'GET' && /^\/brand\/[\w.-]+\.svg$/.test(url.pathname)) {
        const f = path.join(root, 'public', url.pathname);
        if (fs.existsSync(f)) { res.writeHead(200, { 'Content-Type': MIME['.svg'] }); return res.end(fs.readFileSync(f)); }
      }
      if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }

      const cookies = parseCookies(req.headers.cookie);
      let sid = cookies.sid;
      const setCookie = [];
      if (!sid || !get('SELECT 1 FROM sessions WHERE id=?', sid)) {
        sid = createSession();
        setCookie.push(`sid=${sid}; Path=/; HttpOnly; SameSite=Lax`);
      }
      const sess = get('SELECT * FROM sessions WHERE id=?', sid);
      const ctx = {
        req, url, sid, query: Object.fromEntries(url.searchParams), body: {},
        user: sess.user_id ? get('SELECT * FROM users WHERE id=?', sess.user_id) : null,
        login(user) { run('UPDATE sessions SET user_id=? WHERE id=?', user.id, sid); ctx.user = user; },
        logout() { run('UPDATE sessions SET user_id=NULL WHERE id=?', sid); ctx.user = null; },
      };
      if (req.method === 'POST') ctx.body = await readBody(req);

      const m = match(req.method, url.pathname);
      let out;
      if (!m) out = html(render(ctx, 'Не найдено', '<h1>Страница не найдена</h1><p><a href="/">В каталог</a></p>'), 404);
      else {
        ctx.params = m.params;
        out = await m.handler(ctx);
      }
      const headers = { ...out.headers };
      if (setCookie.length) headers['Set-Cookie'] = setCookie;
      res.writeHead(out.status, headers);
      res.end(out.body);
    } catch (e) {
      console.error(e);
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<pre>Ошибка: ${esc(e.message)}</pre>`);
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  createServer().listen(port, () => console.log(`Surprise.by (тест): http://localhost:${port}`));
}
