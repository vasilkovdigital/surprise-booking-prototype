// Замена node:sqlite в браузере: тот же синхронный API (DatabaseSync → prepare().all/get/run, exec) поверх sql.js.
// globalThis.__SQL__ (модуль sql.js) и globalThis.__DB_BYTES__ (сохранённая база из IndexedDB) задает service worker до загрузки приложения.
let current = null;
let dirty = false;

export const isDirty = () => dirty;
export const clearDirty = () => { dirty = false; };
/** Снимок базы для сохранения в IndexedDB. sql.js при export сбрасывает pragma — включаем заново. */
export function exportBytes() {
  const bytes = current.db.export();
  current.db.run('PRAGMA foreign_keys = ON');
  return bytes;
}

const norm = (params) => params.map((v) => (v === undefined ? null : typeof v === 'bigint' ? Number(v) : v));

export class DatabaseSync {
  constructor() {
    const SQL = globalThis.__SQL__;
    this.db = globalThis.__DB_BYTES__ ? new SQL.Database(globalThis.__DB_BYTES__) : new SQL.Database();
    current = this;
  }

  exec(sql) {
    dirty = true;
    this.db.exec(sql);
  }

  prepare(sql) {
    const db = this.db;
    const rows = (params, firstOnly) => {
      const st = db.prepare(sql);
      try {
        const p = norm(params);
        if (p.length) st.bind(p);
        const out = [];
        while (st.step()) {
          out.push(st.getAsObject());
          if (firstOnly) break;
        }
        return out;
      } finally { st.free(); }
    };
    return {
      all: (...params) => rows(params, false),
      get: (...params) => rows(params, true)[0],
      run: (...params) => {
        dirty = true;
        db.run(sql, norm(params));
        return { changes: db.getRowsModified(), lastInsertRowid: db.exec('SELECT last_insert_rowid()')[0].values[0][0] };
      },
    };
  }

  close() { this.db.close(); }
}
