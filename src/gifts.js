import { randomDigit } from '#crypto';
import { get, run, tx } from './db.js';
import { fmtDT, addMonths } from './time.js';

export const PACKAGING = {
  digital: { label: 'Электронный сертификат', note: 'Код на экране и на email' },
  envelope: { label: 'Конверт', note: 'Бумажный сертификат в конверте' },
  box: { label: 'Коробка', note: 'Подарочная коробка' },
};

// Допы зависят от упаковки: price — цена по упаковкам, где доп доступен (значения тестовые)
export const CARD_DESIGNS = ['Люблю', 'Мы не забыли', 'Поздравляем', 'Поздравляю', 'Поздравляем 2', 'Поздравляю 2', 'Поздравляю 3', 'Ты вау', 'Ты лучшая', 'Ты лучший'];
export const EXTRAS = {
  card: { label: 'Открытка', price: { digital: 0, envelope: 3, box: 3 } },
  balloons: { label: 'Воздушные шары', price: { box: 15 } },
  confetti: { label: 'Конфетти в коробку', price: { box: 5 } },
};
export const extrasAvailable = (packaging) => Object.entries(EXTRAS).filter(([, e]) => packaging in e.price);

/** Оставляет только допы, доступные для упаковки. */
export function normExtras(packaging, ex = {}) {
  const out = {};
  if ('card' in EXTRAS && packaging in EXTRAS.card.price && CARD_DESIGNS.includes(ex.card)) {
    out.card = ex.card;
    if (ex.text) out.text = String(ex.text).slice(0, 300);
  }
  for (const k of ['balloons', 'confetti']) if (ex[k] && packaging in EXTRAS[k].price) out[k] = true;
  return out;
}
export function extrasCost(packaging, ex = {}) {
  let sum = 0;
  if (ex.card) sum += EXTRAS.card.price[packaging] ?? 0;
  for (const k of ['balloons', 'confetti']) if (ex[k]) sum += EXTRAS[k].price[packaging] ?? 0;
  return sum;
}
export function extrasLabel(ex = {}) {
  const parts = [];
  if (ex.card) parts.push(`открытка «${ex.card}»`);
  if (ex.balloons) parts.push('воздушные шары');
  if (ex.confetti) parts.push('конфетти');
  return parts.join(', ');
}

// Доставка и вручение: самовывоз; Минск (посылкой/курьером или менеджером Surprise.by); почта (только посылка)
export const DELIVERY = {
  pickup: { label: 'Самовывоз' },
  minsk: { label: 'Доставка по Минску' },
  post: { label: 'Почта по Беларуси' },
};
export const HANDOVER = {
  parcel: { label: 'Посылкой', note: 'Передадим получателю как посылку (курьер) — без личного вручения' },
  manager: { label: 'Менеджером Surprise.by', note: 'Наш менеджер лично вручит подарок получателю и сохранит сюрприз' },
};
export function deliveryCost(method, handover) {
  if (method === 'pickup') return 0;
  if (method === 'post') return 6;
  if (method === 'minsk') return handover === 'manager' ? 25 : 10;
  return 0;
}
export const PICKUP_POINTS = [
  { id: 'galleria', name: 'ТРЦ Galleria', addr: 'г. Минск, пр-т Победителей, 9, 2 этаж', hours: 'с 10:00 до 22:00, без выходных' },
  { id: 'greencity', name: 'ТЦ Green City', addr: 'г. Минск, Притыцкого, 156', hours: 'с 10:00 до 22:00, без выходных' },
  { id: 'danamall', name: 'ТЦ Dana Mall', addr: 'г. Минск, Петра Мстиславца, 11', hours: 'с 10:00 до 22:00, без выходных' },
];
export const TIME_SLOTS = ['10:00–14:00', '14:00–18:00', '18:00–22:00'];

export const normalizeCode = (s) => String(s || '').replace(/\D/g, '');
export const formatCode = (c) => c.replace(/(\d{4})(?=\d)/g, '$1 ');

function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 12; i++) c += randomDigit();
    if (!get('SELECT 1 FROM certificates WHERE code=?', c)) return c;
  }
}

export function createCertificate({ buyerId, serviceId = null, bundleId = null, packaging, amount, orderId = null, extras = {} }) {
  if (!PACKAGING[packaging]) throw new Error('Выберите упаковку');
  return tx(() => {
    const now = new Date();
    const oid = orderId ?? run('INSERT INTO orders (user_id,kind,amount,created_at) VALUES (?,?,?,?)', buyerId, 'gift', amount, fmtDT(now)).id;
    return run(
      `INSERT INTO certificates (code,service_id,bundle_id,packaging,extras,buyer_id,expires_at,created_at,order_id)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      newCode(), serviceId, bundleId, packaging, JSON.stringify(extras), buyerId, fmtDT(addMonths(now, 3)), fmtDT(now), oid,
    ).id;
  });
}

/** Оплата (имитация) черновика подарочного заказа: на каждую единицу корзины — свой сертификат со своими допами. */
export function fulfilGiftOrder(orderId) {
  return tx(() => {
    const o = get('SELECT * FROM orders WHERE id=?', orderId);
    if (o.status !== 'draft') throw new Error('Заказ уже оплачен');
    const { units } = JSON.parse(o.payload);
    for (const u of units) {
      createCertificate({ buyerId: o.user_id, serviceId: u.kind === 'service' ? u.ref_id : null, bundleId: u.kind === 'bundle' ? u.ref_id : null,
        packaging: u.packaging, extras: u.extras, amount: u.price, orderId });
    }
    run("UPDATE orders SET status='paid' WHERE id=?", orderId);
  });
}

/** Этап 1 активации: код существует, не использован, не просрочен. */
export function checkCode(raw) {
  const code = normalizeCode(raw);
  if (code.length !== 12) return { error: 'Код должен состоять из 12 цифр' };
  const cert = get('SELECT * FROM certificates WHERE code=?', code);
  if (!cert) return { error: 'Сертификат с таким кодом не найден' };
  if (cert.status === 'used') return { error: 'Этот сертификат уже использован' };
  if (cert.expires_at <= fmtDT(new Date())) {
    if (cert.status !== 'expired') run("UPDATE certificates SET status='expired' WHERE id=?", cert.id);
    return { error: 'Срок действия сертификата истек' };
  }
  return { cert };
}

export function certificateTitle(cert) {
  if (cert.bundle_id) { const t = get('SELECT title FROM bundles WHERE id=?', cert.bundle_id).title; return /^Набор/i.test(t) ? t : `Набор «${t}»`; }
  return `«${get('SELECT title FROM services WHERE id=?', cert.service_id).title}»`;
}
