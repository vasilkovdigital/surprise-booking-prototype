// Прототип: обязательность полей форм отключена, чтобы можно было пройти флоу «вхолостую».
// Вернуть строгую проверку: запуск с переменной STRICT_FORMS=1 (npm start / npm test).
export const strict = () => process.env.STRICT_FORMS === '1';
