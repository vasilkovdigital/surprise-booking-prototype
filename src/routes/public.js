import { get, all } from '../db.js';
import { checkPassword } from '../auth.js';
import { get_, post, html, redirect, flash } from '../router.js';
import { render, esc, money } from '../views.js';
import { hasIntegration } from '../booking.js';
import { EVENT_LABELS } from '../notify.js';
import { humanDT } from '../time.js';
import { homeBody, aboutBlocks } from '../home.js';
import { registerOrLogin } from '../auth.js';
import { queryItems, tilesHtml, allItems, pagerHtml } from '../catalog.js';

// ---- главная: слайдер, преимущества, каталог с фильтрами и бесконечной лентой ----
get_('/', (ctx) => html(render(ctx, 'Незабываемые впечатления', homeBody(ctx.query))));

// каталог целиком (без описаний) — браузер сам фильтрует, сортирует и листает страницы
get_('/catalog.json', () => ({ status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(allItems()) }));

// ---- карточка услуги ----
get_('/service/:id', (ctx) => {
  const s = get('SELECT * FROM services WHERE id=?', ctx.params.id);
  if (!s) return redirect('/');
  const p = get('SELECT * FROM partners WHERE id=?', s.partner_id);
  const ph = JSON.parse(s.photos || '[]');
  const desc = String(s.description || '').split(/\n+/).filter(Boolean).map((x) => `<p>${esc(x)}</p>`).join('');
  const body = `<p><a class="muted" href="/">← Каталог</a></p>
    <div class="pdp">
      <div class="pdp-pic">${ph.length ? `<img src="${esc(ph[0])}" alt="${esc(s.title)}" referrerpolicy="no-referrer">` : '<div class="c-pink" style="aspect-ratio:4/3;border-radius:12px"></div>'}
        ${ph.length > 1 ? `<div class="thumbs">${ph.slice(1).map((u) => `<img src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer">`).join('')}</div>` : ''}</div>
      <div class="pdp-info">
        <div class="muted small">${esc(s.category)} · ${esc(p.name)}</div>
        <h1>${esc(s.title)}</h1>
        <div class="pdp-price">${money(s.price)}${s.cashback ? ` <span class="cb" style="margin:0 0 0 8px">кэшбэк до ${s.cashback} руб.</span>` : ''}</div>
        <div class="row" style="margin:16px 0 8px">
          ${hasIntegration(p) ? `<a class="btn" href="/order/${s.id}">Купить сейчас</a>` : ''}
          <a class="btn gift" href="/gift/service/${s.id}">Оформить в подарок</a>
        </div>
        ${hasIntegration(p) ? '' : '<p class="muted small">Онлайн-записи у партнёра нет: сертификат активируется кодом, запись — по контактам партнёра.</p>'}
        <div class="pdp-desc">${desc}</div>
      </div></div>`;
  return html(render(ctx, s.title, body, { narrow: false }));
});

// ---- карточка набора (для себя не продается, только в подарок) ----
get_('/bundle/:id', (ctx) => {
  const b = get('SELECT * FROM bundles WHERE id=?', ctx.params.id);
  if (!b) return redirect('/');
  const items = all(
    `SELECT s.title, p.name AS partner_name FROM bundle_services bs JOIN services s ON s.id=bs.service_id
     JOIN partners p ON p.id=s.partner_id WHERE bs.bundle_id=?`, b.id);
  const body = `<p><a href="/">← Каталог</a></p>
    <div>
      <h1>${esc(b.title)}</h1><p>${esc(b.description)}</p>
      <h2>Что можно выбрать</h2>
      <ul>${items.map((i) => `<li>${esc(i.title)} <span class="muted">— ${esc(i.partner_name)}</span></li>`).join('')}</ul>
      <p class="price" style="font-size:18px">${money(b.price)}</p>
      <a class="btn gift" href="/gift/bundle/${b.id}">Оформить в подарок</a>
    </div>`;
  return html(render(ctx, b.title, body));
});

// ---- служебные страницы меню ----
const stub = (title, body) => (ctx) => html(render(ctx, title, `<h1>${title}</h1>${body}`));

