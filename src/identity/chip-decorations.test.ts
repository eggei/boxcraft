import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import type { DecorationSet } from '@codemirror/view'
import { createHandleField } from './handle-field'
import { createChipDecorations, setResolvedNames } from './chip-decorations'

const SCENE = `<style>
  .box-1 { position: absolute; }
  .box-2 { position: absolute; }
</style>
<div class="canvas">
  <div class="box-1"></div>
  <div class="box-2"></div>
</div>`

/** Collect decorations as { text, cls } pairs for assertions. */
function collect(set: DecorationSet, doc: string) {
  const marks: { text: string; cls: string }[] = []
  const iter = set.iter()
  while (iter.value) {
    marks.push({ text: doc.slice(iter.from, iter.to), cls: iter.value.spec.class })
    iter.next()
  }
  return marks
}

describe('chip decorations', () => {
  it('marks resolved managed tokens as chips and unresolved ones as errors', () => {
    const handleField = createHandleField()
    const chips = createChipDecorations(handleField)
    let state = EditorState.create({ doc: SCENE, extensions: [handleField, chips.extension] })

    // Render correspondence: box-1 resolves to a live element, box-2 does not.
    state = state.update({ effects: setResolvedNames.of(new Set(['box-1'])) }).state

    const marks = collect(state.field(chips.field), SCENE)
    const chip = marks.filter((m) => m.cls === 'bc-chip')
    const error = marks.filter((m) => m.cls === 'bc-chip-error')

    // Both of box-1's occurrences (selector + class) are chips.
    expect(chip.every((m) => m.text === 'box-1')).toBe(true)
    expect(chip.length).toBe(2)
    // Both of box-2's occurrences are error-colored.
    expect(error.every((m) => m.text === 'box-2')).toBe(true)
    expect(error.length).toBe(2)
  })

  it('error-colors an orphaned box-N rule whose <div> was deleted (no live handle)', () => {
    // box-1 has a <div> + rule; box-2 has only a rule (its <div> was deleted, so
    // no handle exists for it). box-2 is still in the tool's namespace, so its
    // dangling reference must go error-colored, not silently untracked (§5).
    const orphaned = `<style>
  .box-1 { position: absolute; }
  .box-2 { position: absolute; }
</style>
<div class="canvas">
  <div class="box-1"></div>
</div>`
    const handleField = createHandleField()
    const chips = createChipDecorations(handleField)
    let state = EditorState.create({ doc: orphaned, extensions: [handleField, chips.extension] })
    state = state.update({ effects: setResolvedNames.of(new Set(['box-1'])) }).state

    const marks = collect(state.field(chips.field), orphaned)
    // box-1 resolves at both occurrences (selector + class); box-2 has only its
    // orphaned selector left, and it is error-colored.
    expect(marks.filter((m) => m.cls === 'bc-chip').map((m) => m.text)).toEqual(['box-1', 'box-1'])
    expect(marks.filter((m) => m.cls === 'bc-chip-error').map((m) => m.text)).toEqual(['box-2'])
  })
})
