// Календарь выбора даты, переключатель «новый аккаунт / вход» и пошаговый мастер.
(() => {
  // --- календарь: месяцы и дни ---
  document.querySelectorAll('.cal').forEach((cal) => {
    const months = [...cal.querySelectorAll('.cal-month')];
    const title = cal.querySelector('.cal-title');
    const nav = [...cal.querySelectorAll('.cal-nav')];
    let mi = Math.max(0, months.findIndex((m) => m.classList.contains('on')));
    const showMonth = (i) => {
      mi = Math.min(Math.max(i, 0), months.length - 1);
      months.forEach((m, k) => m.classList.toggle('on', k === mi));
      title.textContent = months[mi].dataset.title;
      nav[0].disabled = mi === 0; nav[1].disabled = mi === months.length - 1;
    };
    const showDay = () => {
      const d = cal.querySelector('input[name=date_pick]:checked')?.value;
      cal.querySelectorAll('.slotday').forEach((x) => x.classList.toggle('on', x.dataset.d === d));
    };
    nav.forEach((b) => b.addEventListener('click', () => showMonth(mi + Number(b.dataset.cal))));
    cal.addEventListener('change', (e) => { if (e.target.name === 'date_pick') showDay(); });
    showMonth(mi); showDay();
  });

  // --- контакты: новый аккаунт / вход ---
  const showAuth = () => {
    const a = document.querySelector('input[name=auth]:checked')?.value || 'new';
    document.querySelectorAll('.apanel').forEach((p) => p.classList.toggle('on', p.dataset.a === a));
  };
  document.addEventListener('change', (e) => { if (e.target.name === 'auth') showAuth(); });
  showAuth();
})();

// Пошаговый мастер: все шаги видны в индикаторе слева направо, открывается один. Назад — свободно, вперед — после проверки шага.
(() => {
  const root = document.querySelector('[data-wizard]');
  if (!root) return;
  const items = [...document.querySelectorAll('.stepper li')];
  let cur = Number(root.dataset.start || 0);
  const stepEl = (n) => root.querySelector(`[data-step="${n}"]`);
  const strictMode = root.dataset.strict === '1';
  const last = Math.max(...[...root.querySelectorAll('[data-step]')].map((e) => Number(e.dataset.step)));

  function go(n) {
    cur = n;
    root.querySelectorAll('[data-step]').forEach((e) => e.classList.toggle('on', Number(e.dataset.step) === n));
    items.forEach((li, i) => { li.classList.toggle('cur', i === n); li.classList.toggle('done', i < n); });
    window.scrollTo({ top: 0 });
    root.dispatchEvent(new CustomEvent('stepchange', { detail: n, bubbles: true }));
  }

  function valid(n) {
    const el = stepEl(n);
    if (!el) return true;
    const err = el.querySelector('.err');
    if (err) err.textContent = '';
    const need = el.dataset.need;
    if (need && !root.querySelector(`input[name="${need}"]:checked`)) {
      if (err) err.textContent = el.dataset.needMsg || 'Выберите вариант';
      return false;
    }
    for (const inp of el.querySelectorAll('input, select, textarea')) {
      if (strictMode && inp.offsetParent !== null && !inp.checkValidity()) { inp.reportValidity(); return false; }
    }
    return true;
  }

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-next]')) { if (valid(cur)) go(cur + 1); }
    else if (e.target.closest('[data-prev]')) go(cur - 1);
  });
  items.forEach((li, i) => li.addEventListener('click', () => { if (i < cur) go(i); }));
  // Enter в середине мастера — это «Далее», а не отправка формы
  document.addEventListener('submit', (e) => {
    if (e.target.closest('[data-wizard]') && e.target.id === 'co' && cur < last) { e.preventDefault(); if (valid(cur)) go(cur + 1); }
  }, true);

  window.wizard = { go, get cur() { return cur; } };
  go(cur);
})();
