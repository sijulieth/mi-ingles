// Persistencia local con IndexedDB. Todo queda en el teléfono.
const DB_NAME = 'mi-ingles';
const DB_VERSION = 1;
const STORES = {
  kv: { keyPath: 'key' },
  cards: { keyPath: 'id', indexes: ['due'] },
  errors: { keyPath: 'id' },
  sessions: { keyPath: 'id', indexes: ['date'] },
  evals: { keyPath: 'id', indexes: ['date'] },
};

let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, cfg] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          const os = db.createObjectStore(name, { keyPath: cfg.keyPath });
          (cfg.indexes || []).forEach(ix => os.createIndex(ix, ix));
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  // Pide almacenamiento persistente para que iOS no borre los datos.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  return dbp;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const os = t.objectStore(store);
    let result;
    Promise.resolve(fn(os)).then(r => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

const wrap = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export const db = {
  async get(store, key) { return tx(store, 'readonly', os => wrap(os.get(key))); },
  async put(store, value) { return tx(store, 'readwrite', os => wrap(os.put(value))); },
  async putMany(store, values) { return tx(store, 'readwrite', os => Promise.all(values.map(v => wrap(os.put(v))))); },
  async del(store, key) { return tx(store, 'readwrite', os => wrap(os.delete(key))); },
  async all(store) { return tx(store, 'readonly', os => wrap(os.getAll())); },
  async clear(store) { return tx(store, 'readwrite', os => wrap(os.clear())); },

  // Pares clave/valor (ajustes, perfil, uso)
  async getKV(key, fallback = null) { const r = await this.get('kv', key); return r ? r.value : fallback; },
  async setKV(key, value) { return this.put('kv', { key, value }); },

  async exportAll({ includeKeys = false } = {}) {
    const out = { app: 'mi-ingles', version: 1, exportedAt: new Date().toISOString() };
    for (const s of Object.keys(STORES)) out[s] = await this.all(s);
    if (!includeKeys) {
      out.kv = out.kv.map(r => r.key === 'settings'
        ? { key: 'settings', value: { ...r.value, geminiKey: '', elevenKey: '' } } : r);
    }
    return out;
  },
  async importAll(data) {
    if (!data || data.app !== 'mi-ingles') throw new Error('El archivo no es una copia de Mi Inglés.');
    const current = await this.getKV('settings', {});
    for (const s of Object.keys(STORES)) {
      if (!Array.isArray(data[s])) continue;
      await this.clear(s);
      await this.putMany(s, data[s]);
    }
    // Conserva las claves actuales si la copia no las trae.
    const imported = await this.getKV('settings', {});
    await this.setKV('settings', { ...imported, geminiKey: imported.geminiKey || current.geminiKey || '', elevenKey: imported.elevenKey || current.elevenKey || '' });
  },
  async wipe() { for (const s of Object.keys(STORES)) await this.clear(s); },
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const todayStr = (d = new Date()) => {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};
