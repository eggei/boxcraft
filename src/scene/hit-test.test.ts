import { describe, it, expect } from 'vitest'
import { boxNameFromElement } from './hit-test'

const handles = new Map([
  ['box-1', 'bx_aaa'],
  ['hero', 'bx_bbb'],
])

/** A tiny fake element chain: the clicked node and its nearest [data-bc]. */
function elementWithHandle(handle: string | null): Element {
  return {
    closest: (sel: string) =>
      sel === '[data-bc]' && handle
        ? ({ getAttribute: () => handle } as unknown as Element)
        : null,
  } as unknown as Element
}

describe('boxNameFromElement', () => {
  it('maps a clicked element inside a managed box to that box name', () => {
    expect(boxNameFromElement(elementWithHandle('bx_aaa'), handles)).toBe('box-1')
    expect(boxNameFromElement(elementWithHandle('bx_bbb'), handles)).toBe('hero')
  })

  it('returns null when the click is not inside any managed box', () => {
    expect(boxNameFromElement(elementWithHandle(null), handles)).toBeNull()
  })

  it('returns null for a null target or an unknown handle', () => {
    expect(boxNameFromElement(null, handles)).toBeNull()
    expect(boxNameFromElement(elementWithHandle('bx_zzz'), handles)).toBeNull()
  })
})
