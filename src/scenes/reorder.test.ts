import { describe, expect, it } from 'vitest'
import { reorderIds } from './reorder'

describe('reorderIds', () => {
  it('moves the dragged id to sit before the drop target', () => {
    expect(reorderIds(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
  })

  it('moving an id forward past its neighbor still lands right before the target', () => {
    expect(reorderIds(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'a', 'c', 'd'])
  })

  it('dropping on itself is a no-op', () => {
    expect(reorderIds(['a', 'b', 'c'], 'b', 'b')).toEqual(['a', 'b', 'c'])
  })
})
