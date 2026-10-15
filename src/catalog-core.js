// Логика витрины без зависимостей: работает и в Node (SSR), и в браузере (/catalog-core.js) — фильтры, сортировка, страницы, карточки.
export const PAGE = 12;
export const CATEGORIES = ['Активный отдых', 'SPA и красота', 'Творчество и обучение', 'Еда и рестораны', 'Впечатления премиум', 'Универсальные'];
export const CATEGORY_MARK = {
  'Активный отдых': 'confetti', 'SPA и красота': 'smile', 'Творчество и обучение': 'gift',
  'Еда и рестораны': 'smile', 'Впечатления премиум': 'gift', 'Универсальные': 'confetti',
};
export const FILTERS = {
  people: [['1', '1 человек'], ['2', '2 человека'], ['3', '3 и более']],
  budget: [['', 'любой'], ['0-50', 'до 50 руб'], ['50-100', '50-100 руб'], ['100-300', '100-300 руб'], ['300-', 'более 300 руб']],
  city: [['Минск', 'Минск'], ['Брест', 'Брест'], ['Витебск', 'Витебск'], ['Гомель', 'Гомель'], ['Гродно', 'Гродно'], ['Могилёв', 'Могилёв']],
  occasion: ['День рождения', 'Новый год', '14 февраля', '23 февраля', '8 марта', 'Свадьба', 'Годовщина', 'Юбилей'].map((o) => [o, o]),
  gender: [['f', 'Женщине'], ['m', 'Мужчине']],
  age: [['kids', 'Ребёнку'], ['teens', 'Подростку'], ['adult', 'Взрослому']],
};
export const SORTS = [['popular', 'По популярности'], ['price_asc', 'Сначала дешевле'], ['price_desc', 'Сначала дороже'], ['rating', 'По рейтингу'], ['cashback', 'По кэшбэку'], ['new', 'Новинки']];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const money = (n) => `${Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} руб.`;

/** Фильтры + сортировка. q — параметры (строки): search|q, exclusive, new, cat, people, city, occasion, gender, age, budget, sort. */
export function filterItems(all, q = {}) {
  let items = all.slice();
  const text = String(q.search ?? q.q ?? '').trim().toLowerCase();
  if (text) items = items.filter((i) => i.title.toLowerCase().includes(text) || String(i.desc || '').toLowerCase().includes(text) || String(i.category).toLowerCase().includes(text));
  if (q.exclusive === '1') items = items.filter((i) => i.exclusive);
  if (q.new === '1') items = items.filter((i) => i.is_new);
  if (q.cat) items = items.filter((i) => i.category === q.cat);
  if (q.people) items = items.filter((i) => (q.people === '3' ? i.people >= 3 : i.people === Number(q.people)));
  if (q.city) items = items.filter((i) => i.city === q.city || i.city === 'Вся Беларусь');
  if (q.occasion) items = items.filter((i) => String(i.occasion).split(',').includes(q.occasion));
  if (q.gender) items = items.filter((i) => i.gender === q.gender || i.gender === 'any');
  if (q.age) items = items.filter((i) => i.age === q.age);
  if (q.budget) {
    const [lo, hi] = q.budget.split('-');
    items = items.filter((i) => i.price >= Number(lo || 0) && (!hi || i.price <= Number(hi)));
  }
  const by = {
    popular: (a, b) => b.popularity - a.popularity,
    price_asc: (a, b) => a.price - b.price,
    price_desc: (a, b) => b.price - a.price,
    rating: (a, b) => b.rating - a.rating || b.reviews - a.reviews,
    cashback: (a, b) => b.cashback - a.cashback,
    new: (a, b) => b.is_new - a.is_new || b.popularity - a.popularity,
  }[q.sort] || ((a, b) => b.popularity - a.popularity);
  return items.sort(by);
}

/** Страница списка: page с 1. */
export function paginate(list, page, size = PAGE) {
  const pages = Math.max(1, Math.ceil(list.length / size));
  const p = Math.min(pages, Math.max(1, parseInt(page, 10) || 1));
  return { page: p, pages, total: list.length, items: list.slice((p - 1) * size, p * size) };
}

/** Параметры без page → строка запроса (пустые значения опускаются). */
export const queryString = (q, page) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v && k !== 'page') p.set(k, v);
  if (page > 1) p.set('page', page);
  const s = p.toString();
  return s ? `?${s}` : '?';
};