get_('/search', (ctx) => {
  const q = String(ctx.query.q || '').trim();
  const res = q ? queryItems({ search: q, page: ctx.query.page }) : null;
  const body = `<h1>Поиск</h1>
    <form class="searchbar" action="/search"><input name="q" type="search" value="${esc(q)}" placeholder="Например: массаж, квесты, ужин" autofocus><button class="btn">Найти</button></form>
    <div id="sres" data-search>${res ? (res.total ? `<p class="muted">Найдено: ${res.total}</p><div class="gallery list">${tilesHtml(res.items)}</div>${pagerHtml(res.page, res.pages, { q }, '')}` : '<p class="empty">Ничего не нашлось. Попробуйте другое слово.</p>') : '<p class="muted">Введите название впечатления или ключевое слово.</p>'}</div>
    <script src="/home.js" defer></script>`;
  return html(render(ctx, 'Поиск', body));
});

// ---- вход / регистрация ----
const authTabs = (on) => `<div class="tabs"><a class="${on === 'login' ? 'on' : ''}" href="/login">Вход</a><a class="${on === 'register' ? 'on' : ''}" href="/register">Регистрация</a></div>`;

get_('/register', (ctx) => {
  const body = `<h1>Регистрация</h1>${authTabs('register')}<form method="post" action="/register">
    <input type="hidden" name="next" value="${esc(ctx.query.next || '')}">
    <div class="grid2"><label>Имя<input name="name" required></label><label>Телефон<input name="phone" type="tel" placeholder="+375 ..." required></label>
    <label>Email<input name="email" type="email" required></label><label>Дата рождения<input name="birth_date" type="date" required></label></div>
    <label>Пароль<input name="password" type="password" minlength="4" required></label>
    <button class="btn">Создать аккаунт</button></form>`;
  return html(render(ctx, 'Регистрация', body));
});

post('/register', (ctx) => {
  const r = registerOrLogin(ctx.body);
  if (r.error) { flash(ctx, r.error, 'error'); return redirect('/register'); }
  ctx.login(r.user);
  const next = ctx.body.next;
  return redirect(next && next.startsWith('/') && !next.startsWith('//') ? next : '/account');
});

get_('/login', (ctx) => {
  const body = `<h1>Вход</h1>${authTabs('login')}<form method="post" action="/login">
    <input type="hidden" name="next" value="${esc(ctx.query.next || '')}">
    <label>Email<input name="email" type="email" required></label>
    <label>Пароль<input name="password" type="password" required></label>
    <button class="btn">Войти</button>
    <p class="muted small">Тестовые аккаунты и пароль — в README (например, client1@test.by / partner-a@test.by, пароль test1234).</p>
  </form>`;
  return html(render(ctx, 'Вход', body));
});

post('/login', (ctx) => {
  const u = get('SELECT * FROM users WHERE email=?', String(ctx.body.email || '').trim().toLowerCase());
  if (!u || !checkPassword(String(ctx.body.password || ''), u.password_hash)) {
    flash(ctx, 'Неверный email или пароль', 'error');
    return redirect('/login');
  }
  ctx.login(u);
  const next = ctx.body.next;
  if (next && next.startsWith('/') && !next.startsWith('//')) return redirect(next);
  return redirect(u.role === 'partner' ? '/partner' : u.role === 'admin' ? '/admin' : '/account');
});

post('/logout', (ctx) => {
  ctx.logout();
  return redirect('/');
});

// ---- журнал уведомлений ----
get_('/notifications', (ctx) => {
  const rows = all('SELECT * FROM notification_log ORDER BY id DESC LIMIT 300');
  const body = `<h1>Журнал уведомлений</h1>
    <p class="muted">Реальной отправки нет — здесь видно, что и кому ушло бы.</p>
    ${rows.length ? `<div class="tablewrap"><table>
      <tr><th>Время</th><th>Событие</th><th>Кому</th><th>Канал</th><th>Текст</th></tr>
      ${rows.map((r) => `<tr><td>${esc(humanDT(r.created_at))}</td><td>${EVENT_LABELS[r.event]}</td>
        <td>${r.recipient_type === 'client' ? 'Клиент' : 'Партнер'}: ${esc(r.recipient_name)}</td>
        <td>${r.channel === 'telegram' ? 'Telegram' : 'Email'}</td><td>${esc(r.text)}</td></tr>`).join('')}
    </table></div>` : '<p class="empty">Пока ничего не отправлялось.</p>'}`;
  return html(render(ctx, 'Журнал уведомлений', body));
});
