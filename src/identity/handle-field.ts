import { StateField } from '@codemirror/state'
import { reconcileHandles, type HandleMarker } from './handles'
import { createHandleMinter } from './handles'

/**
 * A CodeMirror `StateField` holding the live handle↔box bindings (DESIGN.md §5).
 * Each editor gets its own field (and its own minter) via this factory, so
 * handles are session-scoped and never leak between scenes.
 *
 * On every document change the field maps each marker's opening-tag anchor and
 * name-token span through the edit — giving each handle its stability across
 * edits and undo, and its name (re-read straight from the mapped span) its
 * accuracy across a Rename *and* CodeMirror's built-in undo/redo of one, with
 * no annotation needed — then reconciles against the new document to mint
 * handles for fresh `box-N` boxes and drop those whose `<div>` was deleted.
 * Handles are never written into the document; this field *is* the app-owned
 * identity layer.
 */
export function createHandleField(): StateField<HandleMarker[]> {
  const mint = createHandleMinter()
  return StateField.define<HandleMarker[]>({
    create(state) {
      return reconcileHandles([], state.doc.toString(), mint)
    },
    update(value, tr) {
      if (!tr.docChanged) return value
      const mapped = value.map((m) => {
        const from = tr.changes.mapPos(m.from)
        const to = tr.changes.mapPos(m.to)
        // Map the name-token span itself (assoc 1/-1 so it expands to swallow
        // whatever text now occupies that slot) and read the name straight off
        // the new document, rather than trusting a carried-forward string. This
        // way the name always matches what's actually on the page — through a
        // Rename, and just as correctly through CodeMirror's built-in undo/redo
        // of one, with no annotation required to survive the round trip.
        const nameFrom = tr.changes.mapPos(m.nameFrom, 1)
        const nameTo = tr.changes.mapPos(m.nameTo, -1)
        const name = nameFrom < nameTo ? tr.newDoc.sliceString(nameFrom, nameTo) : m.name
        return { ...m, from, to, nameFrom, nameTo, name }
      })
      return reconcileHandles(mapped, tr.newDoc.toString(), mint)
    },
  })
}

/** The current `box-name → handle` map, as instrument and chips consume it. */
export function handleByName(markers: HandleMarker[]): Map<string, string> {
  return new Map(markers.map((m) => [m.name, m.handle]))
}
