import { useEffect, useState } from 'react'
import { useSceneStore } from './SceneStoreContext'

/**
 * Loads one scene's `source` by id, independent of the scene-list context —
 * so a live window/preview only re-fetches when its own id changes, never
 * when the list reorders or another scene's title changes (DESIGN.md §11).
 */
export function useSceneSource(id: string): string | undefined {
  const store = useSceneStore()
  const [source, setSource] = useState<string | undefined>(undefined)

  useEffect(loadSource, [store, id])
  function loadSource() {
    let cancelled = false
    setSource(undefined)
    store.get(id).then((scene) => {
      if (!cancelled) setSource(scene?.source)
    })
    return () => {
      cancelled = true
    }
  }

  return source
}
