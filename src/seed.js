import { fileURLToPath } from 'node:url';
import { db, dropAll, initSchema, run, get } from './db.js';
import { hashPassword } from './auth.js';
import path from 'node:path';
import { readMerchant } from './merchant.js';

export const TEST_PASSWORD = 'test1234';

/** Пересоздает БД и заполняет тестовыми данными. Все партнеры и услуги вымышленные. */
export function seed() {
  dropAll();
  initSchema();
  const pw = hashPassword(TEST_PASSWORD);

  run("INSERT INTO settings VALUES ('default_free_cancel_hours','24')");
  run("INSERT INTO settings VALUES ('default_confirm_timeout_hours','3')");

  const user = (role, email, name, phone, birth, test) =>
    run('INSERT INTO users (role,email,password_hash,name,phone,birth_date,is_test) VALUES (?,?,?,?,?,?,?)',
      role, email, pw, name, phone, birth, test).id;

  user('admin', 'admin@test.by', 'Админ Surprise', '+375291000000', '1990-01-01', 0);
  user('client', 'client1@test.by', 'Тест Клиент Один', '+375291111111', '1992-05-14', 1);
  user('client', 'client2@test.by', 'Тест Клиент Два', '+375292222222', '1995-09-30', 1);

  const partner = (email, name, description, o) => {
    const uid = user('partner', email, name, o.phone, '1985-01-01', 0);
    const id = run(
      `INSERT INTO partners (user_id,name,description,integration,calendar_sync,visit_min,notify_channel,contacts)
       VALUES (?,?,?,?,?,?,?,?)`,
      uid, name, description, o.integration, o.sync, o.visit, o.channel, o.contacts,
    ).id;
    return id;
  };

  // А: календарь подключен — бронь подтверждается автоматически
  const A = partner('partner-a@test.by', 'Партнёр А (тест)', 'Прокат квадроциклов, маршруты по лесу.',
    { integration: 'cabinet', sync: 1, visit: 60, channel: 'telegram', phone: '+375293000001', contacts: 'Тел. +375 29 300-00-01, Telegram @quadro_test' });
  // Б: только кабинет — подтверждает вручную
  const B = partner('partner-b@test.by', 'Партнёр Б (тест)', 'Джип-туры по бездорожью с гидом.',
    { integration: 'cabinet', sync: 0, visit: 120, channel: 'both', phone: '+375293000002', contacts: 'Тел. +375 29 300-00-02, Telegram @jeep_test' });
  // В: без интеграции — только «Купить в подарок»
  const V = partner('partner-v@test.by', 'Партнёр В (тест)', 'Мастер-классы по гончарному делу.',
    { integration: 'none', sync: 0, visit: 120, channel: 'email', phone: '+375293000003', contacts: 'Тел. +375 29 300-00-03, запись по телефону с 10 до 20' });

  // график: пн-вс 10:00–18:00, перерыв 13:00–14:00
  for (const pid of [A, B, V]) {
    for (let wd = 0; wd < 7; wd++) {
      run('INSERT INTO schedule_rules (partner_id,weekday,start,"end",break_start,break_end) VALUES (?,?,?,?,?,?)',
        pid, wd, '10:00', '18:00', pid === B ? null : '13:00', pid === B ? null : '14:00');
    }
  }

  const svc = (pid, title, description, price, capacity = 1) =>
    run('INSERT INTO services (partner_id,title,description,price,capacity) VALUES (?,?,?,?,?)', pid, title, description, price, capacity).id;
  const sA = svc(A, 'Прокат квадроциклов, 1 час', 'Часовая поездка на квадроцикле по лесному маршруту. Инструктаж и экипировка включены.', 120);
  const sB = svc(B, 'Джип-тур по бездорожью, 2 часа', 'Двухчасовой тур на внедорожнике с гидом: броды, подъемы, лесные дороги.', 200);
  svc(V, 'Мастер-класс по гончарному делу', 'Лепка и роспись изделия на гончарном круге под руководством мастера.', 90);

  const bundle = run('INSERT INTO bundles (title,description,price) VALUES (?,?,?)',
    'Набор «Выходные на природе»', 'Получатель выбирает одно приключение: квадроциклы или джип-тур.', 150).id;
  run('INSERT INTO bundle_services VALUES (?,?)', bundle, sA);
  run('INSERT INTO bundle_services VALUES (?,?)', bundle, sB);
  seedCatalog({ A, B, V, bundle, user, partner });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seed();
  console.log('База заполнена тестовыми данными. Пароль всех тестовых аккаунтов:', TEST_PASSWORD);
  console.log('Пользователей:', get('SELECT COUNT(*) c FROM users').c);
  db.close();
}

