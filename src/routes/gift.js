import { get, all, run, tx } from '../db.js';
import { registerOrLogin } from '../auth.js';
import { get_, post, html, redirect, flash, guard } from '../router.js';
import { render, esc, money, regFields, slotPicker, slotLabel } from '../views.js';
import { slotsForService } from '../slots.js';
import { createBooking, hasIntegration } from '../booking.js';
import { PACKAGING, checkCode, formatCode, certificateTitle, normalizeCode } from '../gifts.js';
import { humanDT, fmtDT } from '../time.js';

get_('/certificate/:id', (ctx) => {
  const r = guard(ctx);
  if (r) return r;
  const c = get('SELECT * FROM certificates WHERE id=?', ctx.params.id);
  if (!c || (c.buyer_id !== ctx.user.id && c.recipient_id !== ctx.user.id)) return redirect('/account');
  const pk = PACKAGING[c.packaging];
  const body = `<p><a href="/account">← Мои брони</a></p><div class="card">
    <h1>Подарочный сертификат</h1><p><b>${esc(certificateTitle(c))}</b></p>
    <p class="muted">Упаковка: ${pk.label}. ${pk.note}</p>
    <div class="code">${formatCode(c.code)}</div>
    <p>Действует до <b>${humanDT(c.expires_at)}</b> (3 месяца). Для активации нужен этот код.</p>
    <a class="btn" href="/activate/${c.code}">Активировать сейчас</a></div>`;
  return html(render(ctx, 'Сертификат', body));
});

// ================= активация (два этапа) =================
get_('/activate', (ctx) => {
  const body = `<h1>Активация сертификата</h1>
    <form class="card" method="post" action="/activate">
      <label>12-значный код сертификата<input name="code" inputmode="numeric" required placeholder="0000 0000 0000" value="${esc(ctx.query.code || '')}"></label>
      <button class="btn">Проверить код</button></form>`;
  return html(render(ctx, 'Активация', body));
});

post('/activate', (ctx) => {
  const r = checkCode(ctx.body.code);
  if (r.error) { flash(ctx, r.error, 'error'); return redirect('/activate'); }
  return redirect(`/activate/${r.cert.code}`);
});

function activeCert(ctx) {
  const r = checkCode(ctx.params.code);
  if (r.error) { flash(ctx, r.error, 'error'); return { out: redirect('/activate') }; }
  return { cert: r.cert };
}
const isRecipient = (ctx, cert) => ctx.user && cert.recipient_id === ctx.user.id;

function claim(ctx, cert, user) {
  run('UPDATE certificates SET recipient_id=?, activated_at=? WHERE id=?', user.id, fmtDT(new Date()), cert.id);
}

