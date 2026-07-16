// Pure three-level zoom navigation logic.
//
// L1 (files) is furthest out, L3 (edit) is closest in. Zooming moves one step
// along this continuum and clamps at the ends (no wrap-around). Everything
// gesture/animation-related lives in the adapters; this is just the model.

export const LEVELS = ['files', 'feed', 'edit'] as const

export type Level = (typeof LEVELS)[number]

export type ZoomDirection = 'in' | 'out'

export function zoom(level: Level, direction: ZoomDirection): Level {
  const index = LEVELS.indexOf(level)
  const next = direction === 'in' ? index + 1 : index - 1
  const clamped = Math.max(0, Math.min(LEVELS.length - 1, next))
  return LEVELS[clamped]
}
