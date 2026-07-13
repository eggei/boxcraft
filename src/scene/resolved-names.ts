/**
 * The set of managed box names that currently resolve to a live element in the
 * instrumented render. Each managed `<div>` carries a `data-bc="<handle>"`; a
 * box resolves when its handle is present in the rendered document. Handles for
 * boxes whose `<div>` was deleted never appear, so those names are excluded —
 * this drives chip vs. error coloring (DESIGN.md §5). A render seam: real in the
 * browser, and populated on iframe load.
 */
export function resolvedNamesFromFrame(
  frame: HTMLIFrameElement | null,
  handles: Map<string, string>,
): Set<string> {
  const doc = frame?.contentDocument
  if (!doc) return new Set()
  const present = new Set<string>()
  doc.querySelectorAll('[data-bc]').forEach((el) => {
    const handle = el.getAttribute('data-bc')
    if (handle) present.add(handle)
  })
  const names = new Set<string>()
  for (const [name, handle] of handles) if (present.has(handle)) names.add(name)
  return names
}
