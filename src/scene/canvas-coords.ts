import type { Point } from '../box/gesture'

/**
 * Map a client-space pointer position to canvas-relative coordinates.
 *
 * The canvas lives inside the isolated scene iframe. Because the scene is
 * same-origin (`srcDoc`), we can read the rendered `.canvas` rect straight from
 * the iframe's document (DESIGN.md §7). But that rect is relative to the
 * *iframe's* viewport, while the pointer's client coords are in the *parent*
 * page — so we compose the iframe's own offset with the in-frame canvas offset.
 * Returns null when the canvas can't be located (e.g. before the frame has
 * rendered) so callers can ignore gestures with no drop target. This is the one
 * geometry-dependent seam; the browser is where it's really exercised.
 */
export function clientToCanvas(
  frame: HTMLIFrameElement | null,
  clientX: number,
  clientY: number,
): Point | null {
  const canvas = frame?.contentDocument?.querySelector('.canvas')
  if (!canvas) return null
  const frameRect = frame!.getBoundingClientRect()
  const canvasRect = canvas.getBoundingClientRect()
  return {
    x: clientX - frameRect.left - canvasRect.left,
    y: clientY - frameRect.top - canvasRect.top,
  }
}
