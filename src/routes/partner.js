import { get, all, run } from '../db.js';
import { get_, post, html, redirect, flash, guard } from '../router.js';
import { render, esc, money, slotPicker, slotLabel, statusBadge } from '../views.js';
import { slotsForService } from '../slots.js';
import {
  STATUS_LABELS, getBooking, confirmBooking, rejectBooking, cancelBooking, rescheduleBooking, completeBooking,
  freeCancelHours, confirmTimeoutHours,
} from '../booking.js';
import { humanDT, humanDate, DAY_NAMES } from '../time.js';

const partnerOf = (ctx) => get('SELECT * FROM partners WHERE user_id=?', ctx.user.id);

function tabs(active) {
  const t = [['/partner', 'Брони'], ['/partner/services', 'Услуги'], ['/partner/schedule', 'График'], ['/partner/settings', 'Настройки']];
  return `<div class="tabs">${t.map(([h, n]) => `<a class="${h === active ? 'on' : ''}" href="${h}">${n}</a>`).join('')}</div>`;
}

/** Обертка: проверка роли + загрузка партнера. */
function pg(handler) {
  return (ctx) => {
    const r = guard(ctx, 'partner');
    if (r) return r;
    const partner = partnerOf(ctx);
    if (!partner) return redirect('/');
    return handler(ctx, partner);
  };
}
const ownBooking = (ctx, partner) => {
  const b = getBooking(ctx.params.id);
  return b && b.partner_id === partner.id ? b : null;
};

// ================= брони =================
get_('/partner', pg((ctx, partner) => {
  const status = ctx.query.status || '';
  const ids = all(
    `SELECT id FROM bookings WHERE partner_id=? ${STATUS_LABELS[status] ? 'AND status=?' : ''} ORDER BY starts_at DESC`,
    ...[partner.id, ...(STATUS_LABELS[status] ? [status] : [])]);
  const list = ids.map((r) => getBooking(r.id));
  const filters = [['', 'Все'], ...Object.entries(STATUS_LABELS)]
    .map(([k, n]) => `<a class="chip ${k === status ? 'on' : ''}" href="/partner${k ? '?status=' + k : ''}">${n}</a>`).join('');
  const btn = (b, act, label, cls = '') =>
    `<form class="inline" method="post" action="/partner/booking/${b.id}/${act}"><button class="btn sm ${cls}">${label}</button></form>`;
  const card = (b) => `<div class="card">
    <div class="row spread"><b>№${b.id} · ${esc(b.service_title)}</b>${statusBadge(b)}</div>
    <div>${humanDT(b.starts_at)}</div>
    <div class="muted small">${esc(b.client_name)} · ${esc(b.client_phone)} · ${esc(b.client_email)}</div>
    ${b.status === 'pending' && b.confirm_deadline ? `<div class="small muted">Подтвердить до ${humanDT(b.confirm_deadline)}</div>` : ''}
    <div class="row" style="margin-top:10px">
      ${b.status === 'pending' ? btn(b, 'confirm', 'Подтвердить', 'ok') + btn(b, 'reject', 'Отклонить', 'bad') + btn(b, 'expire', 'Имитировать истечение срока', 'alt') : ''}
      ${['pending', 'confirmed'].includes(b.status) ? `<a class="btn sm alt" href="/partner/booking/${b.id}/move">Перенести</a>` + btn(b, 'cancel', 'Отменить', 'bad') : ''}
      ${b.status === 'confirmed' ? btn(b, 'complete', 'Завершить', 'alt') : ''}
    </div></div>`;
  return html(render(ctx, 'Кабинет', `<h1>${esc(partner.name)}</h1>${tabs('/partner')}
    <div class="chips">${filters}</div>${list.length ? list.map(card).join('') : '<p class="empty">Броней нет.</p>'}`));
}));

const actions = {
  confirm: (b) => confirmBooking(b.id),
  reject: (b) => rejectBooking(b.id),
  expire: (b) => rejectBooking(b.id), // имитация истечения срока подтверждения: «Отклонена» + «Возврат (имитация)»
  cancel: (b) => cancelBooking(b.id, 'partner'),
  complete: (b) => completeBooking(b.id),
};
const doneMsg = { confirm: 'Бронь подтверждена', reject: 'Бронь отклонена', expire: 'Срок истек: бронь отклонена, возврат (имитация)', cancel: 'Бронь отменена', complete: 'Бронь завершена' };

post('/partner/booking/:id/:action', pg((ctx, partner) => {
  const b = ownBooking(ctx, partner);
  const fn = actions[ctx.params.action];
  if (b && fn) {
    try { fn(b); flash(ctx, doneMsg[ctx.params.action]); } catch (e) { flash(ctx, e.message, 'error'); }
  }
  return redirect('/partner');
}));

