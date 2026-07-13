import { useEffect, useState } from 'react'
import { useSceneStore } from './SceneStoreContext'

/**
 * Loads one scene's cached preview `snapshot` by id, independent of the
 * scene-list context and of `useSceneSource` (DESIGN.md §11) — a preview
 * re-fetches only when its own id changes. Undefined while loading and when
 * no snapshot has been captured yet, so callers (ScenePreview) can fall back
 * to the placeholder.
 */
export function useSceneSnapshot(id: string): string | undefined {
  const store = useSceneStore()
  const [snapshot, setSnapshot] = useState<string | undefined>(undefined)

  useEffect(loadSnapshot, [store, id])
  function loadSnapshot() {
    let cancelled = false
    setSnapshot(undefined)
    store.get(id).then((scene) => {
      if (!cancelled) setSnapshot(scene?.snapshot)
    })
    return () => {
      cancelled = true
    }
  }

  return snapshot
}
