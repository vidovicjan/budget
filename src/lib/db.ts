const DB_NAME = 'budget-tracker';
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => {
        // The browser can close the connection (e.g. after a disk error): reopen next time.
        req.result.onclose = () => (dbPromise = null);
        resolve(req.result);
      };
      req.onerror = () => reject(req.error);
    });
    // A failed open must not be remembered, or "Try again" could never succeed.
    dbPromise.catch(() => (dbPromise = null));
  }
  return dbPromise;
}

/** Waits for one request. Its failure rejects here instead of aborting the transaction by itself. */
export function result<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => {
      e.preventDefault();
      reject(req.error);
    };
  });
}

/**
 * Runs `fn` in one transaction: either everything it writes is stored, or nothing is.
 * Resolves only once the transaction has really completed. `fn` may await only `result(...)`.
 */
export async function transact<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await open();
  let tx: IDBTransaction;
  try {
    tx = db.transaction(STORE, mode);
  } catch (err) {
    dbPromise = null;
    throw err;
  }
  return new Promise<T>((resolve, reject) => {
    let value: T;
    let failure: unknown;
    tx.oncomplete = () => resolve(value);
    // Also covers a full disk, which can surface only when committing.
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('The database did not accept the change.'));
    fn(tx.objectStore(STORE)).then(
      (v) => (value = v),
      (err) => {
        failure = err;
        try {
          tx.abort();
        } catch {
          reject(err);
        }
      }
    );
  });
}

export const kvGet = (key: string): Promise<unknown | null> => transact('readonly', async (s) => (await result(s.get(key))) ?? null);

export const kvSet = (key: string, value: unknown): Promise<void> =>
  transact('readwrite', async (s) => {
    await result(s.put(value, key));
  });

/** Keys starting with `prefix`, in order. */
export const keysOf = async (store: IDBObjectStore, prefix: string): Promise<string[]> =>
  (await result(store.getAllKeys(IDBKeyRange.bound(prefix, prefix + '\uffff')))) as string[];
