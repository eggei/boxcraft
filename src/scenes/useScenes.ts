import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getAllScenes,
  removeScene,
  replaceAllScenes,
  saveScene,
} from '@/persistence/scenes'
import { importScenes, type ImportMode } from '@/library/libraryFile'
import {
  addScene as addSceneOp,
  archiveScene as archiveOp,
  changedSceneIds,
  deleteScene as deleteOp,
  duplicateScene as duplicateOp,
  renameScene as renameOp,
  reorderScenes as reorderOp,
  restoreScene as restoreOp,
  seedScenes,
  unarchiveScene as unarchiveOp,
  type Scene,
} from './sceneList'

type Status = 'loading' | 'ready'

/**
 * How long autosave waits after the last change before writing. Typing in the
 * editor changes the scene on every keystroke; this turns a burst of them into
 * one write.
 */
export const AUTOSAVE_DELAY_MS = 500

function newId(): string {
  return `scene-${crypto.randomUUID()}`
}

/**
 * Multi-scene state: the full list (active + archived) held in memory, seeded
 * on first run, and autosaved to IndexedDB. All list logic lives in the pure
 * sceneList module; this hook is a thin React/IO adapter over it.
 *
 * Autosave writes only what changed: every operation marks the scenes it
 * touched as dirty, and a debounced flush puts just those records. The flush is
 * also forced whenever the page may be going away, so a pending edit is not
 * lost to a closed tab.
 */
export function useScenes() {
  const [scenes, setScenes] = useState<Scene[]>([])
  const [status, setStatus] = useState<Status>('loading')

  /** The list as last committed — what a flush outside a render writes from. */
  const committed = useRef<Scene[]>(scenes)
  /** Ids whose in-memory scene is newer than its stored record. */
  const dirty = useRef(new Set<string>())
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(function restoreScenes() {
    let active = true
    async function run() {
      let all = await getAllScenes()
      if (all.length === 0) {
        all = seedScenes()
        await Promise.all(all.map(saveScene))
      } else {
        // Migrate records saved before Phase 4 added order/archivedAt.
        all = all.map((scene, index) => ({
          ...scene,
          order: scene.order ?? index,
          archivedAt: scene.archivedAt ?? null,
        }))
      }
      if (!active) return
      setScenes(all)
      setStatus('ready')
    }
    void run()
    return function cancel() {
      active = false
    }
  }, [])

  /**
   * Write every dirty scene now. A dirty id with no scene left in the list was
   * deleted — its record is removed by hand — so there is nothing to put. A
   * write that fails puts its id back so the next flush tries again.
   */
  const flush = useCallback(async () => {
    if (saveTimer.current !== null) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    if (dirty.current.size === 0) return
    const ids = new Set(dirty.current)
    dirty.current.clear()
    const pending = committed.current.filter((scene) => ids.has(scene.id))
    await Promise.all(
      pending.map((scene) =>
        saveScene(scene).catch((error: unknown) => {
          dirty.current.add(scene.id)
          console.error('Autosave failed', error)
        }),
      ),
    )
  }, [])

  useEffect(
    function scheduleAutosave() {
      committed.current = scenes
      if (status !== 'ready' || dirty.current.size === 0) return
      if (saveTimer.current !== null) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS)
    },
    [scenes, status, flush],
  )

  // Hiding the tab is the last moment a page can count on running code — a
  // mobile browser may discard it from the background without another event —
  // so pending edits go out then rather than after the debounce.
  useEffect(
    function flushWhenLeaving() {
      function onVisibilityChange() {
        if (document.visibilityState === 'hidden') void flush()
      }
      function onPageHide() {
        void flush()
      }
      document.addEventListener('visibilitychange', onVisibilityChange)
      window.addEventListener('pagehide', onPageHide)
      return () => {
        document.removeEventListener('visibilitychange', onVisibilityChange)
        window.removeEventListener('pagehide', onPageHide)
        void flush()
      }
    },
    [flush],
  )

  /** Apply a pure list operation, marking whatever it changed as dirty. */
  const mutate = useCallback((op: (current: Scene[]) => Scene[]) => {
    setScenes((current) => {
      const next = op(current)
      for (const id of changedSceneIds(current, next)) dirty.current.add(id)
      return next
    })
  }, [])

  const addScene = useCallback((): string => {
    const id = newId()
    mutate((current) => addSceneOp(current, { id }).scenes)
    return id
  }, [mutate])

  const duplicateScene = useCallback(
    (id: string): string => {
      const newSceneId = newId()
      mutate((current) => duplicateOp(current, id, newSceneId).scenes)
      return newSceneId
    },
    [mutate],
  )

  const archiveScene = useCallback(
    (id: string) => {
      mutate((current) => archiveOp(current, id, Date.now()))
    },
    [mutate],
  )

  const unarchiveScene = useCallback(
    (id: string) => {
      mutate((current) => unarchiveOp(current, id))
    },
    [mutate],
  )

  /**
   * Permanent removal: the scene leaves the list and its record is dropped.
   * Autosave only ever puts, so the delete has to be issued by hand — and the
   * scene must stop being dirty, or a pending flush would write it straight
   * back. (A put already in flight is harmless: it was queued on the shared
   * connection first, so the delete still lands after it.)
   */
  const deleteScene = useCallback(
    (id: string) => {
      dirty.current.delete(id)
      mutate((current) => deleteOp(current, id))
      void removeScene(id).catch((error: unknown) => {
        console.error('Deleting the scene failed', error)
      })
    },
    [mutate],
  )

  /** Undo a delete: the caller hands back the scene it was holding on to. */
  const restoreScene = useCallback(
    (scene: Scene) => {
      mutate((current) => restoreOp(current, scene))
    },
    [mutate],
  )

  const renameScene = useCallback(
    (id: string, title: string) => {
      mutate((current) => renameOp(current, id, title))
    },
    [mutate],
  )

  const reorderScenes = useCallback(
    (orderedIds: string[]) => {
      mutate((current) => reorderOp(current, orderedIds))
    },
    [mutate],
  )

  const updateSource = useCallback(
    (id: string, source: string) => {
      mutate((current) =>
        current.map((s) => (s.id === id ? { ...s, source } : s)),
      )
    },
    [mutate],
  )

  /**
   * Fold an imported library in. Unlike every other operation here this one
   * writes before the state update: a replace has to remove the records it drops
   * and autosave can only put, so the store is swapped in one transaction first.
   * Pending edits are flushed beforehand so no debounced write can land on top
   * of the new library afterwards; the swap then stores every scene, so nothing
   * is left dirty.
   */
  const importLibrary = useCallback(
    async (incoming: Scene[], mode: ImportMode): Promise<Scene[]> => {
      await flush()
      const next = importScenes(scenes, incoming, { mode, newId })
      await replaceAllScenes(next)
      dirty.current.clear()
      setScenes(next)
      return next
    },
    [scenes, flush],
  )

  return {
    scenes,
    status,
    addScene,
    duplicateScene,
    archiveScene,
    unarchiveScene,
    deleteScene,
    restoreScene,
    renameScene,
    reorderScenes,
    updateSource,
    importLibrary,
  }
}
