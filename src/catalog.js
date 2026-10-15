import { all } from './db.js';
import { filterItems, paginate } from './catalog-core.js';

export {
  PAGE, CATEGORIES, CATEGORY_MARK, FILTERS, SORTS, tileHtml, tilesHtml, pagerHtml, filterItems, paginate, queryString,
} from './catalog-core.js';

const parsePhotos = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };

/** Все карточки каталога в «плоском» виде — то же уходит браузеру (/catalog.json) для фильтров и страниц. */
export function allItems() {
  const services = all('SELECT s.*, p.integration FROM services s JOIN partners p ON p.id=s.partner_id').map((s) => ({
    kind: 'service', key: `s${s.id}`, id: s.id, href: `/service/${s.id}`, title: s.title, sub: s.category, price: s.price,
    canBuy: s.integration !== 'none', category: s.category, people: s.people, city: s.city, occasion: s.occasion, gender: s.gender, age: s.age,
    is_new: s.is_new, exclusive: s.exclusive, rating: s.rating, reviews: s.reviews, cashback: s.cashback, badges: s.badges, popularity: s.popularity,
    photos: parsePhotos(s.photos), desc: String(s.description || '').slice(0, 140),
  }));
  const bundles = all('SELECT * FROM bundles').map((b) => ({
    kind: 'bundle', key: `b${b.id}`, id: b.id, href: `/bundle/${b.id}`, title: b.title, sub: 'Набор · услугу выберет получатель', price: b.price,
    canBuy: false, category: b.category, people: b.people, city: b.city, occasion: b.occasion, gender: b.gender, age: b.age,
    is_new: b.is_new, exclusive: b.exclusive, rating: b.rating, reviews: b.reviews, cashback: b.cashback, badges: b.badges, popularity: b.popularity,
    photos: parsePhotos(b.photos), desc: String(b.description || '').slice(0, 140),
  }));
  return [...services, ...bundles];
}

/** Фильтры + сортировка + страница (параметр page). */
export function queryItems(q = {}) {
  const list = filterItems(allItems(), q);
  return paginate(list, q.page);
}
