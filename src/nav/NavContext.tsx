import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react'
import { navReducer, initialNavState, type NavState, type NavAction } from './nav-reducer'

const NavContext = createContext<{ state: NavState; dispatch: Dispatch<NavAction> } | null>(null)

/**
 * Level/focus state, split out from scene content (DESIGN.md §11) — scrolling
 * the feed or changing level never touches the per-scene source contexts.
 */
export function NavProvider({ children, initialState }: { children: ReactNode; initialState?: NavState }) {
  const [state, dispatch] = useReducer(navReducer, initialState ?? initialNavState())
  return <NavContext.Provider value={{ state, dispatch }}>{children}</NavContext.Provider>
}

export function useNav() {
  const ctx = useContext(NavContext)
  if (!ctx) throw new Error('useNav must be used within a NavProvider')
  return ctx
}
