import { useRef } from 'react'
import { clientToCanvas } from './canvas-coords'
import { rectFromGesture, type Point } from '../box/gesture'
import type { BoxRect } from '../box/insert-box'

/**
 * A transparent capture layer over the rendered scene, mounted only while the
 * Box tool is active so normal interaction otherwise reaches the scene
 * (DESIGN.md §6). It tracks a pointer press-to-release gesture, maps both ends
 * to canvas-relative coordinates, and reports the resulting rect. A press with
 * no meaningful drag is a click (default-sized box); a drag is a marquee.
 */
export function BoxOverlay({
  frame,
  onCreate,
}: {
  frame: HTMLIFrameElement | null
  onCreate: (rect: BoxRect) => void
}) {
  const startRef = useRef<Point | null>(null)

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    startRef.current = clientToCanvas(frame, event.clientX, event.clientY)
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const start = startRef.current
    startRef.current = null
    if (!start) return
    const end = clientToCanvas(frame, event.clientX, event.clientY)
    if (!end) return
    onCreate(rectFromGesture(start, end))
  }

  return (
    <div
      data-testid="box-overlay"
      className="absolute inset-0 z-20 cursor-crosshair"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    />
  )
}
