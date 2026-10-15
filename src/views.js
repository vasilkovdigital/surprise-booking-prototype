import { get, run } from './db.js';
import { STATUS_LABELS } from './booking.js';
import { humanDate, parseDT } from './time.js';
import { strict } from './config.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const money = (n) => `${Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} руб.`;

export const statusBadge = (b) =>
  `<span class="badge st-${b.status}">${STATUS_LABELS[b.status]}</span>` +
  (b.refund_simulated ? ' <span class="badge st-refund">Возврат (имитация)</span>' : '');

/** Полная страница. flash берется (и очищается) из сессии. */
export function render(ctx, title, body, opts = {}) {
  let flash = '';
  if (ctx.sid) {
    const row = get('SELECT flash FROM sessions WHERE id=?', ctx.sid);
    if (row?.flash) {
      const f = JSON.parse(row.flash);
      flash = `<div class="flash ${f.type}">${esc(f.text)}</div>`;
      run('UPDATE sessions SET flash=NULL WHERE id=?', ctx.sid);
    }
  }
  const u = ctx.user;
  const path = ctx.url?.pathname || '/';
  const cartN = ctx.sid ? get('SELECT COUNT(*) n FROM cart_items WHERE sid=?', ctx.sid).n : 0;
  const link = (href, text, ext) => `<a href="${href}" class="${!ext && (href === '/' ? path === '/' : path.startsWith(href)) ? 'on' : ''}" ${ext ? 'target="_blank" rel="noopener"' : ''}>${text}</a>`;
  const roleLink = u?.role === 'partner' ? link('/partner', 'Кабинет') : u?.role === 'admin' ? link('/admin', 'Админ') : u?.role === 'client' ? link('/account', 'Мои брони') : '';
  const narrow = opts.narrow ?? !['/', '/notifications', '/partner', '/admin', '/account', '/search', '/blog', '/about', '/delivery', '/partners', '/contacts', '/reviews', '/legal'].some((p) => path === p || (p !== '/' && path.startsWith(p + '/')));
  return `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — Surprise.by (тест)</title>
<meta name="description" content="Surprise.by — агрегатор незабываемых впечатлений: бронируйте, дарите и делитесь.">
<link rel="icon" href="/brand/mark-confetti.svg" type="image/svg+xml">
<link rel="stylesheet" href="/style.css">
<script>document.documentElement.classList.add('js')</script>
</head><body>
<div class="test-banner">ТЕСТОВАЯ ВЕРСИЯ</div>
<header class="top" id="hdr">
  <div class="wrap bar">
    <a class="logo" href="/"><img src="/brand/logo.svg" alt="Surprise.by"></a>
    <div class="hact">
      <a class="btn hl" href="/activate">Активировать<span class="d">сертификат</span></a>
      ${u ? `<span class="who">${esc(u.name || u.email)}</span><form method="post" action="/logout" class="inline"><button class="btn alt">Выйти</button></form>`
           : '<a class="btn alt" href="/login">Вход / Регистрация</a>'}
      <a class="cartm" href="/cart" aria-label="Корзина"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3 4h2.2l2.2 11h10.2l2-8H6.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/><circle cx="9" cy="19.2" r="1.4" fill="currentColor"/><circle cx="16.5" cy="19.2" r="1.4" fill="currentColor"/></svg>${cartN ? `<span class="badge-n">${cartN}</span>` : ''}</a>
      <button type="button" class="burger" aria-label="Меню" aria-expanded="false" onclick="const h=document.getElementById('hdr');this.setAttribute('aria-expanded',h.classList.toggle('open'))">☰</button>
    </div>
  </div>
  <nav class="wrap menu">
    <div class="links">${link('/', 'Каталог впечатлений')}${link('/blog', 'Блог')}${link('/delivery', 'Оплата и доставка')}${link('/about', 'О компании')}${link('/partners', 'Партнерам')}${link('https://corp.surprise.by', 'Компаниям', true)}</div>
    <div class="tools">${roleLink}${link('/search', 'Поиск')}${u ? `<form method="post" action="/logout" class="m-only"><button class="link">Выйти (${esc(u.name || u.email)})</button></form>` : '<a class="m-only" href="/login">Вход / Регистрация</a>'}<a href="/cart" class="${path.startsWith('/cart') ? 'on' : ''}">Корзина${cartN ? ` <span class="badge-n">${cartN}</span>` : ''}</a></div>
  </nav>
</header>
<main class="wrap${narrow ? ' narrow' : ''}">${flash}${body}</main>
<footer class="foot"><div class="wrap">
  <div class="foot-grid">
    <div class="fc-brand"><img src="/brand/logo.svg" alt="Surprise.by" height="28"><p class="small muted">Незабываемые впечатления: бронируйте, дарите, делитесь.</p>
      <a class="btn tgbtn sm" href="https://t.me/wishlistsurprisebot" target="_blank" rel="noopener">Вишлист в Telegram →</a></div>
    <div><h4>Клиентам</h4><a href="/delivery">Оплата и доставка</a><a href="/reviews">Отзывы</a><a href="/activate">Активировать сертификат</a><a href="/about#why">Вопросы и ответы</a><a href="/notifications">Журнал уведомлений</a></div>
    <div><h4>О нас</h4><a href="/about">О компании</a><a href="/blog">Блог</a><a href="/contacts">Контакты</a><a href="/partners">Партнерам</a><a href="https://corp.surprise.by" target="_blank" rel="noopener">Компаниям</a></div>
    <div><h4>Каталог</h4><a href="/?cat=%D0%90%D0%BA%D1%82%D0%B8%D0%B2%D0%BD%D1%8B%D0%B9%20%D0%BE%D1%82%D0%B4%D1%8B%D1%85#catalog">Активный отдых</a><a href="/?cat=SPA%20%D0%B8%20%D0%BA%D1%80%D0%B0%D1%81%D0%BE%D1%82%D0%B0#catalog">SPA и красота</a><a href="/?cat=%D0%A2%D0%B2%D0%BE%D1%80%D1%87%D0%B5%D1%81%D1%82%D0%B2%D0%BE%20%D0%B8%20%D0%BE%D0%B1%D1%83%D1%87%D0%B5%D0%BD%D0%B8%D0%B5#catalog">Творчество и обучение</a><a href="/?cat=%D0%95%D0%B4%D0%B0%20%D0%B8%20%D1%80%D0%B5%D1%81%D1%82%D0%BE%D1%80%D0%B0%D0%BD%D1%8B#catalog">Еда и рестораны</a><a href="/?exclusive=1#catalog">Эксклюзив</a></div>
  </div>
  <div class="foot-bottom xs"><span>Прототип: оплата, календари и уведомления имитируются. Реквизиты — заглушка. ${globalThis.__BROWSER_APP__ ? '<form method="post" action="/__reset" class="inline" onsubmit="return confirm(\'Сбросить все данные прототипа (брони, заказы, аккаунты)?\')"><button class="link">Сбросить данные</button></form>' : ''}</span><span><a href="/legal/offer">Публичная оферта</a> · <a href="/legal/privacy">Политика персональных данных</a></span></div>
</div></footer>
<script src="/wizard.js" defer></script>
</body></html>`;
}

