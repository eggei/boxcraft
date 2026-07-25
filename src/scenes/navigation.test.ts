import { describe, expect, it } from 'vitest'
import { LEVELS } from './navigation'

describe('LEVELS', () => {
  it('orders the three navigation levels from furthest to closest', () => {
    expect(LEVELS).toEqual(['files', 'feed', 'edit'])
  })
})
