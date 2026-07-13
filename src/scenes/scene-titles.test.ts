import { describe, expect, it } from 'vitest'
import { nextSceneTitle, duplicateTitle } from './scene-titles'

describe('nextSceneTitle', () => {
  it('is "Scene 1" for an empty list', () => {
    expect(nextSceneTitle([])).toBe('Scene 1')
  })

  it('continues from the highest existing "Scene N"', () => {
    expect(nextSceneTitle(['Scene 1', 'Scene 3'])).toBe('Scene 4')
  })

  it('ignores renamed titles that no longer match the pattern', () => {
    expect(nextSceneTitle(['Hero', 'Scene 2'])).toBe('Scene 3')
  })
})

describe('duplicateTitle', () => {
  it('appends " copy" to a plain title', () => {
    expect(duplicateTitle('Scene 1')).toBe('Scene 1 copy')
  })

  it('bumps a numbered copy on a repeat duplicate', () => {
    expect(duplicateTitle('Scene 1 copy')).toBe('Scene 1 copy 2')
    expect(duplicateTitle('Scene 1 copy 2')).toBe('Scene 1 copy 3')
  })
})
