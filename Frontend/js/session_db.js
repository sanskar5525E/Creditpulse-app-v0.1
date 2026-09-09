// session_db.js
// Simple IndexedDB wrapper to persist a single `session` object.
// API: saveSession(obj), getSession(), clearSession()

const DB_NAME = 'creditpulse_db';
const STORE_NAME = 'kv';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveItem(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(value, key);
    req.onsuccess = () => {
      resolve(true);
      db.close();
    };
    req.onerror = () => {
      reject(req.error);
      db.close();
    };
  });
}

async function getItem(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => {
      resolve(req.result ?? null);
      db.close();
    };
    req.onerror = () => {
      reject(req.error);
      db.close();
    };
  });
}

async function delItem(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(key);
    req.onsuccess = () => {
      resolve(true);
      db.close();
    };
    req.onerror = () => {
      reject(req.error);
      db.close();
    };
  });
}

export async function saveSession(sessionObj) {
  try {
    await saveItem('session', sessionObj);
    return true;
  } catch (e) {
    console.warn('saveSession failed', e);
    return false;
  }
}

export async function getSession() {
  try {
    return await getItem('session');
  } catch (e) {
    console.warn('getSession failed', e);
    return null;
  }
}

export async function clearSession() {
  try {
    await delItem('session');
    return true;
  } catch (e) {
    console.warn('clearSession failed', e);
    return false;
  }
}
