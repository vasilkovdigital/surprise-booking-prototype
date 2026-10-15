import { esc } from './views.js';
import { CATEGORIES, CATEGORY_MARK, FILTERS, SORTS, queryItems, tilesHtml, pagerHtml } from './catalog.js';

export const TG_URL = 'https://t.me/wishlistsurprisebot';
const COLORS = ['green', 'pink', 'purple', 'blue'];
const opt = (list, cur, any) => `${any ? `<option value="">${any}</option>` : ''}${list.map(([v, l]) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}`;

// ---------- слайдер-обложка ----------
function slider() {
  const slides = [
    { cls: 'c-blue', eyebrow: 'Surprise.by · сервис впечатлений', title: 'Незабываемые впечатления на любой повод', text: 'От SPA до полёта на воздушном шаре. Выбирайте, бронируйте онлайн, дарите и делитесь.', cta: 'Выбрать впечатление', href: '#catalog', mark: 'confetti' },
    { cls: 'c-pink', eyebrow: 'Бесплатно в Telegram', title: 'Свайпайте впечатления — собирайте вишлист', text: 'Свайп вправо — в вишлист, влево — дальше. Покажите близким, чего вам хочется.', cta: 'Открыть в Telegram', href: TG_URL, ext: true, mark: 'gift' },
    { cls: 'c-purple', eyebrow: 'Эксклюзив', title: 'Впечатления, которых нет больше нигде', text: 'Предложения партнёров на условиях, доступных только в Surprise.by.', cta: 'Смотреть эксклюзив', href: '/?exclusive=1#catalog', mark: 'smile' },
    { cls: 'c-green', eyebrow: 'Для бизнеса', title: 'Впечатления для команды и партнёров', text: 'Подберём формат, упаковку и способ вручения для сотрудников и клиентов.', cta: 'Для компаний', href: 'https://corp.surprise.by', ext: true, mark: 'confetti' },
  ];
  return `<section class="hero" data-carousel>
    <div class="hero-track">${slides.map((s, i) => `<div class="hero-slide ${s.cls} ${i === 0 ? 'on' : ''}">
      <div class="hero-text"><div class="eyebrow">${s.eyebrow}</div><h2>${s.title}</h2><p>${s.text}</p>
        <a class="btn" href="${s.href}" ${s.ext ? 'target="_blank" rel="noopener"' : ''}>${s.cta} →</a></div>
      <img class="hero-mark" src="/brand/mark-${s.mark}.svg" alt=""></div>`).join('')}</div>
    <button type="button" class="hero-nav prev" aria-label="Назад">‹</button><button type="button" class="hero-nav next" aria-label="Вперёд">›</button>
    <div class="hero-dots">${slides.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div></section>`;
}

// ---------- преимущества ----------
const ADV = [
  ['101 тыс.', 'впечатлений подарено'], ['300+', 'впечатлений в каталоге'], ['150+', 'партнёров без комиссий'], ['15 лет', 'создаём яркие эмоции'],
  ['Онлайн', 'запись на удобную дату и время'], ['Дарите', 'и делитесь впечатлениями'], ['Вручение', 'анонимно, менеджером, посылкой'], ['B2B', 'впечатления для команды и клиентов'],
];
export const advantages = () => `<section class="block"><div class="eyebrow">Почему Surprise.by</div><h2 class="big">Агрегатор впечатлений и сервис, на который можно положиться</h2>
  <div class="adv">${ADV.map(([n, t]) => `<div class="adv-i"><b>${n}</b><span>${t}</span></div>`).join('')}</div></section>`;

// ---------- компактная полоса цифр для главной ----------
const STRIP = [['101 тыс.', 'подарено'], ['300+', 'впечатлений'], ['150+', 'партнёров'], ['15 лет', 'опыта']];
const advStrip = () => `<section class="advstrip">${STRIP.map(([n, t]) => `<div><b>${n}</b><span>${t}</span></div>`).join('')}</section>`;

