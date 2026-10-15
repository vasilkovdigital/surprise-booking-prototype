import { get, run, tx, getSetting } from './db.js';
import { isSlotAvailable } from './slots.js';
import { fmtDT, parseDT, addHours } from './time.js';
import { notify } from './notify.js';

export const STATUS_LABELS = {
  pending: 'Ожидает подтверждения',
  confirmed: 'Подтверждена',
  rejected: 'Отклонена',
  cancelled: 'Отменена',
  completed: 'Завершена',
};

export const freeCancelHours = (partner) => partner.free_cancel_hours ?? Number(getSetting('default_free_cancel_hours', 24));
export const confirmTimeoutHours = (partner) => partner.confirm_timeout_hours ?? Number(getSetting('default_confirm_timeout_hours', 3));
export const hasIntegration = (partner) => partner.integration !== 'none';

export function getBooking(id) {
  return get(
    `SELECT b.*, s.title AS service_title, s.price AS service_price, p.name AS partner_name, p.contacts AS partner_contacts,
            u.name AS client_name, u.phone AS client_phone, u.email AS client_email
     FROM bookings b JOIN services s ON s.id=b.service_id JOIN partners p ON p.id=b.partner_id JOIN users u ON u.id=b.client_id
     WHERE b.id=?`, id);
}

/** Создание брони. Партнер с подключенным календарем — сразу «Подтверждена», иначе «Ожидает подтверждения». */
export function createBooking({ clientId, service, startsAt, source = 'order', certificateId = null, orderId = null, until = null }) {
  const partner = get('SELECT * FROM partners WHERE id=?', service.partner_id);
  if (!hasIntegration(partner)) throw new Error('У партнера нет онлайн-записи');
  const id = tx(() => {
    if (!isSlotAvailable(service, startsAt, { until })) throw new Error('Этот слот уже занят или недоступен');
    const auto = !!partner.calendar_sync;
    const deadline = auto ? null : fmtDT(addHours(new Date(), confirmTimeoutHours(partner)));
    return run(
      `INSERT INTO bookings (client_id,service_id,partner_id,starts_at,status,source,certificate_id,order_id,confirm_deadline,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      clientId, service.id, partner.id, startsAt, auto ? 'confirmed' : 'pending', source, certificateId, orderId, deadline, fmtDT(new Date()),
    ).id;
  });
  notify('created', id);
  if (partner.calendar_sync) notify('confirmed', id);
  return id;
}

function setStatus(id, status, extra = {}) {
  const sets = ['status=?'];
  const vals = [status];
  for (const [k, v] of Object.entries(extra)) { sets.push(`${k}=?`); vals.push(v); }
  run(`UPDATE bookings SET ${sets.join(',')} WHERE id=?`, ...vals, id);
}

export function confirmBooking(id) {
  const b = get('SELECT * FROM bookings WHERE id=?', id);
  if (b.status !== 'pending') throw new Error('Бронь не ожидает подтверждения');
  setStatus(id, 'confirmed', { confirm_deadline: null });
  notify('confirmed', id);
}

/** Отклонение (в т.ч. имитация истечения срока подтверждения). Возврат — только имитация. */
export function rejectBooking(id) {
  const b = get('SELECT * FROM bookings WHERE id=?', id);
  if (b.status !== 'pending') throw new Error('Бронь не ожидает подтверждения');
  setStatus(id, 'rejected', { refund_simulated: b.source === 'order' ? 1 : 0, confirm_deadline: null });
  releaseCertificate(b);
  notify('rejected', id);
}

export function completeBooking(id) {
  const b = get('SELECT * FROM bookings WHERE id=?', id);
  if (b.status !== 'confirmed') throw new Error('Завершить можно только подтвержденную бронь');
  setStatus(id, 'completed');
}

export function canClientChange(b) {
  if (!['pending', 'confirmed'].includes(b.status)) return false;
  const partner = get('SELECT * FROM partners WHERE id=?', b.partner_id);
  return parseDT(b.starts_at).getTime() - Date.now() >= freeCancelHours(partner) * 3600e3;
}

/** by: 'client' — только в срок; 'partner' — всегда (клиенту возврат имитируется). */
export function cancelBooking(id, by) {
  const b = get('SELECT * FROM bookings WHERE id=?', id);
  if (!['pending', 'confirmed'].includes(b.status)) throw new Error('Бронь нельзя отменить');
  if (by === 'client' && !canClientChange(b)) throw new Error('Срок бесплатной отмены прошел');
  setStatus(id, 'cancelled', { refund_simulated: b.source === 'order' ? 1 : 0, confirm_deadline: null });
  releaseCertificate(b);
  notify('cancelled', id);
}

export function rescheduleBooking(id, newStartsAt, by) {
  const b = get('SELECT * FROM bookings WHERE id=?', id);
  if (!['pending', 'confirmed'].includes(b.status)) throw new Error('Бронь нельзя перенести');
  if (by === 'client' && !canClientChange(b)) throw new Error('Срок переноса прошел');
  const service = get('SELECT * FROM services WHERE id=?', b.service_id);
  const partner = get('SELECT * FROM partners WHERE id=?', b.partner_id);
  let until = null;
  if (b.certificate_id) until = get('SELECT expires_at FROM certificates WHERE id=?', b.certificate_id).expires_at;
  tx(() => {
    if (!isSlotAvailable(service, newStartsAt, { excludeBookingId: id, until })) throw new Error('Этот слот недоступен');
    // клиент переносит бронь у партнера без календаря — нужно новое подтверждение
    if (by === 'client' && !partner.calendar_sync) {
      setStatus(id, 'pending', { starts_at: newStartsAt, confirm_deadline: fmtDT(addHours(new Date(), confirmTimeoutHours(partner))) });
    } else {
      setStatus(id, b.status, { starts_at: newStartsAt });
    }
  });
  notify('rescheduled', id);
}

// отмена/отклонение брони по сертификату возвращает сертификат в работу
function releaseCertificate(b) {
  if (!b.certificate_id) return;
  const c = get('SELECT * FROM certificates WHERE id=?', b.certificate_id);
  if (c && c.status === 'used' && c.expires_at > fmtDT(new Date())) run("UPDATE certificates SET status='active' WHERE id=?", c.id);
}
