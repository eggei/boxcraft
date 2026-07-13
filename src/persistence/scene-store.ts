/**
 * A scene: a single HTML document that is the source of truth for a craft.
 * The rendered iframe is a pure function of `source` (see DESIGN.md §5).
 */
export interface Scene {
  id: string
  title: string
  source: string
  /** Position in the flat scene list (DESIGN.md §9/§10); lower sorts first. */
  order?: number
}

/**
 * A promise wrapper over one IndexedDB object store of scenes.
 * Local-first persistence for a single flat list (DESIGN.md §10).
 */
export interface SceneStore {
  /** Insert or overwrite a scene (keyed by id). */
  put(scene: Scene): Promise<void>
  /** Fetch a scene by id, or undefined if absent. */
  get(id: string): Promise<Scene | undefined>
  /** Fetch every stored scene. */
  getAll(): Promise<Scene[]>
  /** Remove a scene by id (no-op if absent). */
  delete(id: string): Promise<void>
}

const STORE = 'scenes'

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function openSceneStore(dbName = 'boxcraft'): Promise<SceneStore> {
  return new Promise((resolve, reject) => {
    const openReq = indexedDB.open(dbName, 1)
    openReq.onupgradeneeded = () => {
      openReq.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    openReq.onerror = () => reject(openReq.error)
    openReq.onsuccess = () => {
      const db = openReq.result

      // Don't wedge a `deleteDatabase` (e.g. a dev reset of the seed): step
      // aside so the delete can proceed instead of blocking on this connection.
      db.onversionchange = () => db.close()

      function tx(mode: IDBTransactionMode) {
        return db.transaction(STORE, mode).objectStore(STORE)
      }

      resolve({
        async put(scene) {
          await promisify(tx('readwrite').put(scene))
        },
        async get(id) {
          return await promisify(tx('readonly').get(id))
        },
        async getAll() {
          return await promisify(tx('readonly').getAll())
        },
        async delete(id) {
          await promisify(tx('readwrite').delete(id))
        },
      })
    }
  })
}
