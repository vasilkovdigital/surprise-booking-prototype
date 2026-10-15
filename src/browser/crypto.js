// Криптография для браузера: scrypt из @noble/hashes (облегчённые параметры — тестовая БД живёт только в браузере пользователя).
import { scrypt } from '@noble/hashes/scrypt.js';

const enc = new TextEncoder();
const hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');

export const randomHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
export const kdfHex = (password, salt) => hex(scrypt(enc.encode(password), enc.encode(salt), { N: 1024, r: 8, p: 1, dkLen: 32 }));
export const safeEqual = (a, b) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};
export const randomDigit = () => crypto.getRandomValues(new Uint8Array(1))[0] % 10;
