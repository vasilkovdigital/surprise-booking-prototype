// Сборка полностью рабочего прототипа для GitHub Pages → docs/.
// Приложение (маршруты + SQLite через sql.js) запускается в service worker прямо в браузере; данные — в IndexedDB пользователя.
// Запуск: npm run build:pages  (BASE_PATH=/имя-репозитория, по умолчанию /surprise-booking-prototype)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { readMerchant } from '../src/merchant.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (...p) => path.join(root, ...p);
const BASE = (process.env.BASE_PATH ?? '/surprise-booking-prototype').replace(/\/$/, '');
const VERSION = new Date().toISOString().replace(/\D/g, '').slice(0, 14);

// 1. каталог из выгрузки Google Merchant — вшиваем в бандл (в браузере нет файловой системы)
fs.mkdirSync(at('build'), { recursive: true });
const rows = readMerchant(at('seed', 'google_merchant.csv'));
fs.writeFileSync(at('build', 'merchant-data.js'), `globalThis.__MERCHANT_ROWS__ = ${JSON.stringify(rows)};\n`);

// 2. бандл «сервера в браузере»
const out = at('docs');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
await build({
  entryPoints: [at('src', 'browser', 'sw-entry.js')],
  outfile: at('docs', 'app.js'),
  bundle: true, minify: true, format: 'iife', globalName: 'App', platform: 'browser', target: 'es2020', logLevel: 'warning',
  define: { 'process.env.DB_PATH': '":memory:"', 'process.env.STRICT_FORMS': '"0"', 'import.meta.url': '"file:///app/src/x.js"' },
  alias: {
    'node:sqlite': at('src', 'browser', 'sqlite-shim.js'),
    'node:fs': at('src', 'browser', 'stub-fs.js'),
    'node:path': at('src', 'browser', 'stub-path.js'),
    'node:url': at('src', 'browser', 'stub-url.js'),
  },
});

// 3. service worker, sql.js, страница запуска и статика
const copy = (from, to) => fs.cpSync(from, path.join(out, to), { recursive: true });
fs.writeFileSync(path.join(out, 'sw.js'), fs.readFileSync(at('pages', 'sw.js'), 'utf8').replace('__VERSION__', VERSION));
copy(at('node_modules', 'sql.js', 'dist', 'sql-wasm.js'), 'sql-wasm.js');
copy(at('node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'), 'sql-wasm.wasm');
const boot = fs.readFileSync(at('pages', 'boot.html'), 'utf8').replaceAll('__BASE__', BASE);
fs.writeFileSync(path.join(out, 'index.html'), boot);
fs.writeFileSync(path.join(out, '404.html'), boot); // глубокая ссылка до установки service worker → запуск и повторное открытие
for (const f of ['style.css', 'wizard.js', 'home.js']) copy(at('public', f), f);
copy(at('src', 'catalog-core.js'), 'catalog-core.js');
copy(at('public', 'brand'), 'brand');
fs.writeFileSync(path.join(out, '.nojekyll'), '');

const kb = (f) => `${(fs.statSync(path.join(out, f)).size / 1024).toFixed(0)} КБ`;
console.log(`Готово: docs/ (версия ${VERSION}, BASE=${BASE || '/'}), app.js ${kb('app.js')}, sql-wasm.wasm ${kb('sql-wasm.wasm')}`);
