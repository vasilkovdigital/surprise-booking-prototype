// Проверка критериев готовности из ТЗ. БД — в памяти.
process.env.DB_PATH = ':memory:';
process.env.STRICT_FORMS = '1'; // тесты 1–8 проверяют валидацию
const { test, before, after } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const { get, all, run } = await import('../src/db.js');
const { seed } = await import('../src/seed.js');
const { slotsForService } = await import('../src/slots.js');
const B = await import('../src/booking.js');
const G = await import('../src/gifts.js');
const { registerOrLogin } = await import('../src/auth.js');
const { fmtDT } = await import('../src/time.js');
const { createServer } = await import('../server.js');

const svc = (like) => get('SELECT * FROM services WHERE title LIKE ?', `%${like}%`);
const client = (n) => get('SELECT * FROM users WHERE email=?', `client${n}@test.by`);
let server, base;

before(async () => {
  seed();
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

test('1. Партнер А: бронь сразу «Подтверждена», слот исчезает', () => {
  const s = svc('квадроцикл');
  const slot = slotsForService(s)[0];
  const id = B.createBooking({ clientId: client(1).id, service: s, startsAt: slot.starts_at });
  assert.equal(get('SELECT status FROM bookings WHERE id=?', id).status, 'confirmed');
  assert.ok(!slotsForService(s).some((x) => x.starts_at === slot.starts_at));
});

test('2. Партнер Б: «Ожидает подтверждения» → подтвердить / отклонить, журнал обновляется', () => {
  const s = svc('Джип');
  const [s1, s2] = slotsForService(s);
  const a = B.createBooking({ clientId: client(1).id, service: s, startsAt: s1.starts_at });
  const b = B.createBooking({ clientId: client(2).id, service: s, startsAt: s2.starts_at });
  assert.equal(get('SELECT status FROM bookings WHERE id=?', a).status, 'pending');
  B.confirmBooking(a);
  assert.equal(get('SELECT status FROM bookings WHERE id=?', a).status, 'confirmed');
  B.rejectBooking(b); // то же, что «Имитировать истечение срока»
  const rb = get('SELECT * FROM bookings WHERE id=?', b);
  assert.equal(rb.status, 'rejected');
  assert.equal(rb.refund_simulated, 1);
  const events = all('SELECT DISTINCT event FROM notification_log WHERE booking_id IN (?,?)', a, b).map((r) => r.event);
  for (const e of ['created', 'confirmed', 'rejected']) assert.ok(events.includes(e), e);
  // партнер Б с каналом «both» → 2 записи партнеру + 1 клиенту на событие
  assert.equal(all("SELECT * FROM notification_log WHERE booking_id=? AND event='created'", a).length, 3);
  assert.ok(slotsForService(s).some((x) => x.starts_at === s2.starts_at), 'слот освободился после отклонения');
});

test('3. У партнера В нет кнопки «Купить сейчас», только «Оформить в подарок»', async () => {
  const v = svc('гончарн');
  const htmlV = await (await fetch(`${base}/service/${v.id}`)).text();
  assert.ok(!htmlV.includes('Купить сейчас'));
  assert.ok(htmlV.includes('Оформить в подарок'));
  const htmlA = await (await fetch(`${base}/service/${svc('квадроцикл').id}`)).text();
  assert.ok(htmlA.includes('Купить сейчас') && htmlA.includes('Оформить в подарок'));
  assert.ok(htmlV.length && (await (await fetch(`${base}/`)).text()).includes('ТЕСТОВАЯ ВЕРСИЯ'));
});

test('4. Подарок-набор: код 12 цифр → активация в 2 этапа → выбор услуги → слот', () => {
  const bundle = get('SELECT * FROM bundles LIMIT 1');
  const cid = G.createCertificate({ buyerId: client(1).id, bundleId: bundle.id, packaging: 'digital', amount: bundle.price });
  const cert = get('SELECT * FROM certificates WHERE id=?', cid);
  assert.match(cert.code, /^\d{12}$/);
  // этап 1
  assert.ok(G.checkCode(G.formatCode(cert.code)).cert);
  assert.ok(G.checkCode('000000000000').error);
  // этап 2: дата рождения обязательна
  const base2 = { name: 'Получатель', phone: '+375291234567', email: 'rcpt@test.by', password: 'pass1234' };
  assert.ok(registerOrLogin({ ...base2, birth_date: '' }).error);
  const { user } = registerOrLogin({ ...base2, birth_date: '1990-02-02' });
  assert.ok(user);
  run('UPDATE certificates SET recipient_id=?, chosen_service_id=? WHERE id=?', user.id, svc('Джип').id, cid);
  // слот — только в пределах срока сертификата
  const s = svc('Джип');
  const slots = slotsForService(s, { until: cert.expires_at, horizonDays: 100 });
  assert.ok(slots.length && slots.every((x) => x.starts_at <= cert.expires_at));
  const bid = B.createBooking({ clientId: user.id, service: s, startsAt: slots[3].starts_at, source: 'certificate', certificateId: cid, until: cert.expires_at });
  run("UPDATE certificates SET status='used' WHERE id=?", cid);
  assert.equal(get('SELECT status FROM bookings WHERE id=?', bid).status, 'pending');
  assert.ok(G.checkCode(cert.code).error, 'использованный код не принимается');
  // просроченный
  const old = G.createCertificate({ buyerId: client(1).id, serviceId: s.id, packaging: 'box', amount: 1 });
  run("UPDATE certificates SET expires_at='2020-01-01 00:00' WHERE id=?", old);
  assert.match(G.checkCode(get('SELECT code FROM certificates WHERE id=?', old).code).error, /истек/);
});

test('5. Вместимость 3: три брони на слот, четвертая невозможна', () => {
  const s = svc('квадроцикл');
  run('UPDATE services SET capacity=3 WHERE id=?', s.id);
  const s3 = get('SELECT * FROM services WHERE id=?', s.id);
  const slot = slotsForService(s3).find((x) => x.left === 3);
  for (let i = 0; i < 3; i++) B.createBooking({ clientId: client(1).id, service: s3, startsAt: slot.starts_at });
  assert.ok(!slotsForService(s3).some((x) => x.starts_at === slot.starts_at));
  assert.throws(() => B.createBooking({ clientId: client(2).id, service: s3, startsAt: slot.starts_at }), /занят/);
  run('UPDATE services SET capacity=1 WHERE id=?', s.id);
});

test('6. Отмена клиентом: в срок — возврат (имитация), после срока — нельзя', async () => {
  const s = svc('квадроцикл');
  const far = slotsForService(s).find((x) => new Date(x.starts_at.replace(' ', 'T')) - Date.now() > 48 * 3600e3);
  const ok = B.createBooking({ clientId: client(1).id, service: s, startsAt: far.starts_at });
  assert.equal(B.canClientChange(B.getBooking(ok)), true);
  B.cancelBooking(ok, 'client');
  const c = get('SELECT * FROM bookings WHERE id=?', ok);
  assert.equal(c.status, 'cancelled');
  assert.equal(c.refund_simulated, 1);

  const near = slotsForService(s).find((x) => new Date(x.starts_at.replace(' ', 'T')) - Date.now() < 20 * 3600e3);
  if (near) {
    const late = B.createBooking({ clientId: client(2).id, service: s, startsAt: near.starts_at });
    assert.equal(B.canClientChange(B.getBooking(late)), false);
    assert.throws(() => B.cancelBooking(late, 'client'), /Срок/);
  }
  // UI: у поздней брони нет кнопки «Отменить», есть «Написать партнеру»
  const lateId = run('INSERT INTO bookings (client_id,service_id,partner_id,starts_at,status,created_at) VALUES (?,?,?,?,?,?)',
    client(2).id, s.id, s.partner_id, fmtDT(new Date(Date.now() + 2 * 3600e3)), 'confirmed', fmtDT(new Date())).id;
  const login = await fetch(`${base}/login`, { method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'email=client2@test.by&password=test1234' });
  const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const page = await (await fetch(`${base}/booking/${lateId}`, { headers: { cookie } })).text();
  assert.ok(!page.includes('/cancel') && page.includes('Написать партнеру'));
});

const mkClient = () => {
  const jar = {};
  const call = async (p, body) => {
    const r = await fetch(base + p, { method: body ? 'POST' : 'GET', redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') },
      body: body ? new URLSearchParams(body).toString() : undefined });
    for (const s of r.headers.getSetCookie()) { const [k, v] = s.split(';')[0].split('='); jar[k] = v; }
    return { s: r.status, loc: r.headers.get('location'), t: await r.text() };
  };
  return call;
};

test('7. Флоу «Купить для себя»: бронирование (слот+контакты) → оплата → бронь', async () => {
  const call = mkClient();
  let r = await call('/order/1');
  assert.ok(r.t.includes('stepper') && r.t.includes('Дата и время') && r.t.includes('Контакты') && r.t.includes('Оплата'));
  assert.ok(r.t.includes('name="slot"') && r.t.includes('birth_date'), 'слот и контакты на одной странице');
  const slot = r.t.match(/name="slot" value="([^"]+)"/)[1];
  const reg = { name: 'Борис', phone: '+375291112233', email: 'boris@x.by', birth_date: '1990-01-01', password: '1234' };
  r = await call('/order/1', { ...reg });
  assert.ok(r.t.includes('Выберите дату и время'));
  r = await call('/order/1', { slot, ...reg });
  assert.equal(r.s, 303); assert.match(r.loc, /^\/pay\/\d+$/);
  assert.equal(get('SELECT COUNT(*) c FROM bookings WHERE client_id=(SELECT id FROM users WHERE email=?)', 'boris@x.by').c, 0, 'до оплаты брони нет');
  r = await call(r.loc); assert.ok(r.t.includes('Оплатить (тест)'));
  const pay = await call(r.t.match(/action="(\/pay\/\d+)"/)[1], {});
  assert.match(pay.loc, /^\/booking\/\d+$/);
  assert.equal(get('SELECT status FROM bookings WHERE id=?', pay.loc.split('/').pop()).status, 'confirmed');
});

test('8. Подарок: корзина с оформлением, упаковка и допы на каждый, доставка/вручение, оплата', async () => {
  const call = mkClient();
  let r = await call('/gift/service/1'); assert.equal(r.loc, '/cart');
  await call('/gift/service/1'); await call('/gift/bundle/1');
  const ids = () => all('SELECT * FROM cart_items ORDER BY id');
  assert.equal(ids().length, 3);
  r = await call('/cart');
  const pos = (s) => r.t.indexOf(s);
  assert.ok(pos('Ваш подарок') < pos('Упаковка и допы') && pos('Упаковка и допы') < pos('Доставка и вручение') && pos('Доставка и вручение') < pos('Контактная информация'));
  assert.ok(r.t.includes('Добавить ещё') && r.t.includes('Одна для всех') && r.t.includes('Каждому своя'));
  // одна для всех: коробка + шары
  await call('/cart/all', { packaging: 'box', balloons: 'on', card: 'Люблю' });
  assert.ok(ids().every((u) => u.packaging === 'box' && JSON.parse(u.extras).balloons));
  // каждому своя: допы независимы, при смене упаковки недоступные допы сбрасываются
  await call('/cart/mode', { mode: 'each' });
  const [u1, u2, u3] = ids();
  await call(`/cart/unit/${u2.id}`, { packaging: 'digital', balloons: 'on' });
  await call(`/cart/unit/${u3.id}`, { packaging: 'envelope', card: 'Ты вау', text: 'Привет' });
  const [a, b, c] = ids();
  assert.equal(a.packaging, 'box'); assert.equal(b.packaging, 'digital'); assert.deepEqual(JSON.parse(b.extras), {});
  assert.equal(JSON.parse(c.extras).card, 'Ты вау'); assert.ok(!JSON.parse(c.extras).balloons);
  // количество товара
  await call('/cart/product', { kind: 'service', ref_id: '1', op: 'inc' }); assert.equal(ids().length, 4);
  await call('/cart/product', { kind: 'service', ref_id: '1', op: 'dec' }); assert.equal(ids().length, 3);
  // вручение менеджером в Минске
  const reg = { name: 'Анна', phone: '+375291112200', email: 'anna@x.by', birth_date: '1991-01-01', password: '1234' };
  r = await call('/checkout', { dm: 'minsk', hv: 'manager', ...reg });
  assert.ok(r.t.includes('Заполните получателя'));
  r = await call('/checkout', { dm: 'minsk', hv: 'manager', m_name: 'Олег', m_phone: '+375291112211', m_addr: 'Минск, Ленина 1', m_date: '2099-01-01', m_time: '10:00–14:00', ...reg });
  assert.match(r.loc, /^\/pay\/\d+$/);
  const o = get("SELECT * FROM orders WHERE kind='gift' ORDER BY id DESC LIMIT 1");
  assert.equal(o.status, 'draft'); assert.equal(o.delivery_cost, 25);
  const before = get('SELECT COUNT(*) c FROM certificates').c;
  const pay = await call(r.loc, undefined); assert.ok(pay.t.includes('Оплатить (тест)'));
  const done = await call(r.loc, {});
  assert.match(done.loc, /^\/gift-order\/\d+$/);
  assert.equal(get('SELECT COUNT(*) c FROM certificates').c - before, 3);
  const certs = all('SELECT * FROM certificates WHERE order_id=? ORDER BY id', o.id);
  assert.deepEqual(certs.map((x) => x.packaging), ['box', 'digital', 'envelope']);
  assert.equal(JSON.parse(certs[2].extras).text, 'Привет');
  assert.equal(get('SELECT status FROM orders WHERE id=?', o.id).status, 'paid');
  assert.equal(all('SELECT * FROM cart_items').length, 0);
  // всё цифровое → доставка не нужна
  const d2 = mkClient(); await d2('/gift/service/1');
  const reg2 = { name: 'Ира', phone: '+375291112288', email: 'ira@x.by', birth_date: '1991-01-01', password: '1234' };
  const x = await d2('/checkout', { ...reg2 }); assert.match(x.loc, /^\/pay\//);
});

test('9. Прототипный режим: «К оплате» работает без заполнения; вошедшему шаг «Контакты» не нужен; календарь', async () => {
  process.env.STRICT_FORMS = '0';
  try {
    const call = mkClient();
    let r = await call('/order/1');
    assert.ok(r.t.includes('cal-grid') && r.t.includes('cal-nav'), 'календарь, а не лента');
    assert.ok(r.t.includes('Новый аккаунт') && r.t.includes('У меня уже есть аккаунт'));
    assert.ok(!r.t.includes(' required'), 'нет обязательных полей');
    const slot = r.t.match(/name="slot" value="([^"]+)"/)[1];
    r = await call('/order/1', { slot, auth: 'new' });
    assert.ok(r.loc.startsWith('/pay/'));
    assert.equal(get("SELECT u.email FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC LIMIT 1").email, 'demo-buyer@test.by');
    // теперь залогинен: контактов нет
    r = await call('/order/1');
    assert.ok(!r.t.includes('Новый аккаунт') && !r.t.includes('Контактная информация'));
    assert.ok(r.t.includes('Дата и время') && r.t.includes('К оплате'));
    // подарок без заполнения доставки и контактов
    const g = mkClient(); await g('/gift/service/1'); await g('/cart/all', { packaging: 'envelope' });
    r = await g('/checkout', { dm: 'minsk' });
    assert.ok(r.loc.startsWith('/pay/'));
    // вход существующим аккаунтом
    const l = mkClient(); await l('/gift/service/1');
    r = await l('/checkout', { auth: 'login', l_email: 'client1@test.by', l_password: 'test1234' });
    assert.equal(get("SELECT u.email FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC LIMIT 1").email, 'client1@test.by');
  } finally { process.env.STRICT_FORMS = '1'; }
});

test('10. Главная: слайдер, фильтры, эксклюзив, сортировки, страницы (без бесконечной ленты), две кнопки', async () => {
  const home = await (await fetch(base + '/')).text();
  for (const s of ['data-carousel', 'corp.surprise.by', 'Эксклюзив Surprise.by', '101 тыс.', 'Незабываемые впечатления', 'https://t.me/wishlistsurprisebot', 'Вишлист впечатлений', 'Бесплатно', 'Частые вопросы', 'Количество человек', 'name="budget"', 'name="city"', 'name="occasion"', 'name="gender"', 'name="age"', 'name="new"', 'По рейтингу', 'По кэшбэку', 'class="fav"', 'class="cb"', 'role="tooltip"', 'Купить сейчас', 'Оформить в подарок', 'class="pager"']) {
    assert.ok(home.includes(s), 'нет на главной: ' + s);
  }
  assert.ok(!home.includes('id="sentinel"') && !home.includes('Показать ещё'), 'бесконечной ленты нет');
  assert.ok((home.match(/<details>/g) || []).length >= 10, 'FAQ: больше вопросов');
  const tiles = (h) => (h.match(/<article class="tile"/g) || []).length;
  assert.equal(tiles(home), 12, '12 карточек на странице');
  const p2 = await (await fetch(base + '/?page=2')).text();
  assert.equal(tiles(p2), 12); assert.ok(p2.includes('aria-current="page">2<'));
  assert.notEqual(home.match(/data-key="([^"]+)"/)[1], p2.match(/data-key="([^"]+)"/)[1], 'страницы разные');
  const last = await (await fetch(base + '/?page=999')).text(); assert.ok(tiles(last) >= 1, 'страница за пределами → последняя');
  const json = await (await fetch(base + '/catalog.json')).json();
  assert.ok(json.length >= 300 && json[0].title && Array.isArray(json[0].photos), 'каталог для браузера');
  const core = await import('../src/catalog-core.js');
  assert.ok(core.filterItems(json, { exclusive: '1' }).length >= 3);
  assert.ok(core.filterItems(json, { budget: '0-50' }).length >= 3);
  assert.ok(core.filterItems(json, { new: '1' }).length >= 1 && core.filterItems(json, { gender: 'm' }).length >= 1);
  assert.ok(core.filterItems(json, { city: 'Минск' }).length >= 100);
  assert.ok(core.filterItems(json, { sort: 'price_asc' })[0].price <= core.filterItems(json, { sort: 'price_desc' })[0].price);
  const ex = await (await fetch(base + '/?exclusive=1')).text(); assert.ok(ex.includes('b-excl'));
  const cb = core.filterItems(json, { sort: 'cashback' }); assert.ok(cb[0].cashback >= cb[10].cashback);
  assert.ok((await (await fetch(base + '/catalog-core.js')).text()).includes('export function filterItems'));
});

test('11. Контентные страницы и позиционирование «впечатления»', async () => {
  for (const [path, must] of [
    ['/about', ['Незабываемые впечатления', 'Как это работает', 'Наш путь']],
    ['/delivery', ['Бронирование и оплата', 'Самовывоз']],
    ['/contacts', ['Пункты самовывоза']],
    ['/reviews', ['Отзывы']],
    ['/blog', ['Идеи впечатлений']],
    ['/blog/vishlist', ['Вишлист']],
    ['/partners', ['Новые клиенты']],
    ['/legal/offer', ['Публичная оферта']],
    ['/search?q=%D0%BC%D0%B0%D1%81%D1%81%D0%B0%D0%B6', ['Найдено']],
  ]) {
    const res = await fetch(base + path);
    assert.equal(res.status, 200, path);
    const t = await res.text();
    for (const m of must) assert.ok(t.includes(m), path + ' -> ' + m);
    assert.ok(t.includes('Каталог впечатлений') && t.includes('Вход / Регистрация'), 'шапка на ' + path);
  }
  const home = await (await fetch(base + '/')).text();
  assert.ok(!/подарочн\w+ сертификат/i.test(home.split('<main')[1].split('</main>')[0].replace(/Универсальный подарочный сертификат/g, '')), 'главная не про «подарочные сертификаты»');
});