// ---- витрина главной: метаданные для фильтров/сортировок и дополнительные (вымышленные) предложения ----
// meta: [category, people, city, occasion, gender, age, is_new, exclusive, rating, reviews, cashback, badges, popularity]
function setMeta(table, id, m) {
  run(`UPDATE ${table} SET category=?, people=?, city=?, occasion=?, gender=?, age=?, is_new=?, exclusive=?, rating=?, reviews=?, cashback=?, badges=?, popularity=? WHERE id=?`, ...m, id);
}

function seedCatalog({ A, B, V, bundle, user, partner }) {
  // существующие карточки
  setMeta('services', 1, ['Активный отдых', 2, 'Минск', 'Просто так', 'any', 'adult', 0, 0, 4.8, 274, 12, 'hit', 95]);
  setMeta('services', 2, ['Активный отдых', 4, 'Минск', 'День рождения', 'm', 'adult', 1, 1, 4.9, 56, 20, 'only', 80]);
  setMeta('services', 3, ['Творчество и обучение', 1, 'Минск', 'Просто так', 'f', 'adult', 0, 0, 4.7, 31, 5, '', 60]);
  setMeta('bundles', bundle, ['Универсальные', 1, 'Минск', 'Просто так', 'any', 'adult', 0, 1, 5.0, 12, 15, 'only', 70]);

  const dummyHash = hashPassword(TEST_PASSWORD);
  const mk = (email, name, description, integration, sync, visit, contacts) => {
    const pid = partner(email, name, description, { integration, sync, visit, channel: 'email', phone: '+375293000100', contacts });
    for (let wd = 0; wd < 7; wd++) {
      run('INSERT INTO schedule_rules (partner_id,weekday,start,"end",break_start,break_end) VALUES (?,?,?,?,?,?)', pid, wd, '10:00', '20:00', null, null);
    }
    return pid;
  };
  void dummyHash;
  const spa = mk('partner-spa@test.by', 'Партнёр SPA (тест)', 'SPA и массаж.', 'cabinet', 1, 60, 'Тел. +375 29 300-01-00');
  const food = mk('partner-food@test.by', 'Партнёр Еда (тест)', 'Рестораны и кулинарные мастер-классы.', 'cabinet', 0, 120, 'Тел. +375 29 300-01-01');
  const platform = mk('platform@test.by', 'Surprise.by', 'Универсальные сертификаты и подборки.', 'none', 0, 60, 'Тел. +375 29 300-01-02');

  // title, partner, price, category, people, city, occasion, gender, age, new, exclusive, rating, reviews, cashback, badges, popularity, description
  const rows = [
    ['Универсальный подарочный сертификат', platform, 50, 'Универсальные', 1, 'Вся Беларусь', 'Просто так', 'any', 'adult', 0, 0, 4.8, 274, 30, 'only,hit', 100, 'Сертификат с открытой суммой: получатель сам выберет впечатление из сотен вариантов.'],
    ['Массаж спины, 60 минут', spa, 85, 'SPA и красота', 1, 'Минск', '8 марта', 'f', 'adult', 0, 0, 4.9, 118, 8, 'hit', 88, 'Классический массаж спины и шейно-воротниковой зоны.'],
    ['SPA-день для двоих', spa, 260, 'SPA и красота', 2, 'Минск', 'Годовщина', 'any', 'adult', 0, 1, 4.9, 64, 25, 'only', 90, 'Бассейн, сауна и парный уход на целый день.'],
    ['Йога-сессия на природе', spa, 35, 'SPA и красота', 3, 'Минск', 'Просто так', 'f', 'adult', 1, 0, 4.6, 9, 0, '', 40, 'Утренняя практика на свежем воздухе для небольшой группы.'],
    ['Ужин с видом на город', food, 180, 'Еда и рестораны', 2, 'Минск', 'Годовщина', 'any', 'adult', 0, 0, 4.8, 77, 15, 'hit', 82, 'Дегустационный ужин на двоих в ресторане на верхнем этаже.'],
    ['Кулинарный мастер-класс', food, 110, 'Творчество и обучение', 3, 'Минск', 'День рождения', 'any', 'adult', 1, 0, 4.7, 22, 10, '', 55, 'Готовим вместе с шефом три блюда и забираем их с собой.'],
    ['Рафтинг по Неману', B, 140, 'Активный отдых', 4, 'Гродно', 'День рождения', 'm', 'adult', 0, 0, 4.8, 41, 12, '', 66, 'Сплав на плотах с инструктором и обедом на берегу.'],
    ['Квест по Брестской крепости', B, 45, 'Активный отдых', 3, 'Брест', 'Просто так', 'any', 'kids', 1, 0, 4.9, 15, 5, 'only', 58, 'Семейный квест с заданиями по истории крепости.'],
    ['Фотосессия Love story', V, 150, 'Творчество и обучение', 2, 'Витебск', 'Годовщина', 'f', 'adult', 0, 0, 5.0, 19, 12, '', 62, 'Час съёмки с фотографом и 20 обработанных кадров.'],
    ['Конная прогулка', B, 75, 'Активный отдых', 2, 'Гомель', 'Просто так', 'any', 'adult', 0, 0, 4.7, 33, 6, '', 52, 'Прогулка по лесу верхом с проводником.'],
    ['Детский квест «Тайна старого города»', V, 60, 'Активный отдых', 3, 'Минск', 'День рождения', 'any', 'kids', 0, 0, 4.8, 48, 8, 'hit', 72, 'Командный квест для детей 7–12 лет.'],
    ['Стрельба из лука', B, 40, 'Активный отдых', 2, 'Минск', 'Просто так', 'm', 'teens', 1, 0, 4.5, 6, 0, '', 35, 'Занятие с тренером и мишенями в тире.'],
    ['Парный мастер-класс по живописи', V, 95, 'Творчество и обучение', 2, 'Минск', '14 февраля', 'any', 'adult', 0, 0, 4.9, 52, 10, '', 74, 'Рисуем картину маслом под руководством художника.'],
    ['Квест-комната «Побег»', B, 70, 'Активный отдых', 4, 'Минск', 'День рождения', 'any', 'teens', 0, 0, 4.6, 87, 7, '', 68, 'Командная игра на 60 минут для 2–5 человек.'],
    ['Вертолётная экскурсия над городом', platform, 900, 'Впечатления премиум', 2, 'Минск', 'Юбилей', 'any', 'adult', 0, 1, 5.0, 14, 60, 'only,hit', 78, 'Обзорный полёт над столицей на 25 минут.'],
    ['Урок вождения спорткара', A, 320, 'Впечатления премиум', 1, 'Минск', 'Юбилей', 'm', 'adult', 1, 1, 4.9, 8, 30, 'only', 61, 'Три круга на трассе с инструктором на спорткаре.'],
  ];
  const merchant = readMerchant(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'seed', 'google_merchant.csv'));
  if (merchant.length) {
    // реальные товары из выгрузки раздаем тестовым партнерам: А (авто), Б (вручную), В и платформа (только подарок)
    const owners = [A, B, V, platform];
    merchant.forEach((m, i) => {
      run(`INSERT INTO services (partner_id,title,description,price,capacity,category,people,city,occasion,gender,age,is_new,exclusive,rating,reviews,cashback,badges,popularity,photos,source_url)
            VALUES (?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        owners[i % 4], m.title, m.description, m.price, m.category, m.people, m.city, m.occasion, m.gender, m.age, m.is_new, m.exclusive,
        m.rating, m.reviews, m.cashback, m.badges, m.popularity, m.photos, m.source_url);
    });
    return;
  }
  for (const r of rows) {
    const id = run('INSERT INTO services (partner_id,title,description,price,capacity) VALUES (?,?,?,?,1)', r[1], r[0], r[16], r[2]).id;
    setMeta('services', id, r.slice(3, 16));
  }
}