get_('/partner/booking/:id/move', pg((ctx, partner) => {
  const b = ownBooking(ctx, partner);
  if (!b) return redirect('/partner');
  const s = get('SELECT * FROM services WHERE id=?', b.service_id);
  const until = b.certificate_id ? get('SELECT expires_at FROM certificates WHERE id=?', b.certificate_id).expires_at : null;
  const picker = `<form method="post" action="/partner/booking/${b.id}/move">` + slotPicker({
    basePath: `/partner/booking/${b.id}/move`, date: ctx.query.date, slots: slotsForService(s, { excludeBookingId: b.id, until }),
    renderSlot: (sl) => `<button name="slot" value="${sl.starts_at}">${slotLabel(sl)}</button>`,
  }) + '</form>';
  return html(render(ctx, 'Перенос', `<p><a href="/partner">← Брони</a></p><h1>Перенос брони №${b.id}</h1>
    <p class="muted">${esc(b.client_name)} · сейчас ${humanDT(b.starts_at)}</p><div class="card">${picker}</div>`));
}));

post('/partner/booking/:id/move', pg((ctx, partner) => {
  const b = ownBooking(ctx, partner);
  if (b) {
    try { rescheduleBooking(b.id, ctx.body.slot, 'partner'); flash(ctx, 'Бронь перенесена'); } catch (e) { flash(ctx, e.message, 'error'); }
  }
  return redirect('/partner');
}));

// ================= услуги =================
get_('/partner/services', pg((ctx, partner) => {
  const services = all('SELECT * FROM services WHERE partner_id=?', partner.id);
  const form = (s) => `<form class="card" method="post" action="/partner/services/${s.id}">
    <label>Название<input name="title" value="${esc(s.title)}" required></label>
    <label>Описание<textarea name="description" rows="3">${esc(s.description)}</textarea></label>
    <div class="grid2"><label>Цена, BYN<input name="price" type="number" min="0" step="0.01" value="${s.price}" required></label>
    <label>Вместимость слота (броней одновременно)<input name="capacity" type="number" min="1" max="100" value="${s.capacity}" required></label></div>
    <button class="btn sm">Сохранить</button></form>`;
  return html(render(ctx, 'Услуги', `<h1>${esc(partner.name)}</h1>${tabs('/partner/services')}${services.map(form).join('')}`));
}));

post('/partner/services/:id', pg((ctx, partner) => {
  const s = get('SELECT * FROM services WHERE id=? AND partner_id=?', ctx.params.id, partner.id);
  if (s) {
    const cap = Math.max(1, parseInt(ctx.body.capacity, 10) || 1);
    run('UPDATE services SET title=?, description=?, price=?, capacity=? WHERE id=?',
      String(ctx.body.title).trim() || s.title, String(ctx.body.description || ''), Math.max(0, Number(ctx.body.price) || 0), cap, s.id);
    flash(ctx, 'Услуга сохранена');
  }
  return redirect('/partner/services');
}));

// ================= график =================
get_('/partner/schedule', pg((ctx, partner) => {
  const rules = new Map(all('SELECT * FROM schedule_rules WHERE partner_id=?', partner.id).map((r) => [r.weekday, r]));
  const order = [1, 2, 3, 4, 5, 6, 0];
  const rows = order.map((wd) => {
    const r = rules.get(wd);
    const t = (name, label, val) => `<label class="tm">${label}<input type="time" name="${name}${wd}" value="${val}"></label>`;
    return `<div class="sday"><label class="dayhead"><input type="checkbox" name="on${wd}" ${r ? 'checked' : ''}><b>${DAY_NAMES[wd]}</b></label>
      ${t('start', 'С', r?.start || '10:00')}${t('end', 'До', r?.end || '18:00')}${t('bs', 'Перерыв с', r?.break_start || '')}${t('be', 'Перерыв до', r?.break_end || '')}</div>`;
  }).join('');
  const overrides = all('SELECT * FROM slot_overrides WHERE partner_id=? ORDER BY date, time', partner.id);
  const today = new Date().toISOString().slice(0, 10);
  return html(render(ctx, 'График', `<h1>${esc(partner.name)}</h1>${tabs('/partner/schedule')}
    <form class="card" method="post" action="/partner/schedule">
      <h3>Недельный график</h3>
      <label>Длительность визита, минут<input name="visit_min" type="number" min="10" max="600" step="5" value="${partner.visit_min}" required></label>
      <div class="sched">${rows}</div>
      <p><button class="btn sm">Сохранить график</button></p></form>
    <form class="card" method="post" action="/partner/overrides">
      <h3>Закрыть или открыть дату / время</h3>
      <div class="grid2"><label>Дата<input type="date" name="date" min="${today}" required></label>
      <label>Время (пусто = весь день)<input type="time" name="time"></label></div>
      <label>Действие<select name="state"><option value="closed">Закрыть</option><option value="open">Открыть (нужно время)</option></select></label>
      <button class="btn sm">Добавить</button></form>
    <h2>Ручные изменения</h2>
    ${overrides.length ? overrides.map((o) => `<div class="card row spread"><span>${o.state === 'closed' ? '⛔ Закрыто' : '✅ Открыто'}: ${humanDate(o.date)} ${o.time || 'весь день'}</span>
      <form class="inline" method="post" action="/partner/overrides/${o.id}/delete"><button class="btn sm alt">Убрать</button></form></div>`).join('')
      : '<p class="empty">Нет.</p>'}`));
}));

