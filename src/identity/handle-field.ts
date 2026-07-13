import { StateField, Annotation } from '@codemirror/state'
import { reconcileHandles, type HandleMarker } from './handles'
import { createHandleMinter } from './handles'

/**
 * Marks a transaction as a Rename of a specific handle to a new name. The
 * handle field reads it to update that marker's name in lockstep with the text
 * edit — so identity is preserved while the public name changes (DESIGN.md §5).
 */
export const renameHandle = Annotation.define<{ handle: string; name: string }>()

/**
 * A CodeMirror `StateField` holding the live handle↔box bindings (DESIGN.md §5).
 * Each editor gets its own field (and its own minter) via this factory, so
 * handles are session-scoped and never leak between scenes.
 *
 * On every document change the field maps the previous markers through the edit
 * — giving each handle its stability across edits and undo — applies any rename
 * annotation to the affected marker's name, then reconciles against the new
 * document to mint handles for fresh `box-N` boxes and drop those whose `<div>`
 * was deleted. Handles are never written into the document; this field *is* the
 * app-owned identity layer.
 */
export function createHandleField(): StateField<HandleMarker[]> {
  const mint = createHandleMinter()
  return StateField.define<HandleMarker[]>({
    create(state) {
      return reconcileHandles([], state.doc.toString(), mint)
    },
    update(value, tr) {
      if (!tr.docChanged) return value
      const renamed = tr.annotation(renameHandle)
      const mapped = value.map((m) => {
        const from = tr.changes.mapPos(m.from)
        const to = tr.changes.mapPos(m.to)
        const name = renamed && m.handle === renamed.handle ? renamed.name : m.name
        return { ...m, from, to, name }
      })
      return reconcileHandles(mapped, tr.newDoc.toString(), mint)
    },
  })
}

/** The current `box-name → handle` map, as instrument and chips consume it. */
export function handleByName(markers: HandleMarker[]): Map<string, string> {
  return new Map(markers.map((m) => [m.name, m.handle]))
}
