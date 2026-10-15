const join = (...a) => a.join('/');
export default { resolve: join, dirname: (p) => p, join };
