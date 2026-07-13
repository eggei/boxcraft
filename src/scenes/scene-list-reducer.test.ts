import { describe, expect, it } from 'vitest'
import { sceneListReducer } from './scene-list-reducer'

describe('sceneListReducer', () => {
  it('ADD appends a scene to the end of the list', () => {
    const state = sceneListReducer([{ id: 'a', title: 'Scene 1' }], {
      type: 'ADD',
      scene: { id: 'b', title: 'Scene 2' },
    })
    expect(state).toEqual([
      { id: 'a', title: 'Scene 1' },
      { id: 'b', title: 'Scene 2' },
    ])
  })

  it('INSERT_AFTER places a duplicate right after its original', () => {
    const state = sceneListReducer(
      [
        { id: 'a', title: 'Scene 1' },
        { id: 'c', title: 'Scene 3' },
      ],
      { type: 'INSERT_AFTER', afterId: 'a', scene: { id: 'b', title: 'Scene 1 copy' } },
    )
    expect(state.map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('REMOVE drops a scene by id (soft-delete at the list level)', () => {
    const state = sceneListReducer(
      [
        { id: 'a', title: 'Scene 1' },
        { id: 'b', title: 'Scene 2' },
      ],
      { type: 'REMOVE', id: 'a' },
    )
    expect(state).toEqual([{ id: 'b', title: 'Scene 2' }])
  })

  it('INSERT_AT restores a removed scene at its original index (undo)', () => {
    const state = sceneListReducer([{ id: 'b', title: 'Scene 2' }], {
      type: 'INSERT_AT',
      index: 0,
      scene: { id: 'a', title: 'Scene 1' },
    })
    expect(state).toEqual([
      { id: 'a', title: 'Scene 1' },
      { id: 'b', title: 'Scene 2' },
    ])
  })

  it('REORDER replaces list order to match dragged order', () => {
    const state = sceneListReducer(
      [
        { id: 'a', title: 'Scene 1' },
        { id: 'b', title: 'Scene 2' },
        { id: 'c', title: 'Scene 3' },
      ],
      { type: 'REORDER', order: ['c', 'a', 'b'] },
    )
    expect(state.map((s) => s.id)).toEqual(['c', 'a', 'b'])
  })

  it('RENAME updates only the targeted scene title', () => {
    const state = sceneListReducer(
      [
        { id: 'a', title: 'Scene 1' },
        { id: 'b', title: 'Scene 2' },
      ],
      { type: 'RENAME', id: 'b', title: 'Hero' },
    )
    expect(state).toEqual([
      { id: 'a', title: 'Scene 1' },
      { id: 'b', title: 'Hero' },
    ])
  })
})