// ---------- яркий рекламный блок Telegram-вишлиста ----------
export const tgPromo = () => `<section class="block"><div class="tg">
  <div class="tg-text">
    <span class="tg-free">Бесплатно</span>
    <div class="eyebrow">Telegram-приложение</div>
    <h2>Вишлист впечатлений в&nbsp;Telegram</h2>
    <p>Листайте идеи как ленту: свайп вправо — в вишлист, влево — дальше. Фильтры по категории и поводу, ИИ-подбор скоро. Отправьте вишлист близким — они сразу поймут, что подарить.</p>
    <ul class="tg-list"><li>Свайпы вместо долгого поиска</li><li>Вишлист, которым легко поделиться</li><li>Бронь и подарок в пару касаний</li></ul>
    <a class="btn tg-btn" href="${TG_URL}" target="_blank" rel="noopener">Открыть в Telegram →</a>
    <div class="xs tg-url">t.me/wishlistsurprisebot</div>
  </div>
  <div class="tg-phone" aria-hidden="true">
    <div class="tg-screen">
      <div class="tg-chips"><i>Все</i><i>Полёты</i><i>SPA</i></div>
      <div class="tg-card c-blue"><img src="/brand/mark-confetti.svg" alt=""><b>Полёт на воздушном шаре</b><span>160 руб.</span></div>
      <div class="tg-actions"><i>✕</i><i class="y">♥</i></div>
      <small>Свайп вправо — в вишлист</small>
    </div>
    <span class="tg-float f1">♥ Хочу</span><span class="tg-float f2">Мимо</span>
  </div></div></section>`;

// ---------- как это работает: бронируйте, дарите, делитесь ----------
export const howItWorks = () => `<section class="block"><div class="eyebrow">Всё просто</div><h2 class="big">Бронируйте, дарите, делитесь</h2>
  <div class="num-cards">
    <div><span class="num">01</span><h3>Выберите впечатление</h3><p>Ищите по интересам, поводу, городу или бюджету. В каталоге — партнёры без комиссий и эксклюзивные предложения.</p></div>
    <div><span class="num">02</span><h3>Забронируйте для себя</h3><p>Выберите свободную дату и время в календаре и оплатите онлайн. Бронь подтвердится сразу или после ответа партнёра.</p></div>
    <div><span class="num">03</span><h3>Или подарите и поделитесь</h3><p>Оформите впечатление в подарок: электронно или в упаковке, анонимно или с вручением менеджером. Собирайте вишлист в Telegram.</p></div>
  </div></section>`;

// ---------- как вручить ----------
export const handover = () => `<section class="block"><div class="eyebrow">Подарить впечатление</div><h2 class="big">Не только что дарим, но и как дарим</h2>
  <div class="ho">
    <div class="ho-i"><h3>Анонимно</h3><p>Получатель не узнает, от кого сюрприз, пока вы сами не захотите раскрыться.</p></div>
    <div class="ho-i"><h3>Менеджером Surprise.by</h3><p>Наш менеджер лично вручит подарок в удобное время и сохранит сюрприз до последней секунды.</p></div>
    <div class="ho-i"><h3>Посылкой или самовывозом</h3><p>Доставим по Минску, отправим почтой по Беларуси или заберёте в пункте самовывоза.</p></div>
    <div class="ho-i"><h3>Удалённо</h3><p>Электронный сертификат с открыткой придёт на email за минуту, даже если вы в другом городе.</p></div>
  </div></section>`;

