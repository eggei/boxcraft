import { useEffect, useState } from 'react'
import { openSceneStore, type Scene, type SceneStore } from './persistence/scene-store'
import { loadOrCreateSceneList } from './app/scene-bootstrap'
import { SceneStoreProvider } from './persistence/SceneStoreContext'
import { SceneListProvider } from './scenes/SceneListContext'
import { SceneActionsProvider } from './scenes/SceneActionsContext'
import { NavProvider } from './nav/NavContext'
import { Shell } from './nav/Shell'
import { DeleteUndoToast } from './scenes/DeleteUndoToast'

/**
 * The Phase-4 zoom shell: open the local store, load (or seed) the flat scene
 * list, and host L1/L2/L3 navigation over it. Scene metadata (list/order) and
 * per-scene source live in separate contexts (DESIGN.md §11) so editing one
 * scene or reordering the list never re-renders the other.
 */
export default function App({
  openStore = openSceneStore,
}: {
  openStore?: () => Promise<SceneStore>
}) {
  const [store, setStore] = useState<SceneStore | null>(null)
  const [scenes, setScenes] = useState<Scene[] | null>(null)

  useEffect(loadScenes, [openStore])
  function loadScenes() {
    let cancelled = false
    openStore().then(async (openedStore) => {
      const loaded = await loadOrCreateSceneList(openedStore)
      if (cancelled) return
      setStore(openedStore)
      setScenes(loaded)
    })
    return () => {
      cancelled = true
    }
  }

  if (!store || !scenes) {
    return <div className="p-4 text-muted-foreground">Loading…</div>
  }

  return (
    <div className="h-screen">
      <SceneStoreProvider store={store}>
        <SceneListProvider initialScenes={scenes.map((s) => ({ id: s.id, title: s.title }))}>
          <SceneActionsProvider>
            <NavProvider>
              <Shell />
              <DeleteUndoToast />
            </NavProvider>
          </SceneActionsProvider>
        </SceneListProvider>
      </SceneStoreProvider>
    </div>
  )
}
