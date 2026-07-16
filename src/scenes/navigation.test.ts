import { describe, expect, it } from 'vitest'
import { LEVELS, zoom } from './navigation'

describe('LEVELS', () => {
  it('orders the three zoom levels from furthest to closest', () => {
    expect(LEVELS).toEqual(['files', 'feed', 'edit'])
  })
})

describe('zoom', () => {
  it('zooms in one level toward editing', () => {
    expect(zoom('files', 'in')).toBe('feed')
    expect(zoom('feed', 'in')).toBe('edit')
  })

  it('zooms out one level toward the files grid', () => {
    expect(zoom('edit', 'out')).toBe('feed')
    expect(zoom('feed', 'out')).toBe('files')
  })

  it('clamps at the ends instead of wrapping', () => {
    expect(zoom('edit', 'in')).toBe('edit')
    expect(zoom('files', 'out')).toBe('files')
  })

  it('covers every level as a valid input', () => {
    for (const level of LEVELS) {
      expect(LEVELS).toContain(zoom(level, 'in'))
      expect(LEVELS).toContain(zoom(level, 'out'))
    }
  })
})
