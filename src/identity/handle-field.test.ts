import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { createHandleField, handleByName } from './handle-field'

const ONE = `<div class="canvas">
  <div class="box-1"></div>
</div>`

describe('handle field', () => {
  it('binds a handle to each box on load', () => {
    const field = createHandleField()
    const state = EditorState.create({ doc: ONE, extensions: [field] })

    const handles = handleByName(state.field(field))
    expect([...handles.keys()]).toEqual(['box-1'])
    expect(handles.get('box-1')).toMatch(/^bx_/)
  })

  it('preserves an existing handle and mints one for a box typed later', () => {
    const field = createHandleField()
    const state = EditorState.create({ doc: ONE, extensions: [field] })
    const box1Handle = handleByName(state.field(field)).get('box-1')

    // Type a second box after box-1 (box-1's opening tag stays put).
    const at = ONE.indexOf('</div>') + '</div>'.length
    const next = state.update({
      changes: { from: at, insert: '\n  <div class="box-2"></div>' },
    }).state

    const handles = handleByName(next.field(field))
    expect([...handles.keys()]).toEqual(['box-1', 'box-2'])
    // box-1 kept its identity through the edit; box-2 is distinct.
    expect(handles.get('box-1')).toBe(box1Handle)
    expect(handles.get('box-2')).not.toBe(box1Handle)
  })

  it('keeps the handle bound after undoing a rename — no annotation required', () => {
    const field = createHandleField()
    let state = EditorState.create({ doc: ONE, extensions: [field] })
    const box1Handle = handleByName(state.field(field)).get('box-1')

    // Rename box-1 -> hero: replace just the class-value token.
    const nameFrom = ONE.indexOf('box-1')
    const renameTr = state.update({
      changes: { from: nameFrom, to: nameFrom + 'box-1'.length, insert: 'hero' },
    })
    state = renameTr.state
    expect(handleByName(state.field(field)).get('hero')).toBe(box1Handle)

    // Undo via CodeMirror's own inverted changes — no rename annotation at all.
    const undoTr = state.update({ changes: renameTr.changes.invert(renameTr.startState.doc) })
    state = undoTr.state

    const handles = handleByName(state.field(field))
    expect(handles.get('box-1')).toBe(box1Handle)
    expect(handles.has('hero')).toBe(false)
  })
})
