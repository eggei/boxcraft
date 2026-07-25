// Where a dragged tile would land, as pure functions over a list.
//
// The files grid shows the prospective order while a drag is in flight, so the
// question "which gap is the pointer aiming at?" and the question "what does
// the list look like with the tile in that gap?" are worth answering away from
// React and the DOM.

/**
 * The gap a pointer at `clientX` is aiming at while over the tile sitting at
 * `index`: its left half means "before this tile", its right half "after it".
 * Gaps are numbered like array indices — gap `n` is the one before tile `n`.
 */
export function gapUnderPointer(
  index: number,
  clientX: number,
  rect: { left: number; width: number },
): number {
  return clientX > rect.left + rect.width / 2 ? index + 1 : index
}

/** `items` with `moved` spliced into the gap at `insertAt`. */
export function withMovedInto<T>(
  items: T[],
  moved: T,
  insertAt: number,
): T[] {
  return [...items.slice(0, insertAt), moved, ...items.slice(insertAt)]
}
