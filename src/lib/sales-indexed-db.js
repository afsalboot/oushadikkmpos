// Browser-native persistence. No customer, cart, token or sale records belong here.
export const SALES_CACHE_SCHEMA = 1;
const databaseName = 'oushadi-sales-cache';
const persistent = scope => Boolean(scope && !scope.startsWith('volatile:') && typeof indexedDB !== 'undefined');
let opening;
function open() {
  if (!opening) opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, SALES_CACHE_SCHEMA);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.createObjectStore('entries', { keyPath: ['scope', 'kind', 'id'] });
      store.createIndex('scope', 'scope');
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); opening = undefined; };
      resolve(request.result);
    };
    request.onerror = () => { opening = undefined; reject(request.error); };
    request.onblocked = () => { opening = undefined; reject(new Error('Sales cache database is blocked')); };
  });
  return opening;
}
export async function readSalesCache(scope) {
  if (!persistent(scope)) return [];
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('entries', 'readonly');
    const request = transaction.objectStore('entries').index('scope').getAll(scope);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function writeSalesCache(scope, records, removals = [], replaceIndex = false) {
  if (!persistent(scope)) return;
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('entries', 'readwrite');
    const store = transaction.objectStore('entries');
    const write = () => {
      for (const [kind, id] of removals) store.delete([scope, kind, id]);
      for (const record of records) store.put({ ...record, scope, schema: SALES_CACHE_SCHEMA });
    };
    if (replaceIndex) {
      // Atomic replacement also removes orphan rows from interrupted/old schemas.
      const request = store.openKeyCursor(IDBKeyRange.bound([scope, 'index-row', ''], [scope, 'index-row', '\uffff']));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) { store.delete(cursor.primaryKey); cursor.continue(); }
        else write();
      };
    } else write();
    transaction.oncomplete = resolve;
    transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error('Sales cache write failed'));
  });
}
export async function purgeSalesCache(scope) {
  if (typeof indexedDB === 'undefined') return;
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('entries', 'readwrite');
    const store = transaction.objectStore('entries');
    if (!scope) store.clear();
    else {
      const request = store.index('scope').openKeyCursor(scope);
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) { store.delete(cursor.primaryKey); cursor.continue(); }
      };
    }
    transaction.oncomplete = resolve;
    transaction.onerror = transaction.onabort = () => reject(transaction.error);
  });
}
