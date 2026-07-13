import { StateField, StateEffect, RangeSetBuilder, type EditorState } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view'
import { computeChips } from './chips'
import { handleByName } from './handle-field'
import type { HandleMarker } from './handles'

/**
 * Set the box names that currently resolve to a live element in the instrumented
 * render. The workspace reads `[data-bc]` from the iframe and dispatches this
 * effect; the chip decorations then recolor accordingly (DESIGN.md §5).
 */
export const setResolvedNames = StateEffect.define<Set<string>>()

/**
 * Editor decorations that chip managed tokens (DESIGN.md §5). A `.bc-chip` marks
 * a token whose box resolves to a live element; a `.bc-chip-error` marks a
 * managed token that no longer resolves (e.g. its `<div>` was deleted). Managed
 * names come from the handle field and resolution from the render — never from
 * naive selector matching — so user classes are never touched.
 *
 * Returns the composed `extension` plus the underlying `field` (the decoration
 * set) for direct inspection in tests.
 */
export function createChipDecorations(handleField: StateField<HandleMarker[]>) {
  const resolvedField = StateField.define<Set<string>>({
    create: () => new Set(),
    update(value, tr) {
      for (const effect of tr.effects) if (effect.is(setResolvedNames)) return effect.value
      return value
    },
  })

  const field = StateField.define<DecorationSet>({
    create: (state) => build(state, handleField, resolvedField),
    update: (_value, tr) => build(tr.state, handleField, resolvedField),
    provide: (f) => EditorView.decorations.from(f),
  })

  return { extension: [resolvedField, field], field }
}

/** Build the decoration set from the current managed names and resolved set. */
function build(
  state: EditorState,
  handleField: StateField<HandleMarker[]>,
  resolvedField: StateField<Set<string>>,
): DecorationSet {
  const source = state.doc.toString()
  const resolved = state.field(resolvedField)

  // The chip namespace is every live handle name (so a renamed box stays
  // tracked) plus every `box-N` token in the source (so a dangling rule whose
  // <div> was deleted still shows as an error, not untracked — DESIGN.md §5).
  const managed = new Set(handleByName(state.field(handleField)).keys())
  for (const match of source.matchAll(/\bbox-\d+\b/g)) managed.add(match[0])

  const chips = computeChips(source, managed, resolved)

  const builder = new RangeSetBuilder<Decoration>()
  for (const chip of chips) {
    builder.add(chip.from, chip.to, Decoration.mark({ class: chip.resolved ? 'bc-chip' : 'bc-chip-error' }))
  }
  return builder.finish()
}
