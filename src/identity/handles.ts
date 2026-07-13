import { locateBoxes } from '../box/locate-boxes'
import { parseElements } from '../box/html-tree'

/**
 * A minter of app-owned box handles (`bx_…`). Handles are opaque internal ids
 * that track a box; they are never written into the document (DESIGN.md §5).
 * Identity is session-scoped: a fresh minter is used per editor, handles are
 * re-minted on load, and stability across edits/undo comes from the CodeMirror
 * range-markers they are attached to — not from the id itself.
 */
export function createHandleMinter(): () => string {
  let n = 0
  return () => `bx_${(++n).toString(36)}`
}

/**
 * A handle bound to a box in the editor: the app-owned `handle`, the box's
 * current public `name`, and the source range of its opening tag. The range is
 * what CodeMirror maps through edits, giving the handle its stability.
 */
export interface HandleMarker {
  handle: string
  name: string
  from: number
  to: number
}

/**
 * Reconcile the handle set after a document change. `prev` holds the previous
 * markers with their ranges already mapped into `source`'s coordinates
 * (CodeMirror does this mapping in the editor) and their names already updated
 * for any rename this transaction carried. `source` is the new document.
 *
 * The markers — not a text pattern — are the authority for what is managed: a
 * marker survives whenever its opening tag still exists (matched by its start
 * offset), so identity persists across edits, undo, and even a rename that
 * moves the box out of the `box-N` namespace (rename never touches the `<div`
 * prefix the marker anchors to). Markers whose `<div>` was deleted are dropped.
 * Fresh `box-N` boxes not yet covered by a marker mint a new handle — this is
 * how tool-inserted and hand-typed boxes are adopted (DESIGN.md §5).
 */
export function reconcileHandles(
  prev: HandleMarker[],
  source: string,
  mint: () => string,
): HandleMarker[] {
  const openTagTos = new Map(parseElements(source).map((el) => [el.openFrom, el.openTo]))

  const survivors = prev
    .filter((m) => openTagTos.has(m.from))
    .map((m) => ({ ...m, to: openTagTos.get(m.from)! }))
  const survivorFroms = new Set(survivors.map((m) => m.from))

  const minted = locateBoxes(source)
    .filter((box) => !survivorFroms.has(box.openTagFrom))
    .map((box) => ({
      handle: mint(),
      name: box.name,
      from: box.openTagFrom,
      to: box.openTagTo,
    }))

  return [...survivors, ...minted].sort((a, b) => a.from - b.from)
}
