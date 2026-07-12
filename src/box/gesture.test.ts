import { describe, it, expect } from 'vitest'
import { rectFromGesture, DEFAULT_BOX_SIZE } from './gesture'

describe('rectFromGesture', () => {
  it('marquee: sizes the box to the drag, top-left at the min corner', () => {
    const rect = rectFromGesture({ x: 30, y: 40 }, { x: 130, y: 120 })

    expect(rect).toEqual({ x: 30, y: 40, width: 100, height: 80 })
  })

  it('marquee: normalizes a drag that goes up-and-left', () => {
    const rect = rectFromGesture({ x: 130, y: 120 }, { x: 30, y: 40 })

    expect(rect).toEqual({ x: 30, y: 40, width: 100, height: 80 })
  })

  it('click: no drag yields a default-sized box centered on the point', () => {
    const rect = rectFromGesture({ x: 200, y: 150 }, { x: 200, y: 150 })

    expect(rect.width).toBe(DEFAULT_BOX_SIZE)
    expect(rect.height).toBe(DEFAULT_BOX_SIZE)
    expect(rect.x).toBe(200 - DEFAULT_BOX_SIZE / 2)
    expect(rect.y).toBe(150 - DEFAULT_BOX_SIZE / 2)
  })

  it('click: a tiny jitter below threshold still counts as a click', () => {
    const rect = rectFromGesture({ x: 200, y: 150 }, { x: 202, y: 151 })

    expect(rect.width).toBe(DEFAULT_BOX_SIZE)
    expect(rect.height).toBe(DEFAULT_BOX_SIZE)
  })
})