/** Постраничная навигация. Ссылки относительные (?…#catalog) — работают и на сервере, и на статическом хостинге. */
export function pagerHtml(page, pages, q = {}, hash = '#catalog') {
  if (pages <= 1) return '';
  const nums = [];
  for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
  const out = [];
  nums.forEach((n, k) => { if (k && n - nums[k - 1] > 1) out.push('<span class="pg-gap">…</span>'); out.push(n); });
  const link = (n, label, cls = '', aria = '') => `<a class="pg ${cls}" href="${queryString(q, n)}${hash}" data-page="${n}" ${aria}>${label}</a>`;
  return `<nav class="pager" aria-label="Страницы каталога">
    ${page > 1 ? link(page - 1, '←', 'pg-arrow', 'aria-label="Предыдущая страница"') : '<span class="pg pg-arrow off">←</span>'}
    ${out.map((n) => (typeof n === 'string' ? n : n === page ? `<span class="pg on" aria-current="page">${n}</span>` : link(n, n))).join('')}
    ${page < pages ? link(page + 1, '→', 'pg-arrow', 'aria-label="Следующая страница"') : '<span class="pg pg-arrow off">→</span>'}
  </nav>`;
}

const BADGES = { exclusive: ['b-excl', 'Эксклюзив'], only: ['b-only', 'Только в Surprise'], hit: ['b-hit', 'Хит'], new: ['b-new', 'Новинка'] };
const COLORS = ['blue', 'green', 'pink', 'purple'];
const MARKS = ['gift', 'confetti', 'smile'];
const HEART = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 21s-7-4.5-9.5-9C.9 8.500 2.800 5 6.200 5c2 0 3.500 1 4.300 2.400h3C14.300 6 15.800 5 17.800 5c3.400 0 5.300 3.500 3.700 7C19 16.500 12 21 12 21z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';

function reviewsWord(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'отзыв';
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'отзыва';
  return 'отзывов';
}

/** base — префикс путей (на статическом хостинге в подпапке); globalThis.STATIC — динамические ссылки ведут на страницу «доступно в полной версии». */
export function tileHtml(it, idx = 0, base = '') {
  const dyn = (path) => (globalThis.STATIC ? `${base}/demo/` : `${base}${path}`);
  const seed = it.id + idx;
  const ph = it.photos || [];
  const slides = ph.length
    ? ph.map((u) => `<div class="slide"><img class="ph" src="${esc(u)}" alt="${esc(it.title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></div>`).join('')
    : MARKS.map((m, k) => `<div class="slide c-${COLORS[(seed + k) % 4]}"><img src="${base}/brand/mark-${m}.svg" alt="" loading="lazy"></div>`).join('');
  const badges = [it.exclusive && 'exclusive', ...String(it.badges || '').split(',').filter(Boolean), it.is_new && 'new']
    .filter((b, i, a) => b && BADGES[b] && a.indexOf(b) === i)
    .map((b) => `<span class="bdg ${BADGES[b][0]}">${BADGES[b][1]}</span>`).join('');
  const reviews = it.reviews ? `<span class="star">★</span> <b>${Number(it.rating).toFixed(1)}</b> · ${it.reviews} ${reviewsWord(it.reviews)}` : '0 отзывов';
  const cashback = it.cashback
    ? `<span class="cb" tabindex="0">кэшбэк до ${it.cashback} руб.<span class="tip" role="tooltip"><b>Что такое кэшбэк?</b> Часть стоимости возвращается бонусами после того, как впечатление получено. Бонусами можно оплатить следующее.</span></span>`
    : '';
  const buy = it.canBuy ? `<a class="btn block" href="${dyn(`/order/${it.id}`)}">Купить сейчас</a>` : '';
  const gift = `<a class="btn gift block" href="${dyn(`/gift/${it.kind}/${it.id}`)}">Оформить в подарок</a>`;
  const href = `${base}${it.href}`;
  return `<article class="tile" data-key="${it.key}" data-price="${it.price}">
    <div class="pic"><a class="trackwrap" href="${href}" aria-label="${esc(it.title)}"><div class="track">${slides}</div></a>
      <div class="badges">${badges}</div>
      <button type="button" class="fav" data-fav="${it.key}" aria-label="В избранное">${HEART}</button>
      ${ph.length > 1 || !ph.length ? `<div class="dots">${(ph.length ? ph : MARKS).map((_, k) => `<i class="${k ? '' : 'on'}"></i>`).join('')}</div>` : ''}</div>
    <div class="body">
      <div class="meta">${reviews}</div>
      ${cashback}
      <a class="name" href="${href}">${esc(it.title)}</a>
      <div class="sub">${esc(it.sub)}</div>
      <div class="price">${money(it.price)}</div>
      <div class="btns">${buy}${gift}</div>
    </div></article>`;
}

export const tilesHtml = (items, base = '') => items.map((it, i) => tileHtml(it, i, base)).join('');
