import { get, all, run, tx } from '../db.js';
import { resolveBuyer } from '../auth.js';
import { strict } from '../config.js';
import { get_, post, html, redirect, flash, guard } from '../router.js';
import { render, esc, money, authBlock, steps } from '../views.js';
import {
  PACKAGING, EXTRAS, CARD_DESIGNS, DELIVERY, HANDOVER, PICKUP_POINTS, TIME_SLOTS, deliveryCost, extrasAvailable, normExtras,
  extrasCost, extrasLabel, fulfilGiftOrder, formatCode, certificateTitle,
} from '../gifts.js';
import { createBooking, getBooking } from '../booking.js';
import { bookingSteps } from '../views.js';
import { humanDT, fmtDate, fmtDT } from '../time.js';

// ================= данные корзины: одна строка = один будущий сертификат =================
function units(ctx) {
  return all('SELECT * FROM cart_items WHERE sid=? ORDER BY id', ctx.sid).map((it) => {
    const extras = JSON.parse(it.extras || '{}');
    if (it.kind === 'service') {
      const s = get('SELECT s.*, p.name AS partner_name FROM services s JOIN partners p ON p.id=s.partner_id WHERE s.id=?', it.ref_id);
      return s && { ...it, extras, title: s.title, sub: s.partner_name, price: s.price };
    }
    const b = get('SELECT * FROM bundles WHERE id=?', it.ref_id);
    return b && { ...it, extras, title: b.title, sub: 'Набор: услугу выберет получатель', price: b.price };
  }).filter(Boolean);
}
const unitTotal = (u) => u.price + extrasCost(u.packaging, u.extras);
const goodsTotal = (us) => us.reduce((s, u) => s + unitTotal(u), 0);
const needsDelivery = (us) => us.some((u) => u.packaging !== 'digital');
const cartMode = (ctx) => get('SELECT mode FROM cart_meta WHERE sid=?', ctx.sid)?.mode ?? 'all';
const setMode = (ctx, mode) => run('INSERT INTO cart_meta (sid,mode) VALUES (?,?) ON CONFLICT(sid) DO UPDATE SET mode=excluded.mode', ctx.sid, mode);

function configFromBody(b) {
  const packaging = PACKAGING[b.packaging] ? b.packaging : 'digital';
  return { packaging, extras: normExtras(packaging, { card: b.card, text: b.text, balloons: !!b.balloons, confetti: !!b.confetti }) };
}
const applyConfig = (where, params, cfg) =>
  run(`UPDATE cart_items SET packaging=?, extras=? WHERE ${where}`, cfg.packaging, JSON.stringify(cfg.extras), ...params);

function addUnit(ctx, kind, refId) {
  const first = get('SELECT * FROM cart_items WHERE sid=? ORDER BY id LIMIT 1', ctx.sid);
  const cfg = first && cartMode(ctx) === 'all' ? { packaging: first.packaging, extras: first.extras } : { packaging: 'digital', extras: '{}' };
  run('INSERT INTO cart_items (sid,kind,ref_id,packaging,extras) VALUES (?,?,?,?,?)', ctx.sid, kind, refId, cfg.packaging, cfg.extras);
}

// «Оформить в подарок» → единица в корзину и всегда открывается страница корзины с оформлением
get_('/gift/:kind/:id', (ctx) => {
  const { kind, id } = ctx.params;
  const ok = kind === 'service' ? get('SELECT 1 FROM services WHERE id=?', id) : kind === 'bundle' ? get('SELECT 1 FROM bundles WHERE id=?', id) : null;
  if (!ok) return redirect('/');
  addUnit(ctx, kind, Number(id));
  return redirect('/cart');
});

post('/cart/product', (ctx) => {
  const { kind, ref_id: ref, op } = ctx.body;
  const rows = all('SELECT id FROM cart_items WHERE sid=? AND kind=? AND ref_id=? ORDER BY id', ctx.sid, kind, Number(ref));
  if (op === 'inc' && rows.length) addUnit(ctx, kind, Number(ref));
  if (op === 'dec' && rows.length > 1) run('DELETE FROM cart_items WHERE id=?', rows.at(-1).id);
  if (op === 'remove') run('DELETE FROM cart_items WHERE sid=? AND kind=? AND ref_id=?', ctx.sid, kind, Number(ref));
  return redirect('/cart');
});

