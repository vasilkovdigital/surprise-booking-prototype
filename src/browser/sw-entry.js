// «Сервер в браузере»: те же маршруты и та же база (SQLite через sql.js), только запросы приходят из service worker.
// Собирается в docs/app.js (scripts/build-pages.mjs) и вызывается из docs/sw.js.
import '../../build/merchant-data.js';
import { get, run, initSchema } from '../db.js';
import { seed } from '../seed.js';
import { match, html } from '../router.js';
import { render, esc } from '../views.js';
import '../routes/public.js';
import '../routes/pages.js';
import '../routes/client.js';
import '../routes/gift.js';
import '../routes/cart.js';
import '../routes/partner.js';
import '../routes/admin.js';
import { isDirty, clearDirty, exportBytes } from './sqlite-shim.js';
import { fmtDT } from '../time.js';

globalThis.__BROWSER_APP__ = true;
// в одном браузере — один пользователь и одна база, поэтому и сессия одна
const SID = 'local';

export function init() {
  initSchema();
  if (!get('SELECT COUNT(*) c FROM users').c) seed();
}
export const dirty = () => isDirty();
export function snapshot() {
  clearDirty();
  return exportBytes();
}
export function reset() {
  seed();
}

const rewriteHtml = (text, base) => text
  .replace(/(href|src|action)="(\/(?!\/)[^"]*)"/g, (_, a, u) => `${a}="${base}${u}"`)
  .replace('</head>', `<script>window.BASE=${JSON.stringify(base)};</script>\n</head>`);

function respond(out, base) {
  const headers = new Headers(out.headers || {});
  const loc = headers.get('Location');
  if (loc && loc.startsWith('/')) headers.set('Location', base + loc);
  const isHtml = (headers.get('Content-Type') || '').includes('text/html');
  const body = out.status >= 300 && out.status < 400 ? null : (isHtml ? rewriteHtml(out.body, base) : out.body);
  return new Response(body, { status: out.status, headers });
}

export async function handle(request, base) {
  try {
    const u = new URL(request.url);
    const path = (u.pathname.startsWith(base) ? u.pathname.slice(base.length) : u.pathname) || '/';
    const url = new URL(path + u.search, u.origin);

    if (!get('SELECT 1 FROM sessions WHERE id=?', SID)) run('INSERT INTO sessions (id,created_at) VALUES (?,?)', SID, fmtDT(new Date()));
    const sess = get('SELECT * FROM sessions WHERE id=?', SID);
    const ctx = {
      req: request, url, sid: SID, query: Object.fromEntries(url.searchParams), body: {},
      user: sess.user_id ? get('SELECT * FROM users WHERE id=?', sess.user_id) : null,
      login(user) { run('UPDATE sessions SET user_id=? WHERE id=?', user.id, SID); ctx.user = user; },
      logout() { run('UPDATE sessions SET user_id=NULL WHERE id=?', SID); ctx.user = null; },
    };
    if (request.method === 'POST') ctx.body = Object.fromEntries(new URLSearchParams(await request.text()));

    if (request.method === 'POST' && path === '/__reset') {
      reset();
      return respond({ status: 303, headers: { Location: '/' } }, base);
    }
    const m = match(request.method, url.pathname);
    let out;
    if (!m) out = html(render(ctx, 'Не найдено', '<h1>Страница не найдена</h1><p><a href="/">В каталог</a></p>'), 404);
    else {
      ctx.params = m.params;
      out = await m.handler(ctx);
    }
    return respond(out, base);
  } catch (e) {
    console.error(e);
    return new Response(`<pre>Ошибка: ${esc(e.message)}</pre>`, { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}
