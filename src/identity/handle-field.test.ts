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
})
