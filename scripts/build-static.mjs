// Сборка статической демо-витрины для GitHub Pages → папка docs/.
// Запуск: npm run build:static  (BASE_PATH=/имя-репозитория, по умолчанию /surprise-booking-prototype)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.DB_PATH = ':memory:';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs');
const BASE = (process.env.BASE_PATH ?? '/surprise-booking-prototype').replace(/\/$/, '');

const { createServer } = await import('../server.js');
const { allItems } = await import('../src/catalog.js');
const { POSTS } = await import('../src/routes/pages.js');

const srv = createServer();
await new Promise((r) => srv.listen(0, r));
const origin = `http://localhost:${srv.address().port}`;
const get = async (p) => {
  const r = await fetch(origin + p);
  if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
  return r;
};

// ссылки на динамические разделы (бронь, корзина, кабинеты…) ведут на страницу «доступно в полной версии»
const DYN = /^\/(order|gift|cart|checkout|pay|booking|account|partner|admin|login|register|logout|activate|notifications|certificate|gift-order)(\/|$|\?|#)/;
function rewriteUrl(u) {
  if (u.startsWith('//')) return u;
  if (DYN.test(u)) return `${BASE}/demo/`;
  const m = u.match(/^(\/[^?#]*)(.*)$/);
  let p = m[1];
  if (!/\.[a-z0-9]+$/i.test(p) && p !== '/' && !p.endsWith('/')) p += '/';
  return BASE + p + m[2];
}
function transform(html) {
  html = html.replace(/(href|src|action)="(\/[^"]*)"/g, (_, a, u) => `${a}="${rewriteUrl(u)}"`);
  html = html.replace('<div class="test-banner">ТЕСТОВАЯ ВЕРСИЯ</div>', '<div class="test-banner">ТЕСТОВАЯ ВЕРСИЯ · статическая демо-витрина: бронь, корзина и кабинеты — в полной версии</div>');
  return html.replace('</head>', `<script>window.STATIC=true;window.BASE=${JSON.stringify(BASE)};</script>\n</head>`);
}

fs.rmSync(out, { recursive: true, force: true });
const write = (rel, data) => { const f = path.join(out, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };

const pages = ['/', '/about', '/delivery', '/contacts', '/reviews', '/blog', '/partners', '/legal/offer', '/legal/privacy', '/search', '/demo', '/bundle/1',
  ...POSTS.map((p) => `/blog/${p.slug}`), ...allItems().filter((i) => i.kind === 'service').map((i) => `/service/${i.id}`)];
let n = 0;
for (const p of pages) {
  const html = transform(await (await get(p)).text());
  write(p === '/' ? 'index.html' : `${p.slice(1)}/index.html`, html);
  if (p === '/demo') write('404.html', html);
  n++;
}

// статика
for (const f of ['style.css', 'wizard.js', 'home.js']) write(f, fs.readFileSync(path.join(root, 'public', f)));
write('catalog-core.js', fs.readFileSync(path.join(root, 'src', 'catalog-core.js')));
write('catalog.json', await (await get('/catalog.json')).text());
for (const f of fs.readdirSync(path.join(root, 'public', 'brand'))) write(`brand/${f}`, fs.readFileSync(path.join(root, 'public', 'brand', f)));
write('.nojekyll', '');

srv.close();
console.log(`Готово: ${n} страниц → docs/ (BASE=${BASE || '/'})`);
process.exit(0);
