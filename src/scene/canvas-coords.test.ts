import { describe, it, expect } from 'vitest'
import { clientToCanvas } from './canvas-coords'

/**
 * A stand-in for the scene iframe. The canvas lives *inside* the frame, so its
 * getBoundingClientRect is relative to the frame's own viewport; the frame in
 * turn sits at an offset in the parent page. clientToCanvas must compose both.
 */
function fakeFrame(frameOffset: { left: number; top: number }, canvasInFrame: { left: number; top: number }) {
  return {
    getBoundingClientRect: () => ({ left: frameOffset.left, top: frameOffset.top }) as DOMRect,
    contentDocument: {
      querySelector: () => ({
        getBoundingClientRect: () => ({ left: canvasInFrame.left, top: canvasInFrame.top }) as DOMRect,
      }),
    },
  } as unknown as HTMLIFrameElement
}

describe('clientToCanvas', () => {
  it('subtracts both the frame offset and the in-frame canvas offset', () => {
    // Frame sits at parent (640, 0); canvas sits at (120, 160) inside the frame,
    // so the canvas origin in parent space is (760, 160).
    const frame = fakeFrame({ left: 640, top: 0 }, { left: 120, top: 160 })

    expect(clientToCanvas(frame, 820, 240)).toEqual({ x: 60, y: 80 })
  })

  it('returns null when the canvas is not present', () => {
    const frame = {
      getBoundingClientRect: () => ({ left: 0, top: 0 }) as DOMRect,
      contentDocument: { querySelector: () => null },
    } as unknown as HTMLIFrameElement

    expect(clientToCanvas(frame, 10, 10)).toBeNull()
  })

  it('returns null when the frame is missing', () => {
    expect(clientToCanvas(null, 10, 10)).toBeNull()
  })
})
