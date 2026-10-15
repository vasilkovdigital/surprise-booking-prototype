import { all, get } from './db.js';
import { fmtDate, fmtDT } from './time.js';

const p2 = (n) => String(n).padStart(2, '0');
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = (n) => `${p2(Math.floor(n / 60))}:${p2(n % 60)}`;

/**
 * Свободные слоты услуги: недельный график партнера + ручные закрытия/открытия,
 * за вычетом занятых (pending/confirmed >= capacity). Занятые слоты не возвращаются.
 * until — верхняя граница 'YYYY-MM-DD HH:MM' (для сертификата — его срок действия).
 */
export function slotsForService(service, { horizonDays = 60, until = null, excludeBookingId = null, now = new Date() } = {}) {
  const partner = get('SELECT * FROM partners WHERE id=?', service.partner_id);
  const rules = new Map(all('SELECT * FROM schedule_rules WHERE partner_id=?', partner.id).map((r) => [r.weekday, r]));
  const overrides = all('SELECT * FROM slot_overrides WHERE partner_id=?', partner.id);
  const taken = new Map(
    all(
      `SELECT starts_at, COUNT(*) c FROM bookings
       WHERE service_id=? AND status IN ('pending','confirmed') AND id != ? GROUP BY starts_at`,
      service.id, excludeBookingId ?? -1,
    ).map((r) => [r.starts_at, r.c]),
  );
  const nowStr = fmtDT(now);
  const out = [];
  for (let i = 0; i <= horizonDays; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const date = fmtDate(d);
    const dayOv = overrides.filter((o) => o.date === date);
    const times = new Set();
    const rule = rules.get(d.getDay());
    const closedDay = dayOv.some((o) => o.state === 'closed' && !o.time);
    if (rule && !closedDay) {
      const step = partner.visit_min;
      for (let t = toMin(rule.start); t + step <= toMin(rule.end); t += step) {
        if (rule.break_start && rule.break_end && t < toMin(rule.break_end) && t + step > toMin(rule.break_start)) continue;
        times.add(fromMin(t));
      }
    }
    for (const o of dayOv) {
      if (!o.time) continue;
      if (o.state === 'closed') times.delete(o.time);
      else times.add(o.time);
    }
    for (const time of [...times].sort()) {
      const starts_at = `${date} ${time}`;
      if (starts_at <= nowStr) continue;
      if (until && starts_at > until) continue;
      const left = service.capacity - (taken.get(starts_at) || 0);
      if (left > 0) out.push({ date, time, starts_at, left });
    }
  }
  return out;
}

export function isSlotAvailable(service, startsAt, opts = {}) {
  return slotsForService(service, { horizonDays: 130, ...opts }).some((s) => s.starts_at === startsAt);
}
