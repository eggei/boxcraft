import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { BoxPlacement } from './document'
import type { Tool } from './Toolbar'

interface SceneStageProps {
  source: string
  tool: Tool
  onCreateBox: (placement: BoxPlacement) => void
}

interface DragState {
  startX: number
  startY: number
  x: number
  y: number
}

const CLICK_THRESHOLD = 4 // px of travel below which a drag counts as a click

/** Canvas bounding box in page coordinates, read from the live iframe doc. */
function canvasPageRect(iframe: HTMLIFrameElement | null): DOMRect | null {
  const canvas = iframe?.contentDocument?.querySelector('.canvas')
  if (!canvas) return null
  const c = canvas.getBoundingClientRect()
  const f = iframe!.getBoundingClientRect()
  return new DOMRect(f.left + c.left, f.top + c.top, c.width, c.height)
}

/**
 * The rendered scene: an isolated iframe of the source (its `console.log`
 * reaches the real devtools — no in-app console), plus a box-tool overlay that
 * turns clicks and marquees inside the canvas into canvas-relative placements.
 */
export function SceneStage({ source, tool, onCreateBox }: SceneStageProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)

  function onPointerDown(event: ReactPointerEvent) {
    if (tool !== 'box') return
    const rect = canvasPageRect(iframeRef.current)
    if (!rect) return
    // Only start inside the canvas — it is the sole drop target.
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    ) {
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
    })
  }

  function onPointerMove(event: ReactPointerEvent) {
    if (!drag) return
    setDrag({ ...drag, x: event.clientX, y: event.clientY })
  }

  function onPointerUp() {
    if (!drag) return
    const rect = canvasPageRect(iframeRef.current)
    setDrag(null)
    if (!rect) return

    const clamp = (v: number, max: number) => Math.max(0, Math.min(v, max))
    const dx = Math.abs(drag.x - drag.startX)
    const dy = Math.abs(drag.y - drag.startY)

    if (dx < CLICK_THRESHOLD && dy < CLICK_THRESHOLD) {
      onCreateBox({
        kind: 'point',
        x: Math.round(clamp(drag.startX - rect.left, rect.width)),
        y: Math.round(clamp(drag.startY - rect.top, rect.height)),
      })
      return
    }

    const left = clamp(Math.min(drag.startX, drag.x) - rect.left, rect.width)
    const top = clamp(Math.min(drag.startY, drag.y) - rect.top, rect.height)
    const right = clamp(Math.max(drag.startX, drag.x) - rect.left, rect.width)
    const bottom = clamp(Math.max(drag.startY, drag.y) - rect.top, rect.height)
    onCreateBox({
      kind: 'rect',
      left: Math.round(left),
      top: Math.round(top),
      width: Math.round(right - left),
      height: Math.round(bottom - top),
    })
  }

  return (
    <div className="bg-muted/30 relative h-full w-full">
      <iframe
        ref={iframeRef}
        title="Scene preview"
        srcDoc={source}
        className="h-full w-full border-0"
      />
      {tool === 'box' && (
        <div
          data-testid="box-overlay"
          className="absolute inset-0 cursor-crosshair"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {drag && (
            <div
              className="border-primary bg-primary/10 pointer-events-none fixed border"
              style={{
                left: Math.min(drag.startX, drag.x),
                top: Math.min(drag.startY, drag.y),
                width: Math.abs(drag.x - drag.startX),
                height: Math.abs(drag.y - drag.startY),
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}
