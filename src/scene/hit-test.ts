/**
 * Resolve a client-space pointer position to the managed box under it, by
 * hit-testing *through the instrumented render* (DESIGN.md §5). The scene is a
 * same-origin `srcdoc` iframe, so we can read its document: `elementFromPoint`
 * finds what was clicked, the nearest `[data-bc]` ancestor gives the box's
 * handle, and the handle maps back to the box name. Returns null when the click
 * missed every managed box. This is a geometry seam — mocked in jsdom wiring
 * tests, exercised for real in the browser.
 */
export function hitTestBox(
  frame: HTMLIFrameElement | null,
  clientX: number,
  clientY: number,
  handles: Map<string, string>,
): string | null {
  const doc = frame?.contentDocument
  if (!doc) return null
  const frameRect = frame!.getBoundingClientRect()
  const target = doc.elementFromPoint(clientX - frameRect.left, clientY - frameRect.top)
  const handle = target?.closest('[data-bc]')?.getAttribute('data-bc')
  if (!handle) return null
  for (const [name, h] of handles) if (h === handle) return name
  return null
}
