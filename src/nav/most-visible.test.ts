import { describe, expect, it } from 'vitest'
import { mostVisibleId } from './most-visible'

function entry(id: string, isIntersecting: boolean, intersectionRatio: number): IntersectionObserverEntry {
  return {
    isIntersecting,
    intersectionRatio,
    target: { dataset: { sceneId: id } } as unknown as Element,
  } as IntersectionObserverEntry
}

describe('mostVisibleId', () => {
  it('picks the intersecting entry with the highest ratio', () => {
    const entries = [entry('a', true, 0.4), entry('b', true, 0.9), entry('c', false, 1)]
    expect(mostVisibleId(entries)).toBe('b')
  })

  it('is undefined when nothing is intersecting', () => {
    expect(mostVisibleId([entry('a', false, 0)])).toBeUndefined()
  })
})
