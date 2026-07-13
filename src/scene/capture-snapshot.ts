/**
 * Build a `data:image/svg+xml` URL wrapping a document's rendered HTML in an
 * SVG `<foreignObject>` — the dependency-free way to turn a live DOM subtree
 * into a rasterizable image (no `html2canvas`, DESIGN.md §10). Pure and
 * testable; the actual capture (below) is the browser-only glue around it.
 */
export function buildSnapshotSvgDataUrl(html: string, width: number, height: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<foreignObject width="100%" height="100%">` +
    `<html xmlns="http://www.w3.org/1999/xhtml">${html}</html>` +
    `</foreignObject></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/**
 * Capture a live, same-origin scene iframe as a `data:image/png` snapshot
 * (DESIGN.md §10 — cached preview snapshots), replacing the sandboxed-iframe
 * placeholder for L1/L2 previews. Since the scene is same-origin (`srcDoc`),
 * this reads `frame.contentDocument` directly rather than round-tripping
 * through `postMessage` — there is no origin boundary to cross.
 *
 * Rasterizes via the SVG `<foreignObject>` trick (`buildSnapshotSvgDataUrl`):
 * no new dependency, works for the CSS-only craft this app targets. Resolves
 * to `null` on any failure (e.g. a tainted canvas, an unloaded frame) — a
 * missed snapshot should never break the app, only leave the previous/placeholder
 * preview in place. Browser-only (Image loading + canvas drawing); not
 * meaningfully unit-testable under jsdom, like the other geometry/render seams.
 */
export async function captureSnapshot(frame: HTMLIFrameElement): Promise<string | null> {
  try {
    const doc = frame.contentDocument
    const root = doc?.documentElement
    if (!doc || !root) return null

    const width = root.scrollWidth
    const height = root.scrollHeight
    if (!width || !height) return null

    const svgUrl = buildSnapshotSvgDataUrl(root.outerHTML, width, height)

    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('snapshot image failed to load'))
      image.src = svgUrl
    })

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(image, 0, 0, width, height)

    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}
