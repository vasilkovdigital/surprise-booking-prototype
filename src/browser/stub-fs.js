// Заглушка node:fs для браузерной сборки: файлов нет, данные приходят из бандла.
export default { existsSync: () => false, mkdirSync: () => {}, readFileSync: () => '' };
