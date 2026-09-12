// Tiny IndexedDB wrapper. Projects (with binary file contents) are far too big
// for localStorage, and IndexedDB stores Uint8Array natively.

const DB_NAME = "runline";
const DB_VERSION = 1;
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run(store, mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => resolve(req ? req.result : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

export const db = {
  getProject: (id) => run("projects", "readonly", (s) => s.get(id)),
  putProject: (p) => run("projects", "readwrite", (s) => s.put(p)),
  deleteProject: (id) => run("projects", "readwrite", (s) => s.delete(id)),
  listProjects: () => run("projects", "readonly", (s) => s.getAll()),
};
