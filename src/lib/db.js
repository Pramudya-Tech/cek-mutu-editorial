// A tiny IndexedDB wrapper: one store for checks, one key-value store for
// settings, the saved signature and journals added in this browser.

const DB_NAME = 'cek-mutu-editorial';
const DB_VERSION = 1;
let dbPromise;

function open() {
  if (!('indexedDB' in globalThis)) return Promise.reject(new Error('IndexedDB tidak tersedia'));
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('checks')) db.createObjectStore('checks', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    Promise.resolve(fn(s)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const req2p = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

export const db = {
  async allChecks() {
    try { return await tx('checks', 'readonly', (s) => req2p(s.getAll())); } catch { return []; }
  },
  async putCheck(check) {
    try { await tx('checks', 'readwrite', (s) => req2p(s.put(check))); } catch (e) { console.warn(e); }
  },
  async deleteCheck(id) {
    try { await tx('checks', 'readwrite', (s) => req2p(s.delete(id))); } catch (e) { console.warn(e); }
  },
  async get(key, fallback) {
    try {
      const row = await tx('kv', 'readonly', (s) => req2p(s.get(key)));
      return row ? row.value : fallback;
    } catch { return fallback; }
  },
  async set(key, value) {
    try { await tx('kv', 'readwrite', (s) => req2p(s.put({ key, value }))); } catch (e) { console.warn(e); }
  },
  async clearAll() {
    try {
      await tx('checks', 'readwrite', (s) => req2p(s.clear()));
      await tx('kv', 'readwrite', (s) => req2p(s.clear()));
    } catch (e) { console.warn(e); }
  },
};
