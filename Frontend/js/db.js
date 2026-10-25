// js/db.js
const DB_NAME = 'creditpulse_offline';
const DB_VERSION = 2;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('customers')) {
        const store = db.createObjectStore('customers', { keyPath: 'id' });
        store.createIndex('name', 'name', { unique: false });
      }

      if (!db.objectStoreNames.contains('transactions')) {
        const store = db.createObjectStore('transactions', { keyPath: 'id' });
        store.createIndex('customer_id', 'customer_id', { unique: false });
      }

      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains('pending')) {
        db.createObjectStore('pending', { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllCustomers() {
  const db = await openDB();
  const tx = db.transaction('customers', 'readonly');
  return reqToPromise(tx.objectStore('customers').getAll()).then((rows) => rows || []);
}

export async function getCustomer(id) {
  const db = await openDB();
  const tx = db.transaction('customers', 'readonly');
  const row = await reqToPromise(tx.objectStore('customers').get(id));
  return row || null;
}

export async function saveCustomer(customer) {
  const db = await openDB();
  const tx = db.transaction('customers', 'readwrite');
  await reqToPromise(tx.objectStore('customers').put(customer));
  return customer;
}

export async function getTransactionsByCustomer(customerId) {
  const db = await openDB();
  const tx = db.transaction('transactions', 'readonly');
  const index = tx.objectStore('transactions').index('customer_id');
  const rows = await reqToPromise(index.getAll(customerId));
  return rows || [];
}

export async function getAllTransactions() {
  const db = await openDB();
  const tx = db.transaction('transactions', 'readonly');
  return reqToPromise(tx.objectStore('transactions').getAll()).then((rows) => rows || []);
}

export async function saveTransaction(txn) {
  const db = await openDB();
  const tx = db.transaction('transactions', 'readwrite');
  await reqToPromise(tx.objectStore('transactions').put(txn));
  return txn;
}

export async function deleteTransaction(id) {
  const db = await openDB();
  const tx = db.transaction('transactions', 'readwrite');
  await reqToPromise(tx.objectStore('transactions').delete(id));
  return true;
}

export async function deleteCustomer(id) {
  const txns = await getTransactionsByCustomer(id);
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['customers', 'transactions'], 'readwrite');
    tx.objectStore('customers').delete(id);
    for (const t of txns) tx.objectStore('transactions').delete(t.id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
  return true;
}

export async function reassignCustomerId(oldId, newCustomer) {
  const txns = await getTransactionsByCustomer(oldId);
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['customers', 'transactions'], 'readwrite');
    tx.objectStore('customers').delete(oldId);
    tx.objectStore('customers').put({ ...newCustomer, _pending: false });
    for (const t of txns) {
      tx.objectStore('transactions').put({ ...t, customer_id: newCustomer.id });
    }
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
  return true;
}

export async function getSettings() {
  const db = await openDB();
  const tx = db.transaction('settings', 'readonly');
  const row = await reqToPromise(tx.objectStore('settings').get('app'));
  return row?.value || {
    appName: 'CreditSaver',
    defaultCreditLimit: 5000,
    theme: 'light',
    version: '1.0.0',
  };
}

export async function saveSettings(settings) {
  const db = await openDB();
  const tx = db.transaction('settings', 'readwrite');
  await reqToPromise(tx.objectStore('settings').put({ key: 'app', value: settings }));
  return settings;
}

export async function clearAllData() {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['customers', 'transactions'], 'readwrite');
    tx.objectStore('customers').clear();
    tx.objectStore('transactions').clear();
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
  return true;
}

export async function addPending(item) {
  const db = await openDB();
  const tx = db.transaction('pending', 'readwrite');
  const id = await reqToPromise(tx.objectStore('pending').add({
    op: item.op,
    localId: item.localId ?? null,
    payload: item.payload ?? null,
    ambiguous: !!item.ambiguous,
    createdAt: Date.now(),
  }));
  return id;
}

export async function listPending() {
  const db = await openDB();
  const tx = db.transaction('pending', 'readonly');
  const rows = await reqToPromise(tx.objectStore('pending').getAll());
  return (rows || []).sort((a, b) => a.id - b.id);
}

export async function removePending(id) {
  const db = await openDB();
  const tx = db.transaction('pending', 'readwrite');
  await reqToPromise(tx.objectStore('pending').delete(id));
  return true;
}

export async function clearPending() {
  const db = await openDB();
  const tx = db.transaction('pending', 'readwrite');
  await reqToPromise(tx.objectStore('pending').clear());
  return true;
}

export async function dropPendingForLocal(localId) {
  const all = await listPending();
  for (const item of all) {
    const sameCustomer = item.localId === localId || item.payload?.customer_id === localId;
    if (sameCustomer) await removePending(item.id);
  }
}

export async function rewritePendingCustomerId(oldId, newId) {
  const all = await listPending();
  const db = await openDB();
  const tx = db.transaction('pending', 'readwrite');
  const store = tx.objectStore('pending');
  for (const item of all) {
    if (item.payload && item.payload.customer_id === oldId) {
      store.put({ ...item, payload: { ...item.payload, customer_id: newId } });
    }
  }
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}
