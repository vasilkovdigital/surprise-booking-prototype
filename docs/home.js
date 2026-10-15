// Главная: карусель, избранное, смена фото при наведении, каталог с фильтрами и страницами (без бесконечной ленты).
// Фильтры и страницы считаются в браузере по /catalog.json теми же функциями, что и на сервере (/catalog-core.js).
(() => {
  const BASE = window.BASE || '';

  // ---------- карусель обложки ----------
  const hero = document.querySelector('[data-carousel]');
  if (hero) {
    const slides = [...hero.querySelectorAll('.hero-slide')];
    const dots = [...hero.querySelectorAll('.hero-dots i')];
    let i = 0, timer;
    const show = (n) => {
      i = (n + slides.length) % slides.length;
      slides.forEach((s, k) => s.classList.toggle('on', k === i));
      dots.forEach((d, k) => d.classList.toggle('on', k === i));
    };
    const play = () => { clearInterval(timer); timer = setInterval(() => show(i + 1), 6000); };
    hero.querySelector('.prev').addEventListener('click', () => { show(i - 1); play(); });
    hero.querySelector('.next').addEventListener('click', () => { show(i + 1); play(); });
    dots.forEach((d, k) => d.addEventListener('click', () => { show(k); play(); }));
    let sx = null;
    hero.addEventListener('pointerdown', (e) => { sx = e.clientX; });
    hero.addEventListener('pointerup', (e) => { if (sx !== null && Math.abs(e.clientX - sx) > 50) { show(i + (e.clientX < sx ? 1 : -1)); play(); } sx = null; });
    hero.addEventListener('mouseenter', () => clearInterval(timer));
    hero.addEventListener('mouseleave', () => { if (!matchMedia('(prefers-reduced-motion: reduce)').matches) play(); });
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) play();
  }

  // ---------- избранное (в браузере) ----------
  const favs = () => { try { return JSON.parse(localStorage.getItem('favs') || '[]'); } catch { return []; } };
  const saveFavs = (a) => { try { localStorage.setItem('favs', JSON.stringify(a)); } catch { /* приватный режим */ } };
  const paintFavs = (root = document) => {
    const f = favs();
    root.querySelectorAll('.fav').forEach((b) => b.classList.toggle('on', f.includes(b.dataset.fav)));
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.fav');
    if (!b) return;
    e.preventDefault();
    const f = favs(); const k = b.dataset.fav;
    saveFavs(f.includes(k) ? f.filter((x) => x !== k) : [...f, k]);
    paintFavs();
  });

  // ---------- смена фото при наведении: курсор слева направо листает слайды ----------
  document.addEventListener('mousemove', (e) => {
    const pic = e.target.closest?.('.tile .pic');
    if (!pic) return;
    const track = pic.querySelector('.track');
    const n = track.children.length;
    const r = pic.getBoundingClientRect();
    const idx = Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * n)));
    track.scrollTo({ left: idx * track.clientWidth, behavior: 'smooth' });
  });
  document.addEventListener('mouseout', (e) => {
    const pic = e.target.closest?.('.tile .pic');
    if (pic && !pic.contains(e.relatedTarget)) pic.querySelector('.track').scrollTo({ left: 0, behavior: 'smooth' });
  });
  document.addEventListener('scroll', (e) => {
    const t = e.target;
    if (!t.classList || !t.classList.contains('track')) return;
    const idx = Math.round(t.scrollLeft / t.clientWidth);
    t.closest('.pic').querySelectorAll('.dots i').forEach((d, k) => d.classList.toggle('on', k === idx));
  }, true);

  paintFavs();

  // ---------- каталог и поиск: клиентские фильтры + страницы ----------
  const form = document.getElementById('filters');
  const grid = document.getElementById('grid');
  const sres = document.getElementById('sres');
  if (!(form && grid) && !sres) return;

  let corePromise, itemsPromise;
  const load = () => {
    corePromise ||= import(`${BASE}/catalog-core.js`);
    itemsPromise ||= fetch(`${BASE}/catalog.json`).then((r) => r.json());
    return Promise.all([corePromise, itemsPromise]);
  };
  const urlQ = () => Object.fromEntries(new URLSearchParams(location.search));

  async function renderCatalog(scroll) {
    const [core, items] = await load();
    const q = urlQ();
    // состояние фильтров из адреса (на статическом хостинге страница одна и та же)
    for (const el of form.elements) {
      if (!el.name || el.name === 'page') continue;
      if (el.type === 'checkbox') el.checked = q[el.name] === '1';
      else if (el.type === 'radio') el.checked = (q[el.name] || '') === el.value;
      else el.value = q[el.name] || (el.name === 'sort' ? 'popular' : '');
    }
    document.querySelectorAll('.cat').forEach((c) => c.classList.toggle('on', (c.dataset.cat || '') === (q.cat || '')));
    const list = core.filterItems(items, q);
    const pg = core.paginate(list, q.page);
    grid.innerHTML = core.tilesHtml(pg.items, BASE);
    document.getElementById('pager').innerHTML = core.pagerHtml(pg.page, pg.pages, q);
    document.getElementById('count').textContent = `Найдено: ${pg.total}`;
    document.getElementById('empty').hidden = pg.total > 0;
    grid.scrollLeft = 0;
    paintFavs(grid);
    if (scroll) document.getElementById('catalog').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function formParams() {
    const p = new URLSearchParams();
    for (const [k, v] of new FormData(form)) if (v) p.set(k, v);
    return p;
  }
  const go = (params, scroll) => {
    const s = params.toString();
    history.pushState(null, '', `${location.pathname}${s ? `?${s}` : ''}#catalog`);
    renderCatalog(scroll);
  };

  if (form && grid) {
    const pager = document.getElementById('pager');
    form.addEventListener('submit', (e) => e.preventDefault());
    form.addEventListener('change', () => go(formParams(), false));
    document.querySelectorAll('.cat').forEach((b) => b.addEventListener('click', () => {
      form.elements.cat.value = b.dataset.cat;
      go(formParams(), false);
    }));
    pager.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-page]');
      if (!a) return;
      e.preventDefault();
      const p = formParams();
      if (Number(a.dataset.page) > 1) p.set('page', a.dataset.page);
      go(p, true);
    });
    document.getElementById('reset')?.addEventListener('click', (e) => { e.preventDefault(); go(new URLSearchParams(), false); });
    window.addEventListener('popstate', () => renderCatalog(false));
    if (location.search) renderCatalog(false);
  }

  // ---------- страница поиска ----------
  if (sres) {
    const q = urlQ();
    if (q.q) {
      load().then(([core, items]) => {
        const pg = core.paginate(core.filterItems(items, { q: q.q }), q.page);
        sres.innerHTML = pg.total
          ? `<p class="muted">Найдено: ${pg.total}</p><div class="gallery list">${core.tilesHtml(pg.items, BASE)}</div>${core.pagerHtml(pg.page, pg.pages, { q: q.q }, '')}`
          : '<p class="empty">Ничего не нашлось. Попробуйте другое слово.</p>';
        paintFavs(sres);
      });
    }
  }
})();
