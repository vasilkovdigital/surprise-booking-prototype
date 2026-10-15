// Service worker: запускает приложение (маршруты + SQLite) прямо в браузере. Данные хранятся в IndexedDB у каждого пользователя.
const VERSION = '20261015133828';
const SCOPE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, '');
importScripts('sql-wasm.js');

// статические файлы отдаёт обычный хостинг, всё остальное — «сервер в браузере»
const PASS = /^\/(style\.css|wizard\.js|home\.js|catalog-core\.js|favicon\.ico|sw\.js|app\.js|sql-wasm\.(js|wasm)|brand\/.+)$/;

const idb = () => new Promise((resolve, reject) => {
  const r = indexedDB.open('surprise-prototype', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
const idbGet = async (k) => { const db = await idb(); return new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); };
const idbPut = async (k, v) => { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); };

let readyPromise;
const start = () => (readyPromise ||= (async () => {
  globalThis.__SQL__ = await initSqlJs({ locateFile: (f) => `${SCOPE_PATH}/${f}` });
  const [saved, ver] = await Promise.all([idbGet('db'), idbGet('ver')]);
  // новая версия прототипа → база создаётся заново (брони и аккаунты прошлой версии сбрасываются)
  globalThis.__DB_BYTES__ = saved && ver === VERSION ? saved : null;
  const code = await (await fetch(`${SCOPE_PATH}/app.js?v=${VERSION}`)).text();
  (0, eval)(code);
  App.init();
  await persist(true);
})());

async function persist(force) {
  if (!force && !App.dirty()) return;
  await idbPut('db', App.snapshot());
  await idbPut('ver', VERSION);
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== location.origin || !url.pathname.startsWith(SCOPE_PATH)) return;
  const rel = url.pathname.slice(SCOPE_PATH.length) || '/';
  if (PASS.test(rel) || (req.method !== 'GET' && req.method !== 'POST')) return;
  event.respondWith((async () => {
    await start();
    const res = await App.handle(req, SCOPE_PATH);
    await persist(false);
    return res;
  })());
});
