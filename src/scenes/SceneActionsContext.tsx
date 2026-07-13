import { createContext, useContext, useCallback, useRef, useState, type ReactNode } from 'react'
import type { Scene } from '../persistence/scene-store'
import { useSceneStore } from '../persistence/SceneStoreContext'
import { useSceneList } from './SceneListContext'
import { nextSceneTitle, duplicateTitle } from './scene-titles'
import { SEED_SOURCE } from '../app/scene-bootstrap'

/** How long a soft-deleted scene stays undoable before it's actually gone. */
const UNDO_WINDOW_MS = 5000

export interface PendingDelete {
  scene: Scene
  index: number
}

interface SceneActions {
  addScene(): Promise<void>
  duplicateScene(id: string): Promise<void>
  softDeleteScene(id: string): Promise<void>
  renameScene(id: string, title: string): void
  reorder(order: string[]): void
  undoDelete(): void
  /** Persist a freshly captured preview snapshot (DESIGN.md §10). List metadata is untouched. */
  saveSnapshot(id: string, snapshot: string): void
  pendingDelete: PendingDelete | null
}

const SceneActionsContext = createContext<SceneActions | null>(null)

/**
 * Scene management (DESIGN.md §9): title, duplicate, soft-delete + undo,
 * reorder. One deep module hiding the store side-effects the pure
 * `sceneListReducer` doesn't know about (persisting title/order/source,
 * the undo-window timer) behind a small action surface.
 */
export function SceneActionsProvider({ children }: { children: ReactNode }) {
  const store = useSceneStore()
  const { scenes, dispatch } = useSceneList()
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scenesRef = useRef(scenes)
  scenesRef.current = scenes

  const addScene = useCallback(async () => {
    const scene: Scene = {
      id: crypto.randomUUID(),
      title: nextSceneTitle(scenesRef.current.map((s) => s.title)),
      source: SEED_SOURCE,
      order: scenesRef.current.length,
    }
    await store.put(scene)
    dispatch({ type: 'ADD', scene: { id: scene.id, title: scene.title } })
  }, [store, dispatch])

  const duplicateScene = useCallback(
    async (id: string) => {
      const original = await store.get(id)
      if (!original) return
      const fork: Scene = {
        id: crypto.randomUUID(),
        title: duplicateTitle(original.title),
        source: original.source,
        order: original.order,
      }
      await store.put(fork)
      dispatch({ type: 'INSERT_AFTER', afterId: id, scene: { id: fork.id, title: fork.title } })
    },
    [store, dispatch],
  )

  const softDeleteScene = useCallback(
    async (id: string) => {
      const scene = await store.get(id)
      const index = scenesRef.current.findIndex((s) => s.id === id)
      if (!scene || index === -1) return

      dispatch({ type: 'REMOVE', id })
      if (timerRef.current) clearTimeout(timerRef.current)
      setPendingDelete({ scene, index })
      timerRef.current = setTimeout(() => {
        store.delete(id)
        setPendingDelete(null)
      }, UNDO_WINDOW_MS)
    },
    [store, dispatch],
  )

  const undoDelete = useCallback(() => {
    if (!pendingDelete) return
    if (timerRef.current) clearTimeout(timerRef.current)
    dispatch({
      type: 'INSERT_AT',
      index: pendingDelete.index,
      scene: { id: pendingDelete.scene.id, title: pendingDelete.scene.title },
    })
    setPendingDelete(null)
  }, [pendingDelete, dispatch])

  const renameScene = useCallback(
    (id: string, title: string) => {
      dispatch({ type: 'RENAME', id, title })
      store.get(id).then((scene) => {
        if (scene) store.put({ ...scene, title })
      })
    },
    [store, dispatch],
  )

  const reorder = useCallback(
    (order: string[]) => {
      dispatch({ type: 'REORDER', order })
      order.forEach((id, index) => {
        store.get(id).then((scene) => {
          if (scene) store.put({ ...scene, order: index })
        })
      })
    },
    [store, dispatch],
  )

  const saveSnapshot = useCallback(
    (id: string, snapshot: string) => {
      store.get(id).then((scene) => {
        if (scene) store.put({ ...scene, snapshot })
      })
    },
    [store],
  )

  return (
    <SceneActionsContext.Provider
      value={{
        addScene,
        duplicateScene,
        softDeleteScene,
        renameScene,
        reorder,
        undoDelete,
        saveSnapshot,
        pendingDelete,
      }}
    >
      {children}
    </SceneActionsContext.Provider>
  )
}

export function useSceneActions() {
  const ctx = useContext(SceneActionsContext)
  if (!ctx) throw new Error('useSceneActions must be used within a SceneActionsProvider')
  return ctx
}