post('/cart/mode', (ctx) => {
  const mode = ctx.body.mode === 'each' ? 'each' : 'all';
  setMode(ctx, mode);
  if (mode === 'all') {
    const first = get('SELECT * FROM cart_items WHERE sid=? ORDER BY id LIMIT 1', ctx.sid);
    if (first) run('UPDATE cart_items SET packaging=?, extras=? WHERE sid=?', first.packaging, first.extras, ctx.sid);
  }
  return redirect('/cart');
});

post('/cart/all', (ctx) => {
  applyConfig('sid=?', [ctx.sid], configFromBody(ctx.body));
  return redirect('/cart');
});

post('/cart/unit/:id', (ctx) => {
  const cfg = configFromBody(ctx.body);
  if (ctx.body.applyall) applyConfig('sid=?', [ctx.sid], cfg);
  else applyConfig('id=? AND sid=?', [ctx.params.id, ctx.sid], cfg);
  return redirect('/cart');
});

// ================= блоки страницы =================
const GIFT_STEPS = ['Подарок', 'Упаковка', 'Доставка', 'Контакты', 'Оплата'];
// вошедшему покупателю шаг «Контакты» не нужен
const giftSteps = (withContacts) => (withContacts ? GIFT_STEPS : GIFT_STEPS.filter((l) => l !== 'Контакты'));
const packCards = (value) => Object.entries(PACKAGING).map(([k, v]) => `
  <label class="pack"><input type="radio" name="packaging" value="${k}" ${value === k ? 'checked' : ''}>
    <span><b>${v.label}</b><br><span class="small">${v.note}</span></span></label>`).join('');

