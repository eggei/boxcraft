import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAllRecords, getRecord, putRecord, SCENES_STORE } from './idb'

afterEach(() => {
  vi.restoreAllMocks()
})

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

describe('shared IndexedDB connection', () => {
  it('opens the database once and reuses it for every operation', async () => {
    const open = vi.spyOn(indexedDB, 'open')

    await putRecord(SCENES_STORE, { id: 'a' })
    await putRecord(SCENES_STORE, { id: 'b' })
    await getRecord(SCENES_STORE, 'a')
    await getAllRecords(SCENES_STORE)

    expect(open).toHaveBeenCalledTimes(1)
  })

  it('shares one open between operations that start at the same time', async () => {
    const open = vi.spyOn(indexedDB, 'open')

    await Promise.all([
      putRecord(SCENES_STORE, { id: 'a' }),
      putRecord(SCENES_STORE, { id: 'b' }),
      getAllRecords(SCENES_STORE),
    ])

    expect(open).toHaveBeenCalledTimes(1)
  })

  it('rejects with the error when opening fails, and retries on the next call', async () => {
    const failure = new DOMException('Storage is off limits', 'SecurityError')
    const open = vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
      throw failure
    })

    await expect(putRecord(SCENES_STORE, { id: 'a' })).rejects.toBe(failure)

    // The failure is not cached: the next operation opens for real.
    await putRecord(SCENES_STORE, { id: 'a' })
    expect(await getRecord(SCENES_STORE, 'a')).toEqual({ id: 'a' })
    expect(open).toHaveBeenCalledTimes(2)
  })

  it('steps aside when another connection deletes the database, then reopens', async () => {
    await putRecord(SCENES_STORE, { id: 'a' })

    // Resolves only because the shared connection closes on versionchange —
    // otherwise the delete would sit blocked.
    await deleteDatabase('boxcraft')

    const open = vi.spyOn(indexedDB, 'open')
    await putRecord(SCENES_STORE, { id: 'b' })

    expect(open).toHaveBeenCalledTimes(1)
    expect(await getAllRecords(SCENES_STORE)).toEqual([{ id: 'b' }])
  })
})
