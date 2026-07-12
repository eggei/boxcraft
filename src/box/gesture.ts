import type { BoxRect } from './insert-box'

/** Side length of a box created by a click (no marquee drag). */
export const DEFAULT_BOX_SIZE = 100

/** Below this drag distance (px, either axis) a gesture is treated as a click. */
const CLICK_THRESHOLD = 4

export interface Point {
  x: number
  y: number
}

/**
 * Turn a pointer gesture into a box rectangle in canvas-relative pixels
 * (DESIGN.md §7). A marquee sizes the box to the drag (normalized so dragging
 * in any direction works); a click (drag below threshold) drops a default-sized
 * box centered on the point.
 */
export function rectFromGesture(start: Point, end: Point): BoxRect {
  const dx = end.x - start.x
  const dy = end.y - start.y

  if (Math.abs(dx) < CLICK_THRESHOLD && Math.abs(dy) < CLICK_THRESHOLD) {
    return {
      x: Math.round(start.x - DEFAULT_BOX_SIZE / 2),
      y: Math.round(start.y - DEFAULT_BOX_SIZE / 2),
      width: DEFAULT_BOX_SIZE,
      height: DEFAULT_BOX_SIZE,
    }
  }

  return {
    x: Math.round(Math.min(start.x, end.x)),
    y: Math.round(Math.min(start.y, end.y)),
    width: Math.round(Math.abs(dx)),
    height: Math.round(Math.abs(dy)),
  }
}
