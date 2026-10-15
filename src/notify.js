import { get, run } from './db.js';
import { fmtDT, humanDT } from './time.js';

export const EVENT_LABELS = {
  created: 'Создание брони',
  confirmed: 'Подтверждение',
  rejected: 'Отклонение',
  cancelled: 'Отмена',
  rescheduled: 'Перенос',
};

/** Имитация отправки: пишем в журнал, что и кому ушло бы (клиенту — email, партнеру — по его настройке). */
export function notify(event, bookingId) {
  const b = get('SELECT * FROM bookings WHERE id=?', bookingId);
  const service = get('SELECT * FROM services WHERE id=?', b.service_id);
  const partner = get('SELECT * FROM partners WHERE id=?', b.partner_id);
  const client = get('SELECT * FROM users WHERE id=?', b.client_id);
  const when = humanDT(b.starts_at);
  const base = `«${service.title}», ${when}`;
  const refund = b.refund_simulated ? ' Возврат (имитация).' : '';
  const texts = {
    created: [`Бронь №${b.id} создана: ${base}.`, `Новая бронь №${b.id} от ${client.name}: ${base}.`],
    confirmed: [`Бронь №${b.id} подтверждена: ${base}.`, `Бронь №${b.id} подтверждена: ${base}.`],
    rejected: [`Бронь №${b.id} отклонена: ${base}.${refund}`, `Бронь №${b.id} отклонена: ${base}.`],
    cancelled: [`Бронь №${b.id} отменена: ${base}.${refund}`, `Бронь №${b.id} отменена: ${base}.`],
    rescheduled: [`Бронь №${b.id} перенесена: ${base}.`, `Бронь №${b.id} перенесена на ${when}: «${service.title}», клиент ${client.name}.`],
  }[event];
  const channels = partner.notify_channel === 'both' ? ['telegram', 'email'] : [partner.notify_channel];
  const ts = fmtDT(new Date());
  const ins = (type, name, channel, text) =>
    run('INSERT INTO notification_log (created_at,event,booking_id,recipient_type,recipient_name,channel,text) VALUES (?,?,?,?,?,?,?)',
      ts, event, b.id, type, name, channel, text);
  ins('client', client.name, 'email', texts[0]);
  for (const ch of channels) ins('partner', partner.name, ch, texts[1]);
}
