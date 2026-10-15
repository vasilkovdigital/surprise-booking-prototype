// Импорт товаров из выгрузки Google Merchant (seed/google_merchant.csv, разделитель «|»).
// Реальные в выгрузке: название, описание, фото, цена, теги (product_type), пол и бюджет.
// Вымышленные (в выгрузке их нет): рейтинг, число отзывов, кэшбэк, популярность, город (кроме явных в названии).
import fs from 'node:fs';

export function parseCsv(text, sep = '|') {
  const rows = []; let row = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

const hash = (s) => { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
const has = (tags, ...names) => names.some((n) => tags.includes(n));

function category(title, tags) {
  if (/^Универсальный/i.test(title)) return 'Универсальные';
  if (has(tags, 'Подарки премиум')) return 'Впечатления премиум';
  if (has(tags, 'Спа')) return 'SPA и красота';
  if (has(tags, 'Бары и рестораны')) return 'Еда и рестораны';
  if (has(tags, 'Мастер-классы и обучение', 'Креативные подарки', 'Фотосессии')) return 'Творчество и обучение';
  if (has(tags, 'Активный отдых', 'Квесты', 'Полеты', 'Зимние развлечения')) return 'Активный отдых';
  if (has(tags, 'Подарки премиум')) return 'Впечатления премиум';
  return 'Универсальные';
}

const OCCASIONS = [['Подарки на День Рождения', 'День рождения'], ['Подарки на Новый Год', 'Новый год'], ['Подарки на 14 февраля', '14 февраля'],
  ['Подарки на 8 марта', '8 марта'], ['Подарки на 23 февраля', '23 февраля'], ['На свадьбу', 'Свадьба']];

function photos(main, extra) {
  const all = [main, ...String(extra || '').split(',').map((x) => x.trim())].filter((u) => /^https?:/.test(u));
  const uniq = [...new Set(all)];
  // тяжёлые PNG уводим на второй план: для скорости первым показываем webp
  const light = uniq.filter((u) => !/\.png($|\?)/i.test(u));
  const heavy = uniq.filter((u) => /\.png($|\?)/i.test(u));
  return [...light, ...heavy].slice(0, 3);
}

/** Возвращает массив записей для таблицы services (без partner_id). */
export function readMerchant(file) {
  if (!fs.existsSync(file)) return [];
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  const head = rows.shift();
  const idx = Object.fromEntries(head.map((k, i) => [k, i]));
  const ids = rows.map((r) => Number(r[idx.id])).sort((a, b) => a - b);
  const newestId = ids[Math.floor(ids.length * 0.92)];
  const out = [];
  for (const r of rows) {
    const g = (k) => r[idx[k]] || '';
    const title = g('title').trim();
    const price = parseFloat(g('price'));
    if (!title || !price) continue;
    const tags = g('product_type').split(',').map((t) => t.trim());
    const h = hash(g('id'));
    const l0 = g('custom_label_0');
    const gender = /для нее/.test(l0) && !/для него/.test(l0) ? 'f' : /для него/.test(l0) && !/для нее/.test(l0) ? 'm'
      : l0 ? 'any' : has(tags, 'Женщинам', 'Девушкам') && !has(tags, 'Мужчинам', 'Парням') ? 'f' : has(tags, 'Мужчинам', 'Парням') && !has(tags, 'Женщинам', 'Девушкам') ? 'm' : 'any';
    const cityHit = title.match(/Брест|Гродно|Витебск|Гомель|Могил[её]в/);
    const reviews = has(tags, 'Новинки каталога') ? h % 6 : 5 + (h % 240);
    const cashback = h % 10 < 7 ? Math.min(60, Math.max(3, Math.round(price * (0.04 + (h % 5) / 100)))) : 0;
    const popular = has(tags, 'Популярное');
    out.push({
      title,
      description: g('description').trim(),
      price,
      category: category(title, tags),
      people: has(tags, 'Для большой компании') ? 4 : has(tags, 'Свидания и вечеринки') || /двоих|для пары|парн|вдвоем|вдвоём/i.test(title) ? 2 : 1,
      city: cityHit ? cityHit[0].replace('Могилев', 'Могилёв') : 'Минск',
      occasion: OCCASIONS.filter(([t]) => tags.includes(t)).map(([, o]) => o).join(',') || 'Просто так',
      gender,
      age: has(tags, 'Детям') ? 'kids' : 'adult',
      is_new: has(tags, 'Новинки каталога') || Number(g('id')) >= newestId ? 1 : 0,
      exclusive: has(tags, 'Эксклюзив') ? 1 : 0,
      rating: Math.round((4.5 + (h % 6) / 10) * 10) / 10,
      reviews,
      cashback,
      badges: popular ? 'hit' : '',
      popularity: (popular ? 50 : 0) + (has(tags, 'Surprise.by рекомендует') ? 20 : 0) + (h % 30),
      photos: JSON.stringify(photos(g('image_link'), g('additional_image_link'))),
      source_url: g('link'),
    });
  }
  return out;
}
