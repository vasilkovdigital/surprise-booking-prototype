import { get, all, run, tx } from '../db.js';
import { resolveBuyer } from '../auth.js';
import { strict } from '../config.js';
import { get_, post, html, redirect, flash, guard } from '../router.js';
import { render, esc, money, authBlock, calendar, slotLabel, statusBadge, steps, bookingSteps } from '../views.js';
import { slotsForService } from '../slots.js';
import {
  createBooking, getBooking, canClientChange, cancelBooking, rescheduleBooking, hasIntegration,
  freeCancelHours, confirmTimeoutHours,
} from '../booking.js';
import { humanDT, humanDate, fmtDT } from '../time.js';
import { formatCode, certificateTitle } from '../gifts.js';

function orderService(ctx) {
  const s = get('SELECT * FROM services WHERE id=?', ctx.params.id);
  if (!s) return {};
  const p = get('SELECT * FROM partners WHERE id=?', s.partner_id);
  return { s, p };
}

// ---- страница брони клиента ----
function ownBooking(ctx) {
  const r = guard(ctx);
  if (r) return { r };
  const b = getBooking(ctx.params.id);
  if (!b || b.client_id !== ctx.user.id) return { r: redirect('/account') };
  return { b };
}

get_('/booking/:id', (ctx) => {
  const { b, r } = ownBooking(ctx);
  if (r) return r;
  const partner = get('SELECT * FROM partners WHERE id=?', b.partner_id);
  const changeable = canClientChange(b);
  let actions = '';
  if (['pending', 'confirmed'].includes(b.status)) {
    actions = changeable
      ? `<div class="row">
          <a class="btn alt" href="/booking/${b.id}/move">Перенести</a>
          <form class="inline" method="post" action="/booking/${b.id}/cancel"><button class="btn bad">Отменить</button></form>
        </div>
        <p class="muted small">Бесплатно отменить или перенести можно не позднее чем за ${freeCancelHours(partner)} ч до визита.</p>`
      : `<p class="muted">Срок бесплатной отмены и переноса (за ${freeCancelHours(partner)} ч до визита) прошел.</p>
         <p><b>Написать партнеру:</b> ${esc(b.partner_contacts || '')}</p>`;
  }
  const pendingNote = b.status === 'pending' && b.confirm_deadline
    ? `<p class="muted">Партнер подтвердит бронь до ${humanDT(b.confirm_deadline)}, иначе она будет отклонена с возвратом (имитация).</p>` : '';
  const body = `<p><a href="/account">← Мои брони</a></p>
    <h1>Бронь №${b.id}</h1><div>
      <p>${statusBadge(b)}</p>
      <p><b>${esc(b.service_title)}</b><br>${esc(b.partner_name)}<br>${humanDT(b.starts_at)}</p>
      <p class="muted small">${b.source === 'certificate' ? 'По подарочному сертификату' : `Оплачено (тест): ${money(b.service_price)}`}</p>
      ${pendingNote}${actions}
    </div>`;
  return html(render(ctx, `Бронь №${b.id}`, body, { narrow: true }));
});

post('/booking/:id/cancel', (ctx) => {
  const { b, r } = ownBooking(ctx);
  if (r) return r;
  try {
    cancelBooking(b.id, 'client');
    flash(ctx, b.source === 'order' ? 'Бронь отменена. Возврат (имитация).' : 'Бронь отменена. Сертификат снова доступен.');
  } catch (e) { flash(ctx, e.message, 'error'); }
  return redirect(`/booking/${b.id}`);
});

get_('/booking/:id/move', (ctx) => {
  const { b, r } = ownBooking(ctx);
  if (r) return r;
  if (!canClientChange(b)) { flash(ctx, 'Срок переноса прошел', 'error'); return redirect(`/booking/${b.id}`); }
  const s = get('SELECT * FROM services WHERE id=?', b.service_id);
  const until = b.certificate_id ? get('SELECT expires_at FROM certificates WHERE id=?', b.certificate_id).expires_at : null;
  const picker = `<form method="post" action="/booking/${b.id}/move">` + slotPicker({
    basePath: `/booking/${b.id}/move`, date: ctx.query.date, slots: slotsForService(s, { excludeBookingId: b.id, until }),
    renderSlot: (sl) => `<button name="slot" value="${sl.starts_at}">${slotLabel(sl)}</button>`,
  }) + '</form>';
  const body = `<p><a href="/booking/${b.id}">← Бронь №${b.id}</a></p><h1>Перенос брони</h1>
    <p class="muted">Сейчас: ${humanDT(b.starts_at)}</p><div class="card">${picker}</div>`;
  return html(render(ctx, 'Перенос', body, { narrow: true }));
});

post('/booking/:id/move', (ctx) => {
  const { b, r } = ownBooking(ctx);
  if (r) return r;
  try {
    rescheduleBooking(b.id, ctx.body.slot, 'client');
    flash(ctx, 'Бронь перенесена.');
  } catch (e) { flash(ctx, e.message, 'error'); }
  return redirect(`/booking/${b.id}`);
});