/** Поля регистрации (клиент / получатель сертификата). */
export function regFields(v = {}) {
  const f = (name, label, type = 'text', extra = '') =>
    `<label>${label}<input name="${name}" type="${type}" value="${esc(v[name] ?? '')}" required ${extra}></label>`;
  return `<div class="grid2">
    ${f('name', 'Имя', 'text', 'autocomplete="name"')}
    ${f('phone', 'Телефон', 'tel', 'autocomplete="tel" placeholder="+375 ..."')}
    ${f('email', 'Email', 'email', 'autocomplete="email"')}
    ${f('birth_date', 'Дата рождения', 'date', 'max="' + new Date().toISOString().slice(0, 10) + '"')}
  </div>
  <label>Пароль (для входа в аккаунт)<input name="password" type="password" required minlength="4" autocomplete="new-password"></label>
  <p class="muted small">Если аккаунт с таким email уже есть — введите его пароль.</p>`;
}

const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const p2 = (n) => String(n).padStart(2, '0');

/**
 * Календарь с выбором дня и временем под ним. Дни без слотов неактивны.
 * renderSlot(slot) — HTML времени (радио-кнопка или submit). Переключение месяцев и дней — в wizard.js.
 */
export function calendar({ slots, selected, renderSlot }) {
  if (!slots.length) return '<p class="empty">Свободных слотов пока нет.</p>';
  const avail = [...new Set(slots.map((s) => s.date))];
  const cur = selected && avail.includes(selected) ? selected : avail[0];
  const first = parseDT(avail[0]);
  const last = parseDT(avail.at(-1));
  const availSet = new Set(avail);
  const months = [];
  for (let y = first.getFullYear(), m = first.getMonth(); y < last.getFullYear() || (y === last.getFullYear() && m <= last.getMonth());) {
    const lead = (new Date(y, m, 1).getDay() + 6) % 7; // неделя с понедельника
    const count = new Date(y, m + 1, 0).getDate();
    let cells = '<span class="day blank"></span>'.repeat(lead);
    for (let d = 1; d <= count; d++) {
      const date = `${y}-${p2(m + 1)}-${p2(d)}`;
      cells += availSet.has(date)
        ? `<label class="day"><input type="radio" name="date_pick" value="${date}" ${date === cur ? 'checked' : ''}><span>${d}</span></label>`
        : `<span class="day off"><span>${d}</span></span>`;
    }
    const key = `${y}-${p2(m + 1)}`;
    months.push(`<div class="cal-month ${cur.startsWith(key) ? 'on' : ''}" data-m="${key}" data-title="${MONTHS_NOM[m]} ${y}">
      <div class="cal-week"><span>пн</span><span>вт</span><span>ср</span><span>чт</span><span>пт</span><span>сб</span><span>вс</span></div>
      <div class="cal-grid">${cells}</div></div>`);
    if (++m > 11) { m = 0; y++; }
  }
  const times = avail.map((d) => `<div class="slotday ${d === cur ? 'on' : ''}" data-d="${d}"><p class="small muted">${humanDate(d)} — выберите время</p>
      <div class="slots">${slots.filter((s) => s.date === d).map(renderSlot).join('')}</div></div>`).join('');
  const curMonth = months.length > 1;
  return `<div class="cal">
    <div class="cal-head"><button type="button" class="cal-nav" data-cal="-1" aria-label="Предыдущий месяц">‹</button>
      <b class="cal-title">${MONTHS_NOM[parseDT(cur).getMonth()]} ${parseDT(cur).getFullYear()}</b>
      <button type="button" class="cal-nav" data-cal="1" aria-label="Следующий месяц" ${curMonth ? '' : 'disabled'}>›</button></div>
    ${months.join('')}<div class="cal-times">${times}</div></div>`;
}

