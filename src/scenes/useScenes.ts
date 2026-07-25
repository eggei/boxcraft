import { useCallback, useEffect, useState } from 'react'
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

function newId(): string {
  return `scene-${crypto.randomUUID()}`
}

/**
 * Multi-scene state: the full list (active + archived) held in memory, seeded
 * on first run, and continuously autosaved to IndexedDB. All list logic lives
 * in the pure sceneList module; this hook is a thin React/IO adapter over it.
 */
export function useScenes() {
  const [scenes, setScenes] = useState<Scene[]>([])
  const [status, setStatus] = useState<Status>('loading')

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

  useEffect(
    function autosave() {
      if (status !== 'ready') return
      void Promise.all(scenes.map(saveScene))
    },
    [scenes, status],
  )

  const addScene = useCallback((): string => {
    const id = newId()
    setScenes((current) => addSceneOp(current, { id }).scenes)
    return id
  }, [])

  const duplicateScene = useCallback((id: string): string => {
    const newSceneId = newId()
    setScenes((current) => duplicateOp(current, id, newSceneId).scenes)
    return newSceneId
  }, [])

  const archiveScene = useCallback((id: string) => {
    setScenes((current) => archiveOp(current, id, Date.now()))
  }, [])

  const unarchiveScene = useCallback((id: string) => {
    setScenes((current) => unarchiveOp(current, id))
  }, [])

  /**
   * Permanent removal: the scene leaves the list and its record is dropped.
   * Autosave only ever puts, so the delete has to be issued by hand — leaving it
   * to autosave would keep the record alive until the next replace.
   */
  const deleteScene = useCallback((id: string) => {
    setScenes((current) => deleteOp(current, id))
    void removeScene(id)
  }, [])

  /** Undo a delete: the caller hands back the scene it was holding on to. */
  const restoreScene = useCallback((scene: Scene) => {
    setScenes((current) => restoreOp(current, scene))
  }, [])

  const renameScene = useCallback((id: string, title: string) => {
    setScenes((current) => renameOp(current, id, title))
  }, [])

  const reorderScenes = useCallback((orderedIds: string[]) => {
    setScenes((current) => reorderOp(current, orderedIds))
  }, [])

  const updateSource = useCallback((id: string, source: string) => {
    setScenes((current) =>
      current.map((s) => (s.id === id ? { ...s, source } : s)),
    )
  }, [])

  /**
   * Fold an imported library in. Unlike every other operation here this one
   * writes before the state update: a replace has to remove the records it drops
   * and autosave can only put, so the store is swapped in one transaction first.
   */
  const importLibrary = useCallback(
    async (incoming: Scene[], mode: ImportMode): Promise<Scene[]> => {
      const next = importScenes(scenes, incoming, { mode, newId })
      await replaceAllScenes(next)
      setScenes(next)
      return next
    },
    [scenes],
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
