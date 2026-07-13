/** The three zoom levels (DESIGN.md §2). */
export type Level = 'L1' | 'L2' | 'L3'

export interface NavState {
  level: Level
  /** The scene centered in L2, or focused in L3. Null only before anything has loaded. */
  currentId: string | null
}

export type NavAction =
  /** Feed scroll settles on a scene — never changes level (DESIGN.md §2). */
  | { type: 'SCROLL_TO'; id: string }
  /** L2 → L3: "Start Editing" (⌘+Enter) on the current scene. */
  | { type: 'START_EDITING' }
  /** L3 → L2: Esc / exit-focus. */
  | { type: 'EXIT_EDITING' }
  /** L2 → L1: zoom-out gesture (⌘/Ctrl+scroll-up, `-`, pinch). */
  | { type: 'ZOOM_OUT' }
  /** L1 → L2: click a snapshot, dropping into the feed centered on it. */
  | { type: 'ZOOM_IN'; id: string }

export function initialNavState(): NavState {
  return { level: 'L2', currentId: null }
}

export function navReducer(state: NavState, action: NavAction): NavState {
  switch (action.type) {
    case 'SCROLL_TO':
      return { ...state, currentId: action.id }
    case 'START_EDITING':
      return state.level === 'L2' && state.currentId ? { ...state, level: 'L3' } : state
    case 'EXIT_EDITING':
      return state.level === 'L3' ? { ...state, level: 'L2' } : state
    case 'ZOOM_OUT':
      return state.level === 'L2' ? { ...state, level: 'L1' } : state
    case 'ZOOM_IN':
      return { level: 'L2', currentId: action.id }
  }
}
