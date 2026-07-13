import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { createGreyedDecorations } from './greyed-decorations'

const SOURCE = '<!doctype html><html><body>hello</body></html>'

function classesAt(state: EditorState, field: ReturnType<typeof createGreyedDecorations>['field'], pos: number) {
  const classes: string[] = []
  state.field(field).between(pos, pos, (_from, _to, deco) => {
    classes.push(String(deco.spec.class))
  })
  return classes
}

describe('createGreyedDecorations', () => {
  it('marks boilerplate ranges as greyed when the cursor is elsewhere', () => {
    const { field } = createGreyedDecorations()
    let state = EditorState.create({ doc: SOURCE, extensions: [field] })
    // Move the cursor into the craft text "hello", away from the doctype.
    state = state.update({ selection: { anchor: SOURCE.indexOf('hello') } }).state

    expect(classesAt(state, field, 0)).toContain('bc-boilerplate')
  })

  it('wakes (un-greys) the boilerplate range the cursor is inside', () => {
    const { field } = createGreyedDecorations()
    let state = EditorState.create({ doc: SOURCE, extensions: [field] })

    // Move the cursor inside the doctype declaration (offset 5, inside "<!doctype html>").
    state = state.update({ selection: { anchor: 5 } }).state

    expect(classesAt(state, field, 5)).not.toContain('bc-boilerplate')
    expect(classesAt(state, field, 5)).toContain('bc-boilerplate-awake')
  })
})
