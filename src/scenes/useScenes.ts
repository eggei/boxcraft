import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getAllScenes,
  getScene,
  removeScene,
  replaceAllScenes,
  saveScene,
} from '@/persistence/scenes'
import {
  openSceneChannel,
  type SceneChange,
  type SceneChannel,
} from '@/persistence/sceneChannel'
import { importScenes, type ImportMode } from '@/library/libraryFile'
import {
  addScene as addSceneOp,
  applyStoredScenes,
  archiveScene as archiveOp,
  changedSceneIds,
  deleteScene as deleteOp,
  duplicateScene as duplicateOp,
  renameScene as renameOp,
  reorderScenes as reorderOp,
  restoreScene as restoreOp,
  sameScene,
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
 *
 * Other tabs share the store, so every write is announced on a broadcast
 * channel and every announcement heard is merged in from the store — except for
 * a scene this tab has unsaved edits to. That one becomes a conflict for the
 * person to settle (`resolveConflict`); until they do, autosave holds it back
 * rather than silently overwriting the other tab's version.
 */
export function useScenes() {
  const [scenes, setScenes] = useState<Scene[]>([])
  const [status, setStatus] = useState<Status>('loading')
  /** Ids of scenes another tab changed while this one had unsaved edits. */
  const [conflicts, setConflicts] = useState<string[]>([])

  /** The list as last committed — what a flush outside a render writes from. */
  const committed = useRef<Scene[]>(scenes)
  /** Ids whose in-memory scene is newer than its stored record. */
  const dirty = useRef(new Set<string>())
  /** Mirror of `conflicts` for code running outside a render. */
  const conflicted = useRef(new Set<string>())
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const channel = useRef<SceneChannel | null>(null)

  const announce = useCallback((change: SceneChange) => {
    if (change.ids.length > 0 || change.type === 'replace') {
      channel.current?.post(change)
    }
  }, [])

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
   * write that fails puts its id back so the next flush tries again, and a
   * scene in conflict stays dirty but unwritten until the conflict is settled.
   */
  const flush = useCallback(async () => {
    if (saveTimer.current !== null) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    const ids = new Set(
      [...dirty.current].filter((id) => !conflicted.current.has(id)),
    )
    if (ids.size === 0) return
    for (const id of ids) dirty.current.delete(id)
    const pending = committed.current.filter((scene) => ids.has(scene.id))
    const saved: string[] = []
    await Promise.all(
      pending.map((scene) =>
        saveScene(scene).then(
          () => saved.push(scene.id),
          (error: unknown) => {
            dirty.current.add(scene.id)
            console.error('Autosave failed', error)
          },
        ),
      ),
    )
    announce({ type: 'save', ids: saved })
  }, [announce])

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

  /**
   * Another tab wrote to the store: re-read what it touched and take it, scene
   * by scene. Where this tab has unsaved edits of its own, neither side wins
   * automatically — the scene is flagged as a conflict instead.
   */
  const mergeRemoteChange = useCallback(async (change: SceneChange) => {
    let stored: Map<string, Scene | undefined>
    if (change.type === 'replace') {
      const all = await getAllScenes()
      stored = new Map(all.map((scene) => [scene.id, scene]))
      // Whatever the replace dropped is gone here too.
      for (const scene of committed.current) {
        if (!stored.has(scene.id)) stored.set(scene.id, undefined)
      }
    } else {
      const records = await Promise.all(change.ids.map((id) => getScene(id)))
      stored = new Map(change.ids.map((id, index) => [id, records[index]]))
    }

    const local = new Map(committed.current.map((scene) => [scene.id, scene]))
    const clashes: string[] = []
    for (const [id, theirs] of stored) {
      if (sameScene(local.get(id), theirs)) stored.delete(id)
      else if (dirty.current.has(id)) {
        clashes.push(id)
        stored.delete(id)
      }
    }

    if (stored.size > 0) {
      // Checked again at apply time: an edit may have landed while the records
      // were being read, and that edit must not be overwritten either.
      setScenes((current) =>
        applyStoredScenes(
          current,
          new Map([...stored].filter(([id]) => !dirty.current.has(id))),
        ),
      )
    }
    if (clashes.length > 0) {
      for (const id of clashes) conflicted.current.add(id)
      setConflicts([...conflicted.current])
    }
  }, [])

  useEffect(
    function syncWithOtherTabs() {
      // Until the restore has run there is nothing to merge into — and the
      // restore reads the store fresh anyway.
      if (status !== 'ready') return
      const opened = openSceneChannel((change) => {
        void mergeRemoteChange(change).catch((error: unknown) => {
          console.error('Syncing a change from another tab failed', error)
        })
      })
      channel.current = opened
      return () => {
        opened.close()
        if (channel.current === opened) channel.current = null
      }
    },
    [status, mergeRemoteChange],
  )

  /**
   * Settle a conflict. `theirs` drops the unsaved edits and takes the stored
   * copy (which may be no scene at all, if the other tab deleted it); `mine`
   * writes this tab's copy over it, which the other tab then picks up in turn.
   */
  const resolveConflict = useCallback(
    async (id: string, keep: 'mine' | 'theirs') => {
      conflicted.current.delete(id)
      setConflicts([...conflicted.current])
      if (keep === 'mine') {
        dirty.current.add(id)
        await flush()
        return
      }
      dirty.current.delete(id)
      const theirs = await getScene(id)
      setScenes((current) => applyStoredScenes(current, new Map([[id, theirs]])))
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
      if (conflicted.current.delete(id)) setConflicts([...conflicted.current])
      mutate((current) => deleteOp(current, id))
      void removeScene(id).then(
        () => announce({ type: 'delete', ids: [id] }),
        (error: unknown) => {
          console.error('Deleting the scene failed', error)
        },
      )
    },
    [mutate, announce],
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
      // The import settled every scene, conflicted ones included.
      conflicted.current.clear()
      setConflicts([])
      setScenes(next)
      announce({ type: 'replace', ids: next.map((scene) => scene.id) })
      return next
    },
    [scenes, flush, announce],
  )

  return {
    scenes,
    status,
    conflicts,
    resolveConflict,
    flush,
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
