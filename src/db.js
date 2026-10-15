import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DB_FILE = process.env.DB_PATH || path.join(root, 'data', 'app.db');
if (DB_FILE !== ':memory:') fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

export const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA foreign_keys = ON');

const TABLES = [
  'cart_meta', 'cart_items', 'notification_log', 'bookings', 'certificates', 'orders', 'bundle_services', 'bundles',
  'slot_overrides', 'schedule_rules', 'services', 'partners', 'sessions', 'settings', 'users',
];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, role TEXT NOT NULL DEFAULT 'client', email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL, name TEXT, phone TEXT, birth_date TEXT, is_test INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, user_id INTEGER, flash TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS partners (
  id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), name TEXT NOT NULL, description TEXT,
  integration TEXT NOT NULL DEFAULT 'none',          -- cabinet | none
  calendar_sync INTEGER NOT NULL DEFAULT 0,          -- 1 = календарь подключен, бронь подтверждается автоматически
  visit_min INTEGER NOT NULL DEFAULT 60,
  free_cancel_hours INTEGER, confirm_timeout_hours INTEGER,
  notify_channel TEXT NOT NULL DEFAULT 'email',      -- telegram | email | both
  contacts TEXT
);
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY, partner_id INTEGER NOT NULL REFERENCES partners(id), title TEXT NOT NULL,
  description TEXT, price REAL NOT NULL, capacity INTEGER NOT NULL DEFAULT 1,
  category TEXT NOT NULL DEFAULT 'Универсальные',
  people INTEGER NOT NULL DEFAULT 1,
  city TEXT NOT NULL DEFAULT 'Минск',
  occasion TEXT NOT NULL DEFAULT 'Просто так',
  gender TEXT NOT NULL DEFAULT 'any',
  age TEXT NOT NULL DEFAULT 'adult',
  is_new INTEGER NOT NULL DEFAULT 0,
  exclusive INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT 0,
  reviews INTEGER NOT NULL DEFAULT 0,
  cashback INTEGER NOT NULL DEFAULT 0,
  badges TEXT NOT NULL DEFAULT '',
  popularity INTEGER NOT NULL DEFAULT 0,
  photos TEXT NOT NULL DEFAULT '[]', source_url TEXT
);
CREATE TABLE IF NOT EXISTS bundles (id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT, price REAL NOT NULL,
  category TEXT NOT NULL DEFAULT 'Универсальные',
  people INTEGER NOT NULL DEFAULT 1,
  city TEXT NOT NULL DEFAULT 'Минск',
  occasion TEXT NOT NULL DEFAULT 'Просто так',
  gender TEXT NOT NULL DEFAULT 'any',
  age TEXT NOT NULL DEFAULT 'adult',
  is_new INTEGER NOT NULL DEFAULT 0,
  exclusive INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT 0,
  reviews INTEGER NOT NULL DEFAULT 0,
  cashback INTEGER NOT NULL DEFAULT 0,
  badges TEXT NOT NULL DEFAULT '',
  popularity INTEGER NOT NULL DEFAULT 0,
  photos TEXT NOT NULL DEFAULT '[]', source_url TEXT
);
CREATE TABLE IF NOT EXISTS bundle_services (
  bundle_id INTEGER NOT NULL REFERENCES bundles(id), service_id INTEGER NOT NULL REFERENCES services(id),
  PRIMARY KEY (bundle_id, service_id)
);
CREATE TABLE IF NOT EXISTS schedule_rules (
  partner_id INTEGER NOT NULL REFERENCES partners(id), weekday INTEGER NOT NULL,  -- 0=вс .. 6=сб
  start TEXT NOT NULL, "end" TEXT NOT NULL, break_start TEXT, break_end TEXT,
  PRIMARY KEY (partner_id, weekday)
);
CREATE TABLE IF NOT EXISTS slot_overrides (
  id INTEGER PRIMARY KEY, partner_id INTEGER NOT NULL REFERENCES partners(id),
  date TEXT NOT NULL, time TEXT, state TEXT NOT NULL      -- closed | open
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, kind TEXT NOT NULL, amount REAL NOT NULL, created_at TEXT,
  delivery_method TEXT, delivery_info TEXT, delivery_cost REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'paid',   -- draft (ждет оплаты) | paid
  payload TEXT
);
CREATE TABLE IF NOT EXISTS cart_items (
  id INTEGER PRIMARY KEY, sid TEXT NOT NULL, kind TEXT NOT NULL, ref_id INTEGER NOT NULL,
  packaging TEXT NOT NULL DEFAULT 'digital', extras TEXT NOT NULL DEFAULT '{}', qty INTEGER NOT NULL DEFAULT 1  -- одна строка = одна единица (один будущий сертификат)
);
CREATE TABLE IF NOT EXISTS cart_meta (sid TEXT PRIMARY KEY, mode TEXT NOT NULL DEFAULT 'all');   -- all | each
CREATE TABLE IF NOT EXISTS certificates (
  id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, service_id INTEGER, bundle_id INTEGER,
  packaging TEXT NOT NULL, extras TEXT NOT NULL DEFAULT '{}', buyer_id INTEGER NOT NULL, recipient_id INTEGER, chosen_service_id INTEGER,
  status TEXT NOT NULL DEFAULT 'active',                  -- active | used | expired
  expires_at TEXT NOT NULL, activated_at TEXT, created_at TEXT, order_id INTEGER
);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES users(id),
  service_id INTEGER NOT NULL REFERENCES services(id), partner_id INTEGER NOT NULL,
  starts_at TEXT NOT NULL, status TEXT NOT NULL, refund_simulated INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'order', certificate_id INTEGER, order_id INTEGER,
  confirm_deadline TEXT, created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_bookings_slot ON bookings(service_id, starts_at);
