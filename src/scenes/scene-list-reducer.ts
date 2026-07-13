/**
 * Scene metadata only — no `source` (DESIGN.md §11: split contexts so a
 * per-scene edit or reorder never re-renders every scene's content). List
 * order *is* array order; that's what the persisted `order` field mirrors.
 */
export interface SceneMeta {
  id: string
  title: string
}

export type SceneListState = SceneMeta[]

export type SceneListAction =
  | { type: 'ADD'; scene: SceneMeta }
  /** Duplicate: insert the fork immediately after its original (DESIGN.md §9). */
  | { type: 'INSERT_AFTER'; afterId: string; scene: SceneMeta }
  /** Soft-delete: drop from the list; the caller holds the meta for undo. */
  | { type: 'REMOVE'; id: string }
  /** Undo a soft-delete, restoring the scene at its original position. */
  | { type: 'INSERT_AT'; index: number; scene: SceneMeta }
  /** Drag-reorder in L1 (DESIGN.md §9) — full replacement order of ids. */
  | { type: 'REORDER'; order: string[] }
  | { type: 'RENAME'; id: string; title: string }

export function sceneListReducer(state: SceneListState, action: SceneListAction): SceneListState {
  switch (action.type) {
    case 'ADD':
      return [...state, action.scene]
    case 'INSERT_AFTER': {
      const index = state.findIndex((s) => s.id === action.afterId)
      const at = index === -1 ? state.length : index + 1
      return [...state.slice(0, at), action.scene, ...state.slice(at)]
    }
    case 'REMOVE':
      return state.filter((s) => s.id !== action.id)
    case 'INSERT_AT':
      return [...state.slice(0, action.index), action.scene, ...state.slice(action.index)]
    case 'REORDER':
      return action.order.map((id) => state.find((s) => s.id === id)).filter((s): s is SceneMeta => s !== undefined)
    case 'RENAME':
      return state.map((s) => (s.id === action.id ? { ...s, title: action.title } : s))
  }
}
