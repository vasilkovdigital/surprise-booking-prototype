import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { get, run } from './db.js';
import { fmtDT } from './time.js';
import { strict } from './config.js';

export function hashPassword(pw) {
  const salt = randomBytes(8).toString('hex');
  return `${salt}:${scryptSync(pw, salt, 32).toString('hex')}`;
}
export function checkPassword(pw, stored) {
  const [salt, hash] = stored.split(':');
  const a = scryptSync(pw, salt, 32);
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createSession() {
  const id = randomBytes(18).toString('hex');
  run('INSERT INTO sessions (id,created_at) VALUES (?,?)', id, fmtDT(new Date()));
  return id;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Регистрация (имя, телефон, email, дата рождения, пароль — все обязательны).
 * Если email уже есть — это вход: проверяем пароль. Возвращает { user } или { error }.
 */
export function registerOrLogin(f) {
  const v = (k) => String(f[k] ?? '').trim();
  const email = v('email').toLowerCase();
  if (!v('name') || !v('phone') || !email || !v('birth_date') || !v('password')) return { error: 'Заполните все обязательные поля' };
  if (!EMAIL_RE.test(email)) return { error: 'Некорректный email' };
  if (v('phone').replace(/\D/g, '').length < 7) return { error: 'Некорректный телефон' };
  const bd = new Date(v('birth_date'));
  if (isNaN(bd) || bd > new Date() || bd.getFullYear() < 1900) return { error: 'Некорректная дата рождения' };
  const existing = get('SELECT * FROM users WHERE email=?', email);
  if (existing) {
    if (!checkPassword(v('password'), existing.password_hash)) return { error: 'Этот email уже зарегистрирован. Введите его пароль или войдите.' };
    if (!existing.birth_date) run('UPDATE users SET birth_date=? WHERE id=?', v('birth_date'), existing.id);
    return { user: get('SELECT * FROM users WHERE id=?', existing.id) };
  }
  if (v('password').length < 4) return { error: 'Пароль — минимум 4 символа' };
  const id = run(
    'INSERT INTO users (role,email,password_hash,name,phone,birth_date,is_test) VALUES (?,?,?,?,?,?,1)',
    'client', email, hashPassword(v('password')), v('name'), v('phone'), v('birth_date'),
  ).id;
  return { user: get('SELECT * FROM users WHERE id=?', id) };
}

export function loginOnly(email, password) {
  const u = get('SELECT * FROM users WHERE email=?', String(email || '').trim().toLowerCase());
  if (!u || !checkPassword(String(password || ''), u.password_hash)) return { error: 'Неверный email или пароль' };
  return { user: u };
}

/** Тестовый покупатель: на нем оформляется заказ, если в прототипе контакты оставили пустыми. */
export function demoUser() {
  const email = 'demo-buyer@test.by';
  const u = get('SELECT * FROM users WHERE email=?', email);
  if (u) return u;
  const id = run('INSERT INTO users (role,email,password_hash,name,phone,birth_date,is_test) VALUES (?,?,?,?,?,?,1)',
    'client', email, hashPassword('test1234'), 'Демо-покупатель', '+375290000000', '1990-01-01').id;
  return get('SELECT * FROM users WHERE id=?', id);
}

/**
 * Покупатель в чекауте: новый аккаунт (auth=new) или вход (auth=login).
 * Без STRICT_FORMS пустые/неверные данные не блокируют прототип — подставляется демо-покупатель.
 */
export function resolveBuyer(f) {
  const r = f.auth === 'login' ? loginOnly(f.l_email, f.l_password) : registerOrLogin(f);
  if (!r.error || strict()) return r;
  return { user: demoUser(), demo: true };
}
