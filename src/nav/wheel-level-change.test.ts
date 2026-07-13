import { describe, expect, it } from 'vitest'
import { wheelLevelChange } from './wheel-level-change'

describe('wheelLevelChange', () => {
  it('plain scroll (no ctrl/meta) never changes level', () => {
    expect(wheelLevelChange('L2', -10, false)).toBeNull()
    expect(wheelLevelChange('L2', 10, false)).toBeNull()
  })

  it('⌘/Ctrl+scroll-up zooms out from L2 to L1', () => {
    expect(wheelLevelChange('L2', -10, true)).toBe('ZOOM_OUT')
  })

  it('⌘/Ctrl+scroll-down starts editing from L2 (into L3)', () => {
    expect(wheelLevelChange('L2', 10, true)).toBe('START_EDITING')
  })

  it('⌘/Ctrl+scroll-up exits L3 back to L2', () => {
    expect(wheelLevelChange('L3', -10, true)).toBe('EXIT_EDITING')
  })

  it('is a no-op everywhere else (L1, or scroll-down in L3)', () => {
    expect(wheelLevelChange('L1', -10, true)).toBeNull()
    expect(wheelLevelChange('L1', 10, true)).toBeNull()
    expect(wheelLevelChange('L3', 10, true)).toBeNull()
  })
})
