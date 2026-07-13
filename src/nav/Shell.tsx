import { useEffect } from 'react'
import { LayoutGroup } from 'framer-motion'
import { useNav } from './NavContext'
import { wheelLevelChange } from './wheel-level-change'
import { L1FilesGrid } from './L1FilesGrid'
import { L2SnapFeed } from './L2SnapFeed'
import { L3Focus } from './L3Focus'

/**
 * The zoom shell (DESIGN.md §2): renders exactly one of L1/L2/L3 for the
 * current nav state, and owns the one cross-level gesture — ⌘/Ctrl+scroll —
 * that isn't naturally scoped to a single level's component.
 */
export function Shell() {
  const { state, dispatch } = useNav()

  useEffect(bindWheelLevelChange, [state.level])
  function bindWheelLevelChange() {
    function onWheel(e: WheelEvent) {
      const action = wheelLevelChange(state.level, e.deltaY, e.ctrlKey || e.metaKey)
      if (action) {
        e.preventDefault()
        dispatch({ type: action })
      }
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }

  return (
    <LayoutGroup>
      {state.level === 'L1' && <L1FilesGrid onOpen={(id) => dispatch({ type: 'ZOOM_IN', id })} />}
      {state.level === 'L3' && state.currentId && <L3Focus id={state.currentId} />}
      {state.level === 'L2' && <L2SnapFeed onStartEditing={() => dispatch({ type: 'START_EDITING' })} />}
    </LayoutGroup>
  )
}
