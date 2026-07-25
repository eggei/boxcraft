// Thin hand-rolled promise wrapper over IndexedDB (no Dexie).

const DB_NAME = 'boxcraft'
const DB_VERSION = 1
export const SCENES_STORE = 'scenes'

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SCENES_STORE)) {
        db.createObjectStore(SCENES_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function putRecord<T>(store: string, value: T): Promise<void> {
  const db = await openDB()
  try {
    const tx = db.transaction(store, 'readwrite')
    const done = txDone(tx)
    tx.objectStore(store).put(value)
    await done
  } finally {
    db.close()
  }
}

/**
 * Swap the store's whole contents in one transaction. Autosave only ever puts,
 * so this is the only path that removes records — an import that replaces the
 * library must not leave the old ones behind.
 */
export async function replaceAllRecords<T>(
  store: string,
  values: T[],
): Promise<void> {
  const db = await openDB()
  try {
    const tx = db.transaction(store, 'readwrite')
    const done = txDone(tx)
    const objectStore = tx.objectStore(store)
    objectStore.clear()
    for (const value of values) objectStore.put(value)
    await done
  } finally {
    db.close()
  }
}

export async function getRecord<T>(
  store: string,
  key: IDBValidKey,
): Promise<T | undefined> {
  const db = await openDB()
  try {
    return await promisify<T | undefined>(
      db.transaction(store, 'readonly').objectStore(store).get(key),
    )
  } finally {
    db.close()
  }
}

export async function getAllRecords<T>(store: string): Promise<T[]> {
  const db = await openDB()
  try {
    return await promisify<T[]>(
      db.transaction(store, 'readonly').objectStore(store).getAll(),
    )
  } finally {
    db.close()
  }
}