// ---- мои брони и сертификаты ----
get_('/account', (ctx) => {
  const r = guard(ctx, 'client');
  if (r) return r;
  const bookings = all(
    `SELECT b.id FROM bookings b WHERE b.client_id=? ORDER BY b.starts_at DESC`, ctx.user.id).map((x) => getBooking(x.id));
  const certs = all('SELECT * FROM certificates WHERE buyer_id=? OR recipient_id=? ORDER BY id DESC', ctx.user.id, ctx.user.id);
  const body = `<h1>Мои брони</h1>
    ${bookings.length ? bookings.map((b) => `<a class="card-link" href="/booking/${b.id}"><div class="card">
      <div class="row spread"><b>${esc(b.service_title)}</b>${statusBadge(b)}</div>
      <div class="muted small">${esc(b.partner_name)} · ${humanDT(b.starts_at)}</div></div></a>`).join('')
      : '<p class="empty">Броней пока нет. <a href="/">Выбрать впечатление</a></p>'}
    <h2>Мои сертификаты</h2>
    ${certs.length ? certs.map((c) => `<a class="card-link" href="/certificate/${c.id}"><div class="card">
      <div class="row spread"><b>${esc(certificateTitle(c))}</b><span class="badge">${{ active: 'Активен', used: 'Использован', expired: 'Истек' }[c.status]}</span></div>
      <div class="muted small">${c.buyer_id === ctx.user.id ? 'Куплен вами' : 'Получен в подарок'} · до ${humanDT(c.expires_at)}</div>
      ${c.buyer_id === ctx.user.id ? `<div class="muted small">Код: ${formatCode(c.code)}</div>` : ''}</div></a>`).join('')
      : '<p class="empty">Сертификатов нет.</p>'}`;
  return html(render(ctx, 'Мои брони', body));
});// ---- «Купить для себя»: шаг 2 «Бронирование» — слот и контакты на одной странице ----
function bookingPage(ctx, s, p, start = 0) {
  const slots = slotsForService(s);
  const picker = calendar({
    slots, selected: ctx.body.date_pick,
    renderSlot: (x) => '<label class="slotpick"><input type="radio" name="slot" value="' + x.starts_at + '"' + (ctx.body.slot === x.starts_at ? ' checked' : '') + '>' + slotLabel(x) + '</label>',
  });
  const withContacts = !ctx.user;
  const note = p.calendar_sync ? 'Бронь подтверждается сразу.' : 'Бронь подтверждает партнер вручную в течение ' + confirmTimeoutHours(p) + ' ч.';
  const nav = (inner) => '<div class="stepnav"><div><span class="gtl">Итого</span><span class="gt">' + money(s.price) + '</span></div><div class="row">' + inner + '</div></div>';
  const pay = '<button class="btn">К оплате</button>';
  const body = '<div data-wizard data-start="' + start + '" data-strict="' + (strict() ? 1 : 0) + '">' +
    '<h1>' + esc(s.title) + '</h1><p class="muted" style="margin-top:-16px">' + esc(p.name) + ' · ' + note + '</p>' +
    steps(bookingSteps(withContacts), start) +
    '<form id="co" method="post" action="/order/' + s.id + '">' +
    '<section data-step="0" data-need="slot" data-need-msg="Выберите дату и время"><h2>Дата и время</h2>' + picker + '<p class="err"></p>' +
      nav(withContacts ? '<button type="button" class="btn" data-next>Далее</button>' : pay) + '</section>' +
    (withContacts ? '<section data-step="1"><h2>Контактная информация</h2>' + authBlock(ctx.body) +
      nav('<button type="button" class="btn ghost" data-prev>Назад</button>' + pay) + '</section>' : '') +
    '</form></div>';
  return html(render(ctx, 'Бронирование', body, { narrow: true }));
}

get_('/order/:id', (ctx) => {
  const { s, p } = orderService(ctx);
  if (!s) return redirect('/');
  if (!hasIntegration(p)) return redirect(`/service/${s.id}`);
  return bookingPage(ctx, s, p);
});

post('/order/:id', (ctx) => {
  const { s, p } = orderService(ctx);
  if (!s || !hasIntegration(p)) return redirect('/');
  const slot = ctx.body.slot;
  const back = (text, step = 0) => { flash(ctx, text, 'error'); return bookingPage(ctx, s, p, step); };
  if (!slot) return back('Выберите дату и время');
  if (!slotsForService(s).some((x) => x.starts_at === slot)) return back('Этот слот уже занят, выберите другой');
  let user = ctx.user;
  const withContacts = !user;
  if (!user) {
    const r = resolveBuyer(ctx.body);
    if (r.error) return back(r.error, 1);
    user = r.user;
    if (r.demo) flash(ctx, 'Прототип: контакты не заполнены — заказ оформлен на демо-покупателя');
  }
  const id = run(
    `INSERT INTO orders (user_id,kind,amount,created_at,status,payload) VALUES (?,'booking',?,?,'draft',?)`,
    user.id, s.price, fmtDT(new Date()), JSON.stringify({ serviceId: s.id, slot, contacts: withContacts })).id;
  ctx.login(user);
  return redirect(`/pay/${id}`);
});

