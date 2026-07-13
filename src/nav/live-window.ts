import type { Level } from './nav-reducer'

/**
 * Which scene ids should be live (mounted `<iframe>`) vs. cheap static
 * previews — the windowing rule that keeps L2 scrollable at any list size
 * (DESIGN.md §2). Pure function of the list + current position + level.
 */
export function liveWindowIds(
  orderedIds: string[],
  currentId: string | null,
  n: number,
  level: Level,
): Set<string> {
  if (level === 'L1' || currentId === null) return new Set()

  const index = orderedIds.indexOf(currentId)
  if (index === -1) return new Set()

  if (level === 'L3') return new Set([currentId])

  // L2: current ± n neighbors live, the rest static.
  return new Set(orderedIds.slice(Math.max(0, index - n), index + n + 1))
}
