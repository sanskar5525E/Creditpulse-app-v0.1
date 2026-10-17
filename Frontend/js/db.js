// js/db.js
const DB_NAME = 'creditpulse_offline';
const DB_VERSION = 1;

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
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ---------- Customers ----------
export async function getAllCustomers() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('customers', 'readonly');
    const req = tx.objectStore('customers').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getCustomer(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('customers', 'readonly');
    const req = tx.objectStore('customers').get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveCustomer(customer) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('customers', 'readwrite');
    const req = tx.objectStore('customers').put(customer);
    req.onsuccess = () => resolve(customer);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteCustomer(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['customers', 'transactions'], 'readwrite');
    tx.objectStore('customers').delete(id);

    // Also delete related transactions
    const index = tx.objectStore('transactions').index('customer_id');
    const req = index.getAllKeys(id);
    req.onsuccess = () => {
      req.result.forEach(key => tx.objectStore('transactions').delete(key));
    };

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- Transactions ----------
export async function getTransactionsByCustomer(customerId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('transactions', 'readonly');
    const index = tx.objectStore('transactions').index('customer_id');
    const req = index.getAll(customerId);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllTransactions() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('transactions', 'readonly');
    const req = tx.objectStore('transactions').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function saveTransaction(txn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('transactions', 'readwrite');
    const req = tx.objectStore('transactions').put(txn);
    req.onsuccess = () => resolve(txn);
    req.onerror = () => reject(req.error);
  });
}

// ---------- Settings ----------
export async function getSettings() {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('settings', 'readonly');
    const req = tx.objectStore('settings').get('app');
    req.onsuccess = () => {
      resolve(req.result?.value || {
        appName: 'CreditPulse',
        defaultCreditLimit: 5000,
        theme: 'dark',
        version: '1.0.0'
      });
    };
  });
}

export async function saveSettings(settings) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite');
    const req = tx.objectStore('settings').put({ key: 'app', value: settings });
    req.onsuccess = () => resolve(settings);
    req.onerror = () => reject(req.error);
  });
}

export async function clearAllData() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['customers', 'transactions'], 'readwrite');
    tx.objectStore('customers').clear();
    tx.objectStore('transactions').clear();
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}
