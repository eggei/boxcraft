import { useEffect, useRef, useState } from 'react'
import { openSceneStore, type Scene, type SceneStore } from './persistence/scene-store'
import { loadOrCreateDefaultScene } from './app/scene-bootstrap'
import { SceneWorkspace } from './scene/SceneWorkspace'

/**
 * Phase 0 shell: open the local store, load (or seed) the single scene, and
 * host the edit → render loop. Edits autosave continuously (DESIGN.md §10);
 * the store is injectable so the loop can be exercised without a real browser.
 */
export default function App({
  openStore = openSceneStore,
}: {
  openStore?: () => Promise<SceneStore>
}) {
  const [scene, setScene] = useState<Scene | null>(null)
  const storeRef = useRef<SceneStore | null>(null)

  useEffect(loadScene, [openStore])
  function loadScene() {
    let cancelled = false
    openStore().then(async (store) => {
      const loaded = await loadOrCreateDefaultScene(store)
      if (cancelled) return
      storeRef.current = store
      setScene(loaded)
    })
    return () => {
      cancelled = true
    }
  }

  if (!scene) {
    return <div className="p-4 text-muted-foreground">Loading…</div>
  }

  return (
    <div className="h-screen">
      <SceneWorkspace
        initialSource={scene.source}
        onSourceChange={(source) => {
          storeRef.current?.put({ ...scene, source })
        }}
      />
    </div>
  )
}
