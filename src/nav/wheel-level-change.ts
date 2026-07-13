import type { Level } from './nav-reducer'

/**
 * ⌘/Ctrl+scroll changes level; plain scroll never does (DESIGN.md §2). Scroll-up
 * zooms out (L2→L1, L3→L2); scroll-down from L2 is the symmetric zoom-in,
 * dropping into the editing view (L2→L3) — DESIGN only names the up direction
 * explicitly ("zoom-out gesture"), this extends it symmetrically for down.
 */
export function wheelLevelChange(
  level: Level,
  deltaY: number,
  ctrlOrMeta: boolean,
): 'ZOOM_OUT' | 'START_EDITING' | 'EXIT_EDITING' | null {
  if (!ctrlOrMeta || deltaY === 0) return null

  if (level === 'L2') return deltaY < 0 ? 'ZOOM_OUT' : 'START_EDITING'
  if (level === 'L3') return deltaY < 0 ? 'EXIT_EDITING' : null
  return null
}
