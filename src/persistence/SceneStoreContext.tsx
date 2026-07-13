import { createContext, useContext, type ReactNode } from 'react'
import type { SceneStore } from './scene-store'

const SceneStoreContext = createContext<SceneStore | null>(null)

/** Hands the open store down to whichever level needs to load/save a scene's source. */
export function SceneStoreProvider({ store, children }: { store: SceneStore; children: ReactNode }) {
  return <SceneStoreContext.Provider value={store}>{children}</SceneStoreContext.Provider>
}

export function useSceneStore() {
  const store = useContext(SceneStoreContext)
  if (!store) throw new Error('useSceneStore must be used within a SceneStoreProvider')
  return store
}
