import { db, get } from './db.js';
import { seed, TEST_PASSWORD } from './seed.js';

seed();
console.log('База заполнена тестовыми данными. Пароль всех тестовых аккаунтов:', TEST_PASSWORD);
console.log('Пользователей:', get('SELECT COUNT(*) c FROM users').c);
db.close();