post('/partner/schedule', pg((ctx, partner) => {
  const b = ctx.body;
  run('UPDATE partners SET visit_min=? WHERE id=?', Math.max(10, parseInt(b.visit_min, 10) || 60), partner.id);
  run('DELETE FROM schedule_rules WHERE partner_id=?', partner.id);
  for (let wd = 0; wd < 7; wd++) {
    if (!b[`on${wd}`] || !b[`start${wd}`] || !b[`end${wd}`] || b[`start${wd}`] >= b[`end${wd}`]) continue;
    const hasBreak = b[`bs${wd}`] && b[`be${wd}`] && b[`bs${wd}`] < b[`be${wd}`];
    run('INSERT INTO schedule_rules (partner_id,weekday,start,"end",break_start,break_end) VALUES (?,?,?,?,?,?)',
      partner.id, wd, b[`start${wd}`], b[`end${wd}`], hasBreak ? b[`bs${wd}`] : null, hasBreak ? b[`be${wd}`] : null);
  }
  flash(ctx, 'График сохранен');
  return redirect('/partner/schedule');
}));

post('/partner/overrides', pg((ctx, partner) => {
  const { date, time, state } = ctx.body;
  if (!date || !['closed', 'open'].includes(state)) flash(ctx, 'Укажите дату', 'error');
  else if (state === 'open' && !time) flash(ctx, 'Для «Открыть» укажите время', 'error');
  else {
    run('INSERT INTO slot_overrides (partner_id,date,time,state) VALUES (?,?,?,?)', partner.id, date, time || null, state);
    flash(ctx, 'Добавлено');
  }
  return redirect('/partner/schedule');
}));

post('/partner/overrides/:id/delete', pg((ctx, partner) => {
  run('DELETE FROM slot_overrides WHERE id=? AND partner_id=?', ctx.params.id, partner.id);
  return redirect('/partner/schedule');
}));

// ================= настройки =================
get_('/partner/settings', pg((ctx, partner) => {
  const ch = (v, n) => `<option value="${v}" ${partner.notify_channel === v ? 'selected' : ''}>${n}</option>`;
  return html(render(ctx, 'Настройки', `<h1>${esc(partner.name)}</h1>${tabs('/partner/settings')}
    <form class="card" method="post" action="/partner/settings">
      ${partner.integration === 'cabinet' ? `<label class="pack"><input type="checkbox" name="calendar_sync" ${partner.calendar_sync ? 'checked' : ''}>
        <span><b>Календарь подключен</b><br><span class="muted small">Синхронизация имитируется. Если включено — брони подтверждаются автоматически.</span></span></label>`
        : '<p class="muted">Онлайн-запись для этого партнера не подключена (только «Оформить в подарок»).</p>'}
      <label>Бесплатная отмена/перенос клиентом — за сколько часов до визита<input name="free_cancel_hours" type="number" min="0" value="${partner.free_cancel_hours ?? ''}" placeholder="по умолчанию: ${freeCancelHours({ free_cancel_hours: null })}"></label>
      <label>Срок подтверждения брони, часов<input name="confirm_timeout_hours" type="number" min="1" value="${partner.confirm_timeout_hours ?? ''}" placeholder="по умолчанию: ${confirmTimeoutHours({ confirm_timeout_hours: null })}"></label>
      <label>Канал уведомлений<select name="notify_channel">${ch('telegram', 'Telegram')}${ch('email', 'Email')}${ch('both', 'Telegram и Email')}</select></label>
      <label>Контакты для клиентов<textarea name="contacts" rows="2">${esc(partner.contacts)}</textarea></label>
      <button class="btn sm">Сохранить</button></form>`));
}));

post('/partner/settings', pg((ctx, partner) => {
  const b = ctx.body;
  const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Math.max(0, Math.floor(Number(v))));
  const sync = partner.integration === 'cabinet' ? (b.calendar_sync ? 1 : 0) : 0;
  run('UPDATE partners SET calendar_sync=?, free_cancel_hours=?, confirm_timeout_hours=?, notify_channel=?, contacts=? WHERE id=?',
    sync, num(b.free_cancel_hours), num(b.confirm_timeout_hours) || null,
    ['telegram', 'email', 'both'].includes(b.notify_channel) ? b.notify_channel : 'email', String(b.contacts || ''), partner.id);
  flash(ctx, 'Настройки сохранены');
  return redirect('/partner/settings');
}));