/** Совместимость: выбор слота = календарь (basePath/date больше не нужны). */
export const slotPicker = ({ slots, date, renderSlot }) => calendar({ slots, selected: date, renderSlot });

export const slotLabel = (s) => (s.left > 1 ? `${s.time} <small>(мест: ${s.left})</small>` : s.time);

/** Индикатор шагов слева направо: пройденные ✓, текущий выделен, остальные видны серыми. */
export const steps = (labels, current) =>
  `<ol class="stepper">${labels.map((l, i) => `<li class="${i < current ? 'done' : i === current ? 'cur' : ''}"><span>${l}</span></li>`).join('')}</ol>`;
export const BOOKING_STEPS = ['Дата и время', 'Контакты', 'Оплата'];
export const bookingSteps = (withContacts) => (withContacts ? BOOKING_STEPS : BOOKING_STEPS.filter((l) => l !== 'Контакты'));

/** Блок «Контакты» в чекауте: новый аккаунт ИЛИ вход. Поля необязательны, пока STRICT_FORMS не включен. */
export function authBlock(v = {}) {
  const mode = v.auth === 'login' ? 'login' : 'new';
  const req = strict() ? 'required' : '';
  const f = (name, label, type = 'text', extra = '') => `<label>${label}<input name="${name}" type="${type}" value="${esc(v[name] ?? '')}" ${req} ${extra}></label>`;
  return `<div class="pills"><label class="pill"><input type="radio" name="auth" value="new" ${mode === 'new' ? 'checked' : ''}>Новый аккаунт</label>
      <label class="pill"><input type="radio" name="auth" value="login" ${mode === 'login' ? 'checked' : ''}>У меня уже есть аккаунт</label></div>
    <div class="apanel ${mode === 'new' ? 'on' : ''}" data-a="new">
      <p class="muted small">Создадим аккаунт, чтобы вы видели свои брони и сертификаты. Пароль пригодится для следующего входа.</p>
      <div class="grid2">${f('name', 'Имя', 'text', 'autocomplete="name"')}${f('phone', 'Телефон', 'tel', 'placeholder="+375 ..."')}
      ${f('email', 'Email', 'email', 'autocomplete="email"')}${f('birth_date', 'Дата рождения', 'date')}</div>
      ${f('password', 'Придумайте пароль', 'password', 'minlength="4" autocomplete="new-password"')}</div>
    <div class="apanel ${mode === 'login' ? 'on' : ''}" data-a="login">
      <p class="muted small">Войдите, чтобы заказ сохранился в вашем аккаунте.</p>
      <div class="grid2">${f('l_email', 'Email', 'email', 'autocomplete="username"')}${f('l_password', 'Пароль', 'password', 'autocomplete="current-password"')}</div></div>`;
}
