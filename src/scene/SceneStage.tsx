import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { instrument, type BoxPlacement } from './document'
import type { Tool } from './Toolbar'

interface SceneStageProps {
  source: string
  tool: Tool
  /** Handle of the currently selected box, for the outline overlay. */
  selectedHandle: string | null
  onCreateBox: (placement: BoxPlacement) => void
  onSelectBox: (handle: string) => void
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
 * The rendered scene: an isolated iframe of the instrumented source (its
 * `console.log` reaches the real devtools — no in-app console). The source in
 * the iframe carries transient `data-bc` handles for hit-testing; the authored
 * document never does. Clicks are turned into placements (Box tool), a box
 * selection (Select tool), or a JS attach (JS tool). The selection outline is
 * drawn on an overlay layer, never injected into the source.
 */
export function SceneStage({
  source,
  tool,
  selectedHandle,
  onCreateBox,
  onSelectBox,
}: SceneStageProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [outline, setOutline] = useState<DOMRect | null>(null)

  // Box-tool marquee/click → canvas-relative placement.
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

  // The Select tool hit-tests clicks inside the iframe via `data-bc`. The
  // listener lives on the iframe document so the scene's own JS still runs.
  const onSelectRef = useRef(onSelectBox)
  const toolRef = useRef(tool)
  onSelectRef.current = onSelectBox
  toolRef.current = tool

  // Measure the selected box and size the outline to it. Reads the iframe's
  // *current* document each call — `srcDoc` reloads swap it out, so a captured
  // reference would go stale. Coordinates are iframe-relative (the overlay layer
  // is aligned to the iframe), so no offset subtraction is needed.
  const selectedRef = useRef(selectedHandle)
  selectedRef.current = selectedHandle
  const measureOutline = useRef(() => {})
  measureOutline.current = () => {
    const doc = iframeRef.current?.contentDocument
    const handle = selectedRef.current
    const el = handle && doc?.querySelector(`[data-bc="${handle}"]`)
    if (!el) {
      setOutline(null)
      return
    }
    const b = el.getBoundingClientRect()
    setOutline(new DOMRect(b.left, b.top, b.width, b.height))
  }

  useEffect(function bindIframe() {
    const iframe = iframeRef.current
    if (!iframe) return

    function onLoad() {
      const doc = iframe!.contentDocument
      if (doc) {
        doc.addEventListener('click', function hitTest(event) {
          if (toolRef.current !== 'select') return
          const target = event.target as Element | null
          const handle = target?.closest('[data-bc]')?.getAttribute('data-bc')
          if (handle) onSelectRef.current(handle)
        })
      }
      measureOutline.current() // re-align once the new render has painted
    }

    iframe.addEventListener('load', onLoad)
    return function unbind() {
      iframe.removeEventListener('load', onLoad)
    }
  }, [])

  // Re-align the outline when the selection or source changes.
  useLayoutEffect(
    function positionOutline() {
      measureOutline.current()
      const id = window.setTimeout(() => measureOutline.current(), 60)
      return () => window.clearTimeout(id)
    },
    [selectedHandle, source],
  )

  return (
    <div className="bg-muted/30 relative h-full w-full">
      <iframe
        ref={iframeRef}
        title="Scene preview"
        srcDoc={instrument(source)}
        className="h-full w-full border-0"
      />

      {outline && (
        <div
          data-testid="selection-outline"
          className="ring-primary pointer-events-none absolute z-10 ring-2"
          style={{
            left: outline.left,
            top: outline.top,
            width: outline.width,
            height: outline.height,
          }}
        />
      )}

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
