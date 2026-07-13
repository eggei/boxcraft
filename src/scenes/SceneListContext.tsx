import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react'
import { sceneListReducer, type SceneListState, type SceneListAction } from './scene-list-reducer'

const SceneListContext = createContext<{ scenes: SceneListState; dispatch: Dispatch<SceneListAction> } | null>(null)

/**
 * Scene metadata (id/title/order) only — split from per-scene `source`
 * (DESIGN.md §11) so renaming/reordering/duplicating never re-renders every
 * mounted scene's content.
 */
export function SceneListProvider({
  initialScenes,
  children,
}: {
  initialScenes: SceneListState
  children: ReactNode
}) {
  const [scenes, dispatch] = useReducer(sceneListReducer, initialScenes)
  return <SceneListContext.Provider value={{ scenes, dispatch }}>{children}</SceneListContext.Provider>
}

export function useSceneList() {
  const ctx = useContext(SceneListContext)
  if (!ctx) throw new Error('useSceneList must be used within a SceneListProvider')
  return ctx
}