// ---------- каталог: эксклюзив, фильтры, сортировка ----------
function catalog(q) {
  const { total, items, page, pages } = queryItems(q);
  const cat = q.cat || '';
  const cats = `<div class="cats"><button type="button" class="cat ${cat ? '' : 'on'}" data-cat=""><span class="ico c-blue"><b>Все</b></span><em>Все</em></button>
    ${CATEGORIES.map((c, i) => `<button type="button" class="cat ${cat === c ? 'on' : ''}" data-cat="${esc(c)}"><span class="ico c-${COLORS[i % 4]}"><img src="/brand/mark-${CATEGORY_MARK[c]}.svg" alt=""></span><em>${esc(c)}</em></button>`).join('')}</div>`;
  return `<section class="block" id="catalog"><div class="eyebrow">Каталог</div><h2 class="big">Каталог впечатлений</h2>
    <form id="filters" autocomplete="off">
      <input type="hidden" name="cat" value="${esc(cat)}">
      <div class="toolbar">
        <label class="excl"><input type="checkbox" name="exclusive" value="1" ${q.exclusive === '1' ? 'checked' : ''}>✦ Эксклюзив Surprise.by</label>
        <div class="budget"><div class="pills">${FILTERS.budget.map(([v, l]) => `<label class="pill"><input type="radio" name="budget" value="${v}" ${(q.budget || '') === v ? 'checked' : ''}>${l}</label>`).join('')}</div></div>
      </div>
      ${cats}
      <details class="more" ${q.people || q.city || q.occasion || q.gender || q.age || q.new ? 'open' : ''}><summary>Больше фильтров</summary>
        <div class="fgrid">
          <label>Количество человек<select name="people">${opt(FILTERS.people, q.people, 'Любое')}</select></label>
          <label>Город<select name="city">${opt(FILTERS.city, q.city, 'Любой')}</select></label>
          <label>Повод<select name="occasion">${opt(FILTERS.occasion, q.occasion, 'Любой')}</select></label>
          <label>Пол<select name="gender">${opt(FILTERS.gender, q.gender, 'Любой')}</select></label>
          <label>Возраст<select name="age">${opt(FILTERS.age, q.age, 'Любой')}</select></label>
          <label class="chk"><input type="checkbox" name="new" value="1" ${q.new === '1' ? 'checked' : ''}> Только новинки</label>
        </div></details>
      <div class="sortbar"><span id="count" class="muted">Найдено: ${total}</span>
        <label class="inl">Сортировка <select name="sort">${opt(SORTS, q.sort || 'popular')}</select></label></div>
      <noscript><button class="btn sm">Применить фильтры</button></noscript>
    </form>
    <div class="gallery" id="grid">${tilesHtml(items)}</div>
    <p class="empty" id="empty" ${total ? 'hidden' : ''}>Ничего не нашлось. <a href="?#catalog" id="reset" class="more">Сбросить фильтры</a></p>
    <div id="pager">${pagerHtml(page, pages, q)}</div></section>`;
}

// ---------- корпоративный баннер ----------
export const corp = () => `<section class="block"><a class="corp" href="https://corp.surprise.by" target="_blank" rel="noopener">
  <div><div class="eyebrow">Для бизнеса</div><h2>Впечатления для сотрудников и партнёров</h2><p>Подберём формат, упаковку и способ вручения для вашей команды и клиентов.</p></div>
  <span class="btn">Перейти на corp.surprise.by →</span></a></section>`;

// ---------- «Почему выбирают Surprise.by»: SEO/GEO, о компании, FAQ ----------
export const FAQ = [
  ['Что такое Surprise.by?', 'Это сервис впечатлений: в одном каталоге собраны предложения партнёров — от SPA и мастер-классов до квестов и полётов. Впечатление можно забронировать для себя, подарить или добавить в вишлист.'],
  ['Как забронировать впечатление для себя?', 'Откройте карточку, нажмите «Купить сейчас», выберите свободные дату и время в календаре, укажите контакты и оплатите. Бронь подтвердится сразу или после ответа партнёра.'],
  ['Как подарить впечатление?', 'Нажмите «Оформить в подарок», выберите упаковку (электронный сертификат, конверт или коробка), способ доставки и вручения. Получатель сам выберет удобное время и запишется онлайн.'],
  ['Что такое универсальный сертификат?', 'Это сертификат на любую сумму. Получатель сам выбирает впечатление из каталога, а вы не рискуете промахнуться.'],
  ['Как работает вишлист в Telegram?', 'Откройте бота t.me/wishlistsurprisebot и листайте впечатления: свайп вправо — в вишлист, влево — дальше. Вишлистом можно поделиться с близкими. Приложение бесплатное.'],
  ['Можно ли подарить анонимно или вручить через менеджера?', 'Да. При оформлении выберите вручение: анонимно, менеджером Surprise.by в Минске или посылкой.'],
  ['Сколько действует сертификат?', 'Три месяца с момента покупки. Записаться можно только на даты в этом периоде.'],
  ['Можно ли перенести или отменить запись?', 'Да, бесплатно — не позднее чем за срок, который задал партнёр (обычно за 24 часа до визита). Позже свяжитесь с партнёром напрямую: его контакты есть в брони.'],
  ['Что такое кэшбэк?', 'Часть стоимости возвращается бонусами после того, как впечатление получено. Бонусами можно оплатить следующее.'],
  ['Как выбрать впечатление мужчине, женщине или ребёнку?', 'Используйте фильтры «Пол», «Возраст» и «Повод». Не уверены — возьмите универсальный сертификат или попросите получателя собрать вишлист.'],
  ['Можно ли заказать несколько впечатлений сразу?', 'Да. Добавьте нужное в корзину, выберите одну упаковку для всех или отдельную для каждого: допы тоже настраиваются отдельно.'],
  ['Как подключиться партнёру?', 'Оставьте заявку на странице «Партнерам». Условия обсуждаем индивидуально, комиссии за размещение нет.'],
];

