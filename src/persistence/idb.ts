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

/**
 * The one shared connection, opened lazily on first use and reused by every
 * operation after that. Opening IndexedDB is the slow part of a write, and
 * autosave writes often, so paying for it once beats paying for it per call.
 * Null whenever there is no usable connection: before the first call, after a
 * failed open (so the next call retries instead of replaying the failure), and
 * after the connection was closed underneath us.
 */
let connection: Promise<IDBDatabase> | null = null

function getDB(): Promise<IDBDatabase> {
  if (!connection) {
    const opening = openDB(() => {
      // Only forget the connection this callback belongs to — a newer one may
      // already have replaced it.
      if (connection === opening) connection = null
    })
    connection = opening
    opening.catch(() => {
      if (connection === opening) connection = null
    })
  }
  return connection
}

function openDB(onGone: () => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest
    try {
      // Throws outright where storage is off limits (e.g. a SecurityError in
      // some private modes), rather than failing the request.
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch (error) {
      reject(error)
      return
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SCENES_STORE)) {
        db.createObjectStore(SCENES_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => {
      const db = request.result
      // Another tab wants to upgrade or delete the database. Holding the
      // connection open would block it, so step aside; the next operation
      // reopens (and, if a newer build moved the schema on, fails with a
      // VersionError until this tab reloads).
      db.onversionchange = () => {
        db.close()
        onGone()
      }
      // The browser closed it for us (storage cleared, disk trouble…).
      db.onclose = onGone
      resolve(db)
    }
    request.onerror = () => reject(request.error)
    // An older connection elsewhere (typically a tab still running a build
    // without the versionchange handler above) is holding up an upgrade. The
    // open finishes by itself once that tab closes; until then there is nothing
    // to do but say so.
    request.onblocked = () => {
      console.warn('BoxCraft storage is waiting for another tab to close.')
    }
  })
}

/**
 * Close the shared connection and forget it; the next operation opens a fresh
 * one. Nothing in the app needs this — the tests use it to drop a connection to
 * a database they are about to throw away.
 */
export function closeDB(): void {
  const closing = connection
  connection = null
  void closing?.then(
    (db) => db.close(),
    () => {},
  )
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function putRecord<T>(store: string, value: T): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(store, 'readwrite')
  const done = txDone(tx)
  tx.objectStore(store).put(value)
  await done
}

export async function deleteRecord(
  store: string,
  key: IDBValidKey,
): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(store, 'readwrite')
  const done = txDone(tx)
  tx.objectStore(store).delete(key)
  await done
}

/**
 * Swap the store's whole contents in one transaction. Autosave only ever puts,
 * so removal is always explicit — an import that replaces the library must not
 * leave the old records behind.
 */
export async function replaceAllRecords<T>(
  store: string,
  values: T[],
): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(store, 'readwrite')
  const done = txDone(tx)
  const objectStore = tx.objectStore(store)
  objectStore.clear()
  for (const value of values) objectStore.put(value)
  await done
}

export async function getRecord<T>(
  store: string,
  key: IDBValidKey,
): Promise<T | undefined> {
  const db = await getDB()
  return promisify<T | undefined>(
    db.transaction(store, 'readonly').objectStore(store).get(key),
  )
}

export async function getAllRecords<T>(store: string): Promise<T[]> {
  const db = await getDB()
  return promisify<T[]>(
    db.transaction(store, 'readonly').objectStore(store).getAll(),
  )
}
