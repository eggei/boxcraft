import { describe, expect, it } from 'vitest'
import { editPath, feedPath, LEVELS, pageForPath } from './navigation'

describe('LEVELS', () => {
  it('orders the three navigation levels from furthest to closest', () => {
    expect(LEVELS).toEqual(['files', 'feed', 'edit'])
  })
})

describe('path builders', () => {
  it('addresses the feed with and without a focused scene', () => {
    expect(feedPath()).toBe('/feed')
    expect(feedPath('seed-1')).toBe('/feed/seed-1')
  })

  it('addresses a scene in the editor', () => {
    expect(editPath('seed-1')).toBe('/edit/seed-1')
  })
})

describe('pageForPath', () => {
  it('maps each page to its URL', () => {
    expect(pageForPath('/files')).toBe('files')
    expect(pageForPath('/feed')).toBe('feed')
    expect(pageForPath('/feed/seed-1')).toBe('feed')
    expect(pageForPath('/edit/seed-1')).toBe('edit')
    expect(pageForPath('/archived')).toBe('archived')
  })

  it('reads the root and anything unknown as the feed', () => {
    expect(pageForPath('/')).toBe('feed')
    expect(pageForPath('/nonsense')).toBe('feed')
  })
})
