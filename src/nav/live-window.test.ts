import { describe, expect, it } from 'vitest'
import { liveWindowIds } from './live-window'

describe('liveWindowIds', () => {
  it('in L2, includes the current scene and its ± n neighbors', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    expect(liveWindowIds(ids, 'c', 1, 'L2')).toEqual(new Set(['b', 'c', 'd']))
  })

  it('clamps the window at the edges of the list', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    expect(liveWindowIds(ids, 'a', 1, 'L2')).toEqual(new Set(['a', 'b']))
    expect(liveWindowIds(ids, 'e', 1, 'L2')).toEqual(new Set(['d', 'e']))
  })

  it('in L1, nothing is live — everything is a static snapshot', () => {
    const ids = ['a', 'b', 'c']
    expect(liveWindowIds(ids, 'b', 2, 'L1')).toEqual(new Set())
  })

  it('in L3, only the focused scene is live — every other iframe freezes to static', () => {
    const ids = ['a', 'b', 'c']
    expect(liveWindowIds(ids, 'b', 2, 'L3')).toEqual(new Set(['b']))
  })

  it('is empty when there is no current scene yet', () => {
    expect(liveWindowIds(['a', 'b'], null, 1, 'L2')).toEqual(new Set())
  })

  it('is empty when the current id is not in the list', () => {
    expect(liveWindowIds(['a', 'b'], 'ghost', 1, 'L2')).toEqual(new Set())
  })
})
