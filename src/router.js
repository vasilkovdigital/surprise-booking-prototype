import { run } from './db.js';

const routes = [];
export function route(method, pattern, handler) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ method, re, keys, handler });
}
export const get_ = (p, h) => route('GET', p, h);
export const post = (p, h) => route('POST', p, h);

export function match(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.re.exec(pathname);
    if (m) return { handler: r.handler, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

export const redirect = (location) => ({ status: 303, headers: { Location: location }, body: '' });
export const html = (body, status = 200) => ({ status, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body });

export function flash(ctx, text, type = 'ok') {
  run('UPDATE sessions SET flash=? WHERE id=?', JSON.stringify({ text, type }), ctx.sid);
}

/** Возвращает redirect, если нет нужной роли; иначе null. */
export function guard(ctx, ...roles) {
  if (!ctx.user) return redirect('/login?next=' + encodeURIComponent(ctx.url.pathname + ctx.url.search));
  if (roles.length && !roles.includes(ctx.user.role)) {
    flash(ctx, 'Нет доступа', 'error');
    return redirect('/');
  }
  return null;
}