get_('/activate/:code', (ctx) => {
  const { cert, out } = activeCert(ctx);
  if (out) return out;
  const head = `<h1>Активация</h1><p class="muted">${esc(certificateTitle(cert))} · действует до ${humanDT(cert.expires_at)}</p>`;

  // этап 2: регистрация получателя
  if (!isRecipient(ctx, cert)) {
    if (cert.recipient_id) {
      flash(ctx, 'Сертификат уже активирован другим получателем. Войдите под его аккаунтом.', 'error');
      return redirect(`/login?next=/activate/${cert.code}`);
    }
    if (ctx.user?.role === 'client' && ctx.user.birth_date) {
      return html(render(ctx, 'Активация', `${head}
        <form class="card" method="post" action="/activate/${cert.code}/claim">
          <h3>Этап 2. Получатель</h3><p>Сертификат будет активирован на аккаунт <b>${esc(ctx.user.name)}</b> (${esc(ctx.user.email)}).</p>
          <button class="btn">Активировать</button></form>`));
    }
    return html(render(ctx, 'Активация', `${head}
      <form class="card" method="post" action="/activate/${cert.code}/register">
        <h3>Этап 2. Регистрация получателя</h3>${regFields(ctx.body)}
        <button class="btn">Продолжить</button></form>`));
  }

  // набор: выбор одной услуги после активации
  if (cert.bundle_id && !cert.chosen_service_id) {
    const items = all(
      `SELECT s.*, p.name AS partner_name FROM bundle_services bs JOIN services s ON s.id=bs.service_id
       JOIN partners p ON p.id=s.partner_id WHERE bs.bundle_id=?`, cert.bundle_id);
    return html(render(ctx, 'Выбор услуги', `${head}
      <form class="card" method="post" action="/activate/${cert.code}/choose"><h3>Выберите одну услугу из набора</h3>
        ${items.map((s, i) => `<label class="pack"><input type="radio" name="service_id" value="${s.id}" ${i === 0 ? 'checked' : ''}>
          <span><b>${esc(s.title)}</b><br><span class="muted small">${esc(s.partner_name)}</span></span></label>`).join('')}
        <button class="btn">Выбрать</button></form>`));
  }

  const service = get('SELECT * FROM services WHERE id=?', cert.chosen_service_id || cert.service_id);
  const partner = get('SELECT * FROM partners WHERE id=?', service.partner_id);

  // нет интеграции — контакты партнера
  if (!hasIntegration(partner)) {
    return html(render(ctx, 'Запись по контактам', `${head}
      <div class="card"><h3>${esc(service.title)}</h3><p>Партнер ${esc(partner.name)} принимает запись напрямую. Свяжитесь с ним и назовите код сертификата.</p>
        <p><b>Контакты:</b> ${esc(partner.contacts)}</p>
        <div class="code">${formatCode(cert.code)}</div>
        <form method="post" action="/activate/${cert.code}/finish"><button class="btn">Я записался(лась)</button></form>
        <p class="muted small">Кнопка отметит сертификат как использованный.</p></div>`));
  }

  // есть интеграция — календарь в пределах срока сертификата
  const picker = `<form method="post" action="/activate/${cert.code}/book">` + slotPicker({
    basePath: `/activate/${cert.code}`, date: ctx.query.date, slots: slotsForService(service, { until: cert.expires_at, horizonDays: 100 }),
    renderSlot: (sl) => `<button name="slot" value="${sl.starts_at}">${slotLabel(sl)}</button>`,
  }) + '</form>';
  return html(render(ctx, 'Выбор слота', `${head}
    <div class="card"><h3>${esc(service.title)}</h3><p class="muted">${esc(partner.name)}. Доступны даты до ${humanDT(cert.expires_at)}.</p>${picker}</div>`));
});

post('/activate/:code/register', (ctx) => {
  const { cert, out } = activeCert(ctx);
  if (out) return out;
  if (cert.recipient_id) return redirect(`/activate/${cert.code}`);
  const r = registerOrLogin(ctx.body);
  if (r.error) { flash(ctx, r.error, 'error'); return redirect(`/activate/${cert.code}`); }
  claim(ctx, cert, r.user);
  ctx.login(r.user);
  return redirect(`/activate/${cert.code}`);
});

post('/activate/:code/claim', (ctx) => {
  const { cert, out } = activeCert(ctx);
  if (out) return out;
  if (!cert.recipient_id && ctx.user?.role === 'client' && ctx.user.birth_date) claim(ctx, cert, ctx.user);
  return redirect(`/activate/${cert.code}`);
});

post('/activate/:code/choose', (ctx) => {
  const { cert, out } = activeCert(ctx);
  if (out) return out;
  if (!isRecipient(ctx, cert) || !cert.bundle_id) return redirect(`/activate/${cert.code}`);
  const ok = get('SELECT 1 FROM bundle_services WHERE bundle_id=? AND service_id=?', cert.bundle_id, Number(ctx.body.service_id));
  if (ok) run('UPDATE certificates SET chosen_service_id=? WHERE id=?', Number(ctx.body.service_id), cert.id);
  return redirect(`/activate/${cert.code}`);
});

post('/activate/:code/book', (ctx) => {
  const { cert, out } = activeCert(ctx);
  if (out) return out;
  if (!isRecipient(ctx, cert)) return redirect(`/activate/${cert.code}`);
  const service = get('SELECT * FROM services WHERE id=?', cert.chosen_service_id || cert.service_id);
  try {
    const id = tx(() => {
      const bid = createBooking({ clientId: ctx.user.id, service, startsAt: ctx.body.slot, source: 'certificate', certificateId: cert.id, until: cert.expires_at });
      run("UPDATE certificates SET status='used' WHERE id=?", cert.id);
      return bid;
    });
    flash(ctx, 'Сертификат активирован, бронь создана.');
    return redirect(`/booking/${id}`);
  } catch (e) {
    flash(ctx, e.message, 'error');
    return redirect(`/activate/${cert.code}`);
  }
});

post('/activate/:code/finish', (ctx) => {
  const { cert, out } = activeCert(ctx);
  if (out) return out;
  if (!isRecipient(ctx, cert)) return redirect(`/activate/${cert.code}`);
  run("UPDATE certificates SET status='used' WHERE id=?", cert.id);
  flash(ctx, 'Сертификат отмечен использованным. Хорошего впечатления!');
  return redirect('/account');
});
