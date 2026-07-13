import { StateField, RangeSetBuilder, type EditorState } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view'
import { computeGreyedRanges } from './greyed-ranges'

/**
 * Editor decorations for the boilerplate-vs-craft treatment (DESIGN.md §4):
 * boilerplate ranges (doctype, structural tags, generated box markup, JS
 * wiring) render de-emphasized via `.bc-boilerplate`; moving the cursor inside
 * one "wakes" it — swapped to `.bc-boilerplate-awake` — so it reads and edits
 * at full contrast while the cursor is there. Nothing is ever locked; this is
 * purely a rendering nudge.
 */
export function createGreyedDecorations() {
  const field = StateField.define<DecorationSet>({
    create: (state) => build(state),
    update: (_value, tr) => build(tr.state),
    provide: (f) => EditorView.decorations.from(f),
  })

  return { extension: field, field }
}

function build(state: EditorState): DecorationSet {
  const source = state.doc.toString()
  const head = state.selection.main.head
  const builder = new RangeSetBuilder<Decoration>()
  for (const range of computeGreyedRanges(source)) {
    const awake = head >= range.from && head <= range.to
    builder.add(range.from, range.to, Decoration.mark({ class: awake ? 'bc-boilerplate-awake' : 'bc-boilerplate' }))
  }
  return builder.finish()
}