export const why = () => `<section class="block why" id="why"><div class="eyebrow">О сервисе</div><h2 class="big">Впечатления вместо вещей</h2>
  <div class="seo">
    <p>Surprise.by — агрегатор впечатлений в Беларуси. В одном каталоге собраны сотни идей: активный отдых, SPA и красота, мастер-классы, рестораны, квесты и полёты. Выбирайте по поводу, возрасту, городу и бюджету, бронируйте удобное время онлайн и оплачивайте без визитов в офис.</p>
    <p>Впечатления запоминаются дольше вещей. Поэтому их удобно дарить: не нужно угадывать размер или вкус, а получатель сам выбирает время и записывается. Подарить можно электронно за минуту или в фирменной упаковке с открыткой, шарами и конфетти.</p>
    <h3>Дарите и делитесь</h3>
    <p>Мы развиваем сервис как удобный способ делиться тем, что хочется прожить. Соберите вишлист в Telegram-приложении, отправьте близким и получайте подарки, которые действительно нужны. Для вручения доступны варианты: анонимно, менеджером Surprise.by, посылкой или самовывозом.</p>
    <h3>Что получают партнёры</h3>
    <p>Партнёры управляют расписанием и бронями в личном кабинете, получают новых клиентов и не платят комиссию за размещение.</p>
  </div>
  <div class="values">
    <div class="ho-i"><h3>Миссия</h3><p>Помогать людям проживать яркие моменты и делиться ими.</p></div>
    <div class="ho-i"><h3>Эксклюзив</h3><p>Ищем впечатления, которых нет у других, и договариваемся о лучших условиях.</p></div>
    <div class="ho-i"><h3>Сервис</h3><p>Подскажем, забронируем, упакуем, доставим и вручим.</p></div>
    <div class="ho-i"><h3>Честность</h3><p>Прозрачные цены, понятные сроки отмены, партнёры без скрытых комиссий.</p></div>
    <div class="ho-i"><h3>Опыт</h3><p>15 лет создаём эмоции для людей и знаем, что работает.</p></div>
  </div></section>`;

export const faq = () => `<section class="block"><div class="eyebrow">Вопросы</div><h2 class="big">Частые вопросы</h2>
  <div class="faq">${FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div></section>`;

export const aboutBlocks = () => `${howItWorks()}${tgPromo()}${handover()}${advantages()}${corp()}${why()}${faq()}`;

export function homeBody(q) {
  // первый экран: компактная обложка + полоса цифр, снизу уже видны впечатления; вишлист-реклама и остальное — после каталога
  return `<h1 class="sr-only">Surprise.by — незабываемые впечатления</h1>${slider()}${advStrip()}${catalog(q)}${tgPromo()}${corp()}${why()}${faq()}<script src="/home.js" defer></script>`;
}
