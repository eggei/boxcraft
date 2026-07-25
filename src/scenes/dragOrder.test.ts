import { describe, expect, it } from 'vitest'
import { gapUnderPointer, withMovedInto } from './dragOrder'

/** A 240px-wide tile whose left edge sits at x=0, so x<120 is its left half. */
const TILE = { left: 0, width: 240 }

describe('gapUnderPointer', () => {
  it('aims at the gap before a tile from its left half', () => {
    expect(gapUnderPointer(1, 40, TILE)).toBe(1)
  })

  it('aims at the gap after a tile from its right half', () => {
    expect(gapUnderPointer(1, 200, TILE)).toBe(2)
  })

  it('measures from the tile, not the viewport', () => {
    expect(gapUnderPointer(3, 700, { left: 600, width: 240 })).toBe(3)
    expect(gapUnderPointer(3, 760, { left: 600, width: 240 })).toBe(4)
  })
})

describe('withMovedInto', () => {
  it('splices into the named gap', () => {
    expect(withMovedInto(['a', 'b', 'c'], 'x', 0)).toEqual(['x', 'a', 'b', 'c'])
    expect(withMovedInto(['a', 'b', 'c'], 'x', 2)).toEqual(['a', 'b', 'x', 'c'])
  })

  it('appends when the gap is past the end', () => {
    expect(withMovedInto(['a', 'b'], 'x', 2)).toEqual(['a', 'b', 'x'])
  })
})
