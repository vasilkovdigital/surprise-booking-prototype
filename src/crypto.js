// Криптография для Node. В браузерной сборке (GitHub Pages) подменяется на src/browser/crypto.js (ключ "#crypto" в package.json → imports).
import { randomBytes, scryptSync, timingSafeEqual, randomInt } from 'node:crypto';

export const randomHex = (n) => randomBytes(n).toString('hex');
export const kdfHex = (password, salt) => scryptSync(password, salt, 32).toString('hex');
export const safeEqual = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const randomDigit = () => randomInt(0, 10);
