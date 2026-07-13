/**
 * Resolve a clicked element to the managed box that contains it (DESIGN.md §5).
 * The scene is a same-origin `srcdoc` iframe, so a click inside it lands on a
 * real element in the iframe's own document: the nearest `[data-bc]` ancestor
 * gives the box's handle, which maps back to the box name. Returns null when the
 * click was outside every managed box (e.g. the canvas background) — the caller
 * treats that as "clear selection". Pure over the target + handle map.
 */
export function boxNameFromElement(
  target: Element | null,
  handles: Map<string, string>,
): string | null {
  const handle = target?.closest('[data-bc]')?.getAttribute('data-bc')
  if (!handle) return null
  for (const [name, h] of handles) if (h === handle) return name
  return null
}