CREATE TABLE IF NOT EXISTS notification_log (
  id INTEGER PRIMARY KEY, created_at TEXT, event TEXT NOT NULL, booking_id INTEGER,
  recipient_type TEXT NOT NULL, recipient_name TEXT, channel TEXT NOT NULL, text TEXT NOT NULL
);
`;

export const initSchema = () => {
  db.exec(SCHEMA);
  // старые файлы БД: добавить колонки доставки
  const add = (t, col) => { try { db.exec(`ALTER TABLE ${t} ADD COLUMN ${col}`); } catch { /* уже есть */ } };
  for (const col of ['delivery_method TEXT', 'delivery_info TEXT', 'delivery_cost REAL NOT NULL DEFAULT 0', "status TEXT NOT NULL DEFAULT 'paid'", 'payload TEXT']) add('orders', col);
  for (const t of ['services', 'bundles']) for (const col of ["category TEXT NOT NULL DEFAULT 'Универсальные'","people INTEGER NOT NULL DEFAULT 1","city TEXT NOT NULL DEFAULT 'Минск'","occasion TEXT NOT NULL DEFAULT 'Просто так'","gender TEXT NOT NULL DEFAULT 'any'","age TEXT NOT NULL DEFAULT 'adult'","is_new INTEGER NOT NULL DEFAULT 0","exclusive INTEGER NOT NULL DEFAULT 0","rating REAL NOT NULL DEFAULT 0","reviews INTEGER NOT NULL DEFAULT 0","cashback INTEGER NOT NULL DEFAULT 0","badges TEXT NOT NULL DEFAULT ''","popularity INTEGER NOT NULL DEFAULT 0","photos TEXT NOT NULL DEFAULT '[]'","source_url TEXT"]) add(t, col);
  add('cart_items', "extras TEXT NOT NULL DEFAULT '{}'");
  add('certificates', "extras TEXT NOT NULL DEFAULT '{}'");
};
export const dropAll = () => {
  for (const t of TABLES) db.exec(`DROP TABLE IF EXISTS ${t}`);
};
export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const get = (sql, ...p) => db.prepare(sql).get(...p);
export const run = (sql, ...p) => {
  const r = db.prepare(sql).run(...p);
  return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
};
let depth = 0;
export function tx(fn) {
  if (depth > 0) return fn(); // вложенная транзакция — часть внешней
  db.exec('BEGIN');
  depth++;
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    depth--;
  }
}
export const getSetting = (key, fallback) => get('SELECT value FROM settings WHERE key=?', key)?.value ?? fallback;

initSchema();
