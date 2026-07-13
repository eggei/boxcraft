import { describe, expect, it } from 'vitest'
import { navReducer, initialNavState } from './nav-reducer'

describe('navReducer', () => {
  it('starts at L2 with no current scene', () => {
    expect(initialNavState()).toEqual({ level: 'L2', currentId: null })
  })

  it('SCROLL_TO updates currentId without changing level', () => {
    const state = navReducer(initialNavState(), { type: 'SCROLL_TO', id: 'a' })
    expect(state).toEqual({ level: 'L2', currentId: 'a' })
  })

  it('START_EDITING enters L3 for the current scene', () => {
    const inFeed = navReducer(initialNavState(), { type: 'SCROLL_TO', id: 'a' })
    const state = navReducer(inFeed, { type: 'START_EDITING' })
    expect(state).toEqual({ level: 'L3', currentId: 'a' })
  })

  it('START_EDITING is a no-op with no current scene', () => {
    const state = navReducer(initialNavState(), { type: 'START_EDITING' })
    expect(state).toEqual(initialNavState())
  })

  it('EXIT_EDITING returns from L3 to L2, keeping the focused scene current', () => {
    const editing: ReturnType<typeof navReducer> = { level: 'L3', currentId: 'a' }
    const state = navReducer(editing, { type: 'EXIT_EDITING' })
    expect(state).toEqual({ level: 'L2', currentId: 'a' })
  })

  it('ZOOM_OUT drops from L2 to L1', () => {
    const inFeed = navReducer(initialNavState(), { type: 'SCROLL_TO', id: 'a' })
    const state = navReducer(inFeed, { type: 'ZOOM_OUT' })
    expect(state).toEqual({ level: 'L1', currentId: 'a' })
  })

  it('ZOOM_IN drops into L2 centered on the clicked scene from any level', () => {
    const atL1: ReturnType<typeof navReducer> = { level: 'L1', currentId: null }
    const state = navReducer(atL1, { type: 'ZOOM_IN', id: 'b' })
    expect(state).toEqual({ level: 'L2', currentId: 'b' })
  })

  it('plain scroll (SCROLL_TO) never changes level, even in L1/L3', () => {
    const inL1: ReturnType<typeof navReducer> = { level: 'L1', currentId: 'a' }
    expect(navReducer(inL1, { type: 'SCROLL_TO', id: 'b' })).toEqual({ level: 'L1', currentId: 'b' })
  })
})