function extrasBlock(packaging, ex) {
  const av = extrasAvailable(packaging);
  const price = (k) => { const p = EXTRAS[k].price[packaging]; return p ? `+${money(p)}` : 'бесплатно'; };
  return `<div class="extras"><p class="small muted">Допы для упаковки «${PACKAGING[packaging].label}»</p>
    ${av.map(([k]) => {
      if (k === 'card') {
        return `<label>Открытка, ${price('card')}
          <select name="card"><option value="">Без открытки</option>${CARD_DESIGNS.map((d) => `<option ${ex.card === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></label>
          ${ex.card ? `<label>Текст на открытке<input name="text" maxlength="300" value="${esc(ex.text || '')}" placeholder="Поздравление"></label>` : ''}`;
      }
      return `<label class="pack slim"><input type="checkbox" name="${k}" ${ex[k] ? 'checked' : ''}><span>${EXTRAS[k].label} <span class="muted">${price(k)}</span></span></label>`;
    }).join('')}</div>`;
}

const stepNav = (us, { prev = false, next = 'Далее', submit = false } = {}) => `
  <div class="stepnav"><div><span class="gtl">Итого</span><span class="gt">${money(goodsTotal(us))}</span></div>
    <div class="row">${prev ? '<button type="button" class="btn ghost" data-prev>Назад</button>' : ''}
      ${submit ? `<button class="btn">${next}</button>` : `<button type="button" class="btn" data-next>${next}</button>`}</div></div>`;

function renderTop(ctx, us) {
  const mode = cartMode(ctx);
  const groups = [];
  for (const u of us) {
    const g = groups.find((x) => x.kind === u.kind && x.ref_id === u.ref_id);
    if (g) g.n++; else groups.push({ kind: u.kind, ref_id: u.ref_id, title: u.title, sub: u.sub, price: u.price, n: 1 });
  }
  const btn = (g, op, label, cls = '') => `<form method="post" action="/cart/product" class="inline"><input type="hidden" name="kind" value="${g.kind}"><input type="hidden" name="ref_id" value="${g.ref_id}"><button class="btn sm ${cls}" name="op" value="${op}">${label}</button></form>`;
  const list = groups.map((g) => `<div class="cartline">
      <div class="info"><b>${esc(g.title)}</b><div class="sub">${esc(g.sub)} · ${money(g.price)}</div></div>
      <div class="qtybox">${btn(g, 'dec', '−', 'alt')}<span>${g.n}</span>${btn(g, 'inc', '+', 'alt')}</div>
      <div class="sum price">${money(g.price * g.n)}</div>${btn(g, 'remove', 'Удалить', 'ghost')}</div>`).join('');

  const modeBtn = (m, label, hint) => `<form method="post" action="/cart/mode" class="inline"><button class="pill ${mode === m ? 'on' : ''}" name="mode" value="${m}">${label}<span class="small">${hint}</span></button></form>`;
  let pack;
  if (mode === 'all') {
    const f = us[0];
    pack = `<form method="post" action="/cart/all"><div class="packrow">${packCards(f.packaging)}</div>${extrasBlock(f.packaging, f.extras)}<noscript><button class="btn sm">Обновить</button></noscript></form>`;
  } else {
    pack = us.map((u, i) => `<form method="post" action="/cart/unit/${u.id}" class="unit">
        <div class="row spread"><b>Подарок ${i + 1}: ${esc(u.title)}</b><span class="price">${money(unitTotal(u))}</span></div>
        <div class="packrow">${packCards(u.packaging)}</div>${extrasBlock(u.packaging, u.extras)}
        <div class="row">${us.length > 1 ? '<button class="btn sm alt" name="applyall" value="1">Применить ко всем подаркам</button>' : ''}<noscript><button class="btn sm">Обновить</button></noscript></div>
      </form>`).join('');
  }
  return `<div id="top">
    <section data-step="0"><h2>Ваш подарок</h2>${list}
      <p style="margin-top:16px"><a class="btn sm alt" href="/">+ Добавить ещё</a></p>${stepNav(us)}</section>
    <section data-step="1"><h2>Упаковка и допы</h2>
      ${us.length > 1 ? `<div class="modes">${modeBtn('all', 'Одна для всех', 'одинаково для всех подарков')}${modeBtn('each', 'Каждому своя', 'отдельно для каждого подарка')}</div>` : ''}
      ${pack}${stepNav(us, { prev: true })}</section></div>`;
}

function renderSummary(us) {
  return `<div id="summary" hidden data-phys="${needsDelivery(us) ? 1 : 0}" data-goods="${goodsTotal(us)}"></div>`;
}

const REQ_ATTR = () => (strict() ? 'data-req' : '');
const POPT = (k, v, cur, label) => `<label class="pill"><input type="radio" name="${k}" value="${v}" ${cur === v ? 'checked' : ''}>${label}</label>`;

function renderCheckout(ctx, us, v = {}, start = 0) {
  const val = (k) => esc(v[k] ?? '');
  const dm = v.dm || 'pickup';
  const hv = v.hv || 'parcel';
  const tomorrow = fmtDate(new Date(Date.now() + 864e5));
  const delivery = `
    <div id="d-digital" class="note">Все сертификаты электронные: доставка не нужна. Коды придут на email и покажутся на экране после оплаты.</div>
    <div id="d-phys">
      <p class="muted">Электронные сертификаты придут на email, остальные доставим выбранным способом.</p>
      <div class="pills">${POPT('dm', 'pickup', dm, 'Самовывоз')}${POPT('dm', 'minsk', dm, `Доставка по Минску · от ${money(deliveryCost('minsk', 'parcel'))}`)}${POPT('dm', 'post', dm, `Почта по Беларуси · ${money(deliveryCost('post'))}`)}</div>
      <div class="dpanel" data-m="pickup"><div class="points">
        ${PICKUP_POINTS.map((p) => `<label class="point"><input type="radio" name="point" value="${p.id}" ${(v.point || PICKUP_POINTS[0].id) === p.id ? 'checked' : ''}>
          <span><b>${esc(p.name)}</b><br><span class="small">${esc(p.addr)}<br>${esc(p.hours)}</span></span></label>`).join('')}</div>
        <p class="small muted" style="margin-top:12px">Бесплатно. Заберете сами и вручите лично.</p></div>
      <div class="dpanel" data-m="minsk">
        <h3 style="margin-bottom:8px">Вручение</h3>
        ${Object.entries(HANDOVER).map(([k, h]) => `<label class="pack"><input type="radio" name="hv" value="${k}" ${hv === k ? 'checked' : ''}>
          <span><b>${h.label}</b> <span class="muted">· ${money(deliveryCost('minsk', k))}</span><br><span class="small">${h.note}</span></span></label>`).join('')}
        <div class="grid2" style="margin-top:16px">
          <label>Имя получателя<input name="m_name" ${REQ_ATTR()} value="${val('m_name')}"></label>
          <label>Телефон получателя<input name="m_phone" type="tel" ${REQ_ATTR()} value="${val('m_phone')}"></label>
          <label>Адрес<input name="m_addr" ${REQ_ATTR()} placeholder="Улица, дом, кв." value="${val('m_addr')}"></label>
          <label>Дата<input name="m_date" type="date" ${REQ_ATTR()} min="${tomorrow}" value="${val('m_date')}"></label>
          <label>Интервал<select name="m_time">${TIME_SLOTS.map((t) => `<option ${v.m_time === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <label>Комментарий<input name="m_comment" placeholder="Позвонить за час, домофон..." value="${val('m_comment')}"></label>
        </div></div>
      <div class="dpanel" data-m="post"><p class="small muted">Отправим посылкой по указанному адресу.</p>
        <div class="grid2">
          <label>Имя получателя<input name="p_name" ${REQ_ATTR()} value="${val('p_name')}"></label>
          <label>Телефон получателя<input name="p_phone" type="tel" ${REQ_ATTR()} value="${val('p_phone')}"></label>
          <label>Индекс<input name="p_index" ${REQ_ATTR()} value="${val('p_index')}"></label>
          <label>Адрес<input name="p_addr" ${REQ_ATTR()} placeholder="Город, улица, дом, кв." value="${val('p_addr')}"></label>
        </div></div>
    </div>`;
  const costs = JSON.stringify({ pickup: { parcel: 0, manager: 0 }, post: { parcel: deliveryCost('post'), manager: deliveryCost('post') }, minsk: { parcel: deliveryCost('minsk', 'parcel'), manager: deliveryCost('minsk', 'manager') } });
  const withContacts = !ctx.user;
  const body = `<div data-wizard data-start="${start}" data-strict="${strict() ? 1 : 0}">
    <h1>Оформление подарка</h1>
    ${steps(giftSteps(withContacts), start)}
    ${renderTop(ctx, us)}
    <form id="co" method="post" action="/checkout">
      <section data-step="2"><h2>Доставка и вручение</h2>${delivery}${withContacts ? stepNav(us, { prev: true }) : stepNav(us, { prev: true, next: 'К оплате', submit: true })}</section>
      ${withContacts ? `<section data-step="3"><h2>Контактная информация</h2>${authBlock(v)}
        ${stepNav(us, { prev: true, next: 'К оплате', submit: true })}</section>` : ''}
      ${renderSummary(us)}
    </form></div>
    <script>
      const COSTS = ${costs};
      const fmt = (n) => n.toLocaleString('ru-RU') + ' руб.';
      function show() {
        const sum = document.getElementById('summary'); const phys = sum.dataset.phys === '1';
        document.getElementById('d-digital').style.display = phys ? 'none' : 'block';
        document.getElementById('d-phys').style.display = phys ? 'block' : 'none';
        const dm = document.querySelector('input[name=dm]:checked')?.value || 'pickup';
        const hv = document.querySelector('input[name=hv]:checked')?.value || 'parcel';
        document.querySelectorAll('.dpanel').forEach((p) => {
          const on = phys && p.dataset.m === dm;
          p.classList.toggle('on', on);
          p.querySelectorAll('input[data-req]').forEach((i) => { i.required = on; });
        });
        const cur = window.wizard ? window.wizard.cur : ${start};
        const cost = phys && cur >= 2 ? COSTS[dm][hv] : 0;
        document.querySelectorAll('.gt').forEach((e) => { e.textContent = fmt(Number(sum.dataset.goods) + cost); });
        document.querySelectorAll('.gtl').forEach((e) => { e.textContent = cur >= 2 && phys ? 'Итого с доставкой' : 'Итого'; });
      }
      async function live(form, submitter) {
        const fd = new URLSearchParams(new FormData(form)); if (submitter && submitter.name) fd.set(submitter.name, submitter.value);
        const r = await fetch(form.action, { method: 'POST', body: fd });
        const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
        if (!doc.getElementById('top')) return location.reload();
        const cur = window.wizard.cur;
        for (const id of ['top', 'summary']) document.getElementById(id).replaceWith(document.importNode(doc.getElementById(id), true));
        window.wizard.go(cur);
      }
      document.addEventListener('change', (e) => { const f = e.target.closest('#top form'); if (f) live(f); else show(); });
      document.addEventListener('submit', (e) => { const f = e.target.closest('#top form'); if (f) { e.preventDefault(); live(f, e.submitter); } });
      document.addEventListener('stepchange', show);
      show();
    </script>`;
  return html(render(ctx, 'Корзина и оформление', body, { narrow: true }));
}

get_('/cart', (ctx) => {
  const us = units(ctx);
  if (!us.length) {
    return html(render(ctx, 'Корзина', `<h1>Корзина</h1><p class="muted">В корзине пока ничего нет. Выберите подарок в каталоге.</p><a class="btn" href="/">В каталог</a>`, { narrow: true }));
  }
  return renderCheckout(ctx, us);
});

// Прототип: пустые поля доставки заполняем заглушками, чтобы пройти флоу до оплаты
function lenientDelivery(b) {
  const d = { ...b };
  d.dm = ['pickup', 'minsk', 'post'].includes(d.dm) ? d.dm : 'pickup';
  d.point = PICKUP_POINTS.some((p) => p.id === d.point) ? d.point : PICKUP_POINTS[0].id;
  d.hv = HANDOVER[d.hv] ? d.hv : 'parcel';
  const fill = (k, v) => { if (!String(d[k] || '').trim()) d[k] = v; };
  fill('m_name', 'Получатель (демо)'); fill('m_phone', '+375290000000'); fill('m_addr', 'Минск, адрес не указан');
  fill('m_date', fmtDate(new Date(Date.now() + 864e5))); fill('m_time', TIME_SLOTS[0]);
  fill('p_name', 'Получатель (демо)'); fill('p_phone', '+375290000000'); fill('p_index', '220000'); fill('p_addr', 'Адрес не указан');
  if (d.m_date < fmtDate(new Date(Date.now() + 864e5))) d.m_date = fmtDate(new Date(Date.now() + 864e5));
  return d;
}

function readDelivery(b, us) {
  if (!strict()) b = lenientDelivery(b);
  if (!needsDelivery(us)) return { method: 'email', handover: null, info: { note: 'Электронная доставка на email' } };
  const need = (...keys) => keys.every((k) => String(b[k] || '').trim());
  if (b.dm === 'pickup') {
    const p = PICKUP_POINTS.find((x) => x.id === b.point);
    return p ? { method: 'pickup', handover: null, info: { point: `${p.name}, ${p.addr}` } } : { error: 'Выберите пункт самовывоза' };
  }
  if (b.dm === 'minsk') {
    if (!HANDOVER[b.hv]) return { error: 'Выберите вручение: посылкой или менеджером' };
    if (!need('m_name', 'm_phone', 'm_addr', 'm_date', 'm_time')) return { error: 'Заполните получателя, адрес, дату и интервал' };
    if (b.m_date < fmtDate(new Date(Date.now() + 864e5))) return { error: 'Дата — не раньше завтрашнего дня' };
    return { method: 'minsk', handover: b.hv, info: { recipient: b.m_name, phone: b.m_phone, address: b.m_addr, date: b.m_date, time: b.m_time, comment: b.m_comment || '' } };
  }
  if (b.dm === 'post') {
    if (!need('p_name', 'p_phone', 'p_index', 'p_addr')) return { error: 'Заполните получателя, индекс и адрес' };
    return { method: 'post', handover: 'parcel', info: { recipient: b.p_name, phone: b.p_phone, index: b.p_index, address: b.p_addr } };
  }
  return { error: 'Выберите способ доставки' };
}

// шаг 2 → 3: проверяем, создаем черновик заказа и идем на оплату
post('/checkout', (ctx) => {
  const us = units(ctx);
  if (!us.length) return redirect('/cart');
  const fail = (text, step) => { flash(ctx, text, 'error'); return renderCheckout(ctx, us, ctx.body, step); };
  const d = readDelivery(ctx.body, us);
  if (d.error) return fail(d.error, 2);
  let user = ctx.user;
  const withContacts = !user;
  if (!user) {
    const r = resolveBuyer(ctx.body);
    if (r.error) return fail(r.error, 3);
    user = r.user;
    if (r.demo) flash(ctx, 'Прототип: контакты не заполнены — заказ оформлен на демо-покупателя');
  }
  const cost = deliveryCost(d.method, d.handover);
  const payload = { contacts: withContacts, units: us.map((u) => ({ kind: u.kind, ref_id: u.ref_id, title: u.title, packaging: u.packaging, extras: u.extras, price: unitTotal(u) })) };
  const id = run(
    `INSERT INTO orders (user_id,kind,amount,created_at,delivery_method,delivery_info,delivery_cost,status,payload) VALUES (?,?,?,?,?,?,?,'draft',?)`,
    user.id, 'gift', goodsTotal(us) + cost, fmtDT(new Date()), d.method, JSON.stringify({ ...d.info, handover: d.handover }), cost, JSON.stringify(payload)).id;
  ctx.login(user);
  return redirect(`/pay/${id}`);
});

// ================= шаг «Оплата» (общий для брони и подарка) =================
const deliveryText = (o) => {
  const i = JSON.parse(o.delivery_info || '{}');
  if (o.delivery_method === 'email') return 'Электронные сертификаты — на ваш email и на экран';
  if (o.delivery_method === 'pickup') return `Самовывоз: ${i.point}`;
  if (o.delivery_method === 'minsk') return `Минск, вручение ${HANDOVER[i.handover].label.toLowerCase()}: ${i.recipient}, ${i.phone}, ${i.address}, ${i.date} ${i.time}${i.comment ? ' (' + i.comment + ')' : ''}`;
  if (o.delivery_method === 'post') return `Почта: ${i.recipient}, ${i.phone}, ${i.index}, ${i.address}`;
  return '';
};

function ownDraft(ctx) {
  const r = guard(ctx);
  if (r) return { r };
  const o = get('SELECT * FROM orders WHERE id=?', ctx.params.id);
  if (!o || o.user_id !== ctx.user.id) return { r: redirect('/account') };
  return { o };
}

get_('/pay/:id', (ctx) => {
  const { o, r } = ownDraft(ctx);
  if (r) return r;
  if (o.status === 'paid') return redirect(o.kind === 'gift' ? `/gift-order/${o.id}` : '/account');
  const p = JSON.parse(o.payload);
  let detail;
  if (o.kind === 'booking') {
    const s = get('SELECT s.*, pr.name AS partner_name FROM services s JOIN partners pr ON pr.id=s.partner_id WHERE s.id=?', p.serviceId);
    detail = `<div class="sumrow"><span>${esc(s.title)}<br><span class="muted small">${esc(s.partner_name)} · ${humanDT(p.slot)}</span></span><span>${money(s.price)}</span></div>`;
  } else {
    const rows = new Map();
    for (const u of p.units) { const k = JSON.stringify([u.kind, u.ref_id, u.packaging, u.extras]); const r2 = rows.get(k) || { u, n: 0 }; r2.n++; rows.set(k, r2); }
    detail = [...rows.values()].map(({ u, n }) => `<div class="sumrow"><span>${esc(u.title)} × ${n}<br><span class="muted small">${PACKAGING[u.packaging].label}${extrasLabel(u.extras) ? ' · ' + esc(extrasLabel(u.extras)) : ''}</span></span><span>${money(u.price * n)}</span></div>`).join('')
      + `<div class="sumrow"><span>Доставка<br><span class="muted small">${esc(deliveryText(o))}</span></span><span>${o.delivery_cost ? money(o.delivery_cost) : 'бесплатно'}</span></div>`;
  }
  const flow = o.kind === 'booking' ? bookingSteps(p.contacts !== false) : giftSteps(p.contacts !== false);
  const body = `<h1>Оплата</h1>${steps(flow, flow.length - 1)}
    <section><h2>Ваш заказ</h2>${detail}
      <p class="small muted" style="margin-top:12px">Покупатель: ${esc(ctx.user.name)}, ${esc(ctx.user.phone || '')}, ${esc(ctx.user.email)}</p>
      <div class="total"><span>К оплате</span><span>${money(o.amount)}</span></div>
      <div class="stepnav"><a class="btn ghost" href="${o.kind === 'booking' ? `/order/${p.serviceId}` : '/cart'}">Назад</a>
        <form method="post" action="/pay/${o.id}"><button class="btn">Оплатить (тест)</button></form></div>
      <p class="muted small">Реальных платежей нет.</p></section>`;
  return html(render(ctx, 'Оплата', body, { narrow: true }));
});

post('/pay/:id', (ctx) => {
  const { o, r } = ownDraft(ctx);
  if (r) return r;
  if (o.status === 'paid') return redirect('/account');
  const p = JSON.parse(o.payload);
  try {
    if (o.kind === 'booking') {
      const service = get('SELECT * FROM services WHERE id=?', p.serviceId);
      const bid = tx(() => {
        const id = createBooking({ clientId: o.user_id, service, startsAt: p.slot, orderId: o.id });
        run("UPDATE orders SET status='paid' WHERE id=?", o.id);
        return id;
      });
      flash(ctx, 'Оплата прошла (тест). Бронь создана.');
      return redirect(`/booking/${bid}`);
    }
    fulfilGiftOrder(o.id);
    run('DELETE FROM cart_items WHERE sid=?', ctx.sid);
    return redirect(`/gift-order/${o.id}`);
  } catch (e) {
    flash(ctx, e.message, 'error');
    return redirect(o.kind === 'booking' ? `/order/${p.serviceId}` : '/cart');
  }
});

// ================= результат подарочного заказа =================
get_('/gift-order/:id', (ctx) => {
  const r = guard(ctx);
  if (r) return r;
  const o = get("SELECT * FROM orders WHERE id=? AND kind='gift' AND status='paid'", ctx.params.id);
  if (!o || o.user_id !== ctx.user.id) return redirect('/account');
  const certs = all('SELECT * FROM certificates WHERE order_id=? ORDER BY id', o.id);
  const body = `<h1>Заказ №${o.id} оплачен</h1>
    <p>${esc(deliveryText(o))}<br><span class="muted small">Доставка: ${o.delivery_cost ? money(o.delivery_cost) : 'бесплатно'} · Итого: ${money(o.amount)} (тест)</span></p>
    <h2 style="margin-top:32px">Сертификаты</h2>
    ${certs.map((c) => { const exo = JSON.parse(c.extras || '{}'); const ex = extrasLabel(exo);
      return `<div class="card"><div class="row spread"><b>${esc(certificateTitle(c))}</b><span class="badge">${PACKAGING[c.packaging].label}</span></div>
      ${ex ? `<div class="small muted">${esc(ex)}${exo.text ? ` · «${esc(exo.text)}»` : ''}</div>` : ''}
      <div class="code" style="margin:12px 0">${formatCode(c.code)}</div>
      <div class="small muted">Действует до ${humanDT(c.expires_at)} · <a href="/activate?code=${c.code}">Активировать</a></div></div>`; }).join('')}
    <a class="btn alt" href="/account">Мои брони и сертификаты</a>`;
  return html(render(ctx, 'Заказ', body, { narrow: true }));
});
