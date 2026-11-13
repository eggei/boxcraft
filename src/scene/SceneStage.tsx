import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { BoxPlacement } from './document'
import {
  BRIDGE_CHANNEL,
  isBridgeMessage,
  layoutOf,
  stageDocument,
  type StageLayout,
  type StageRequest,
} from './stageBridge'
import type { Tool } from './Toolbar'

interface SceneStageProps {
  source: string
  tool: Tool
  /** Handle of the currently selected box, for the outline overlay. */
  selectedHandle: string | null
  onCreateBox: (placement: BoxPlacement) => void
  onSelectBox: (handle: string) => void
  onAttachJs: (handle: string) => void
}

interface DragState {
  startX: number
  startY: number
  x: number
  y: number
}

const CLICK_THRESHOLD = 4 // px of travel below which a drag counts as a click

/**
 * The rendered scene: a sandboxed iframe of the instrumented source (its
 * `console.log` reaches the real devtools — no in-app console). `allow-scripts`
 * without `allow-same-origin` runs the scene in an opaque origin, so its code
 * can't reach the app's storage or DOM — and the stage can't reach into it
 * either. Everything the stage knows about the render (canvas and box rects,
 * clicks by `data-bc` handle, key presses) arrives through the bridge script
 * injected into the render-only copy (see stageBridge.ts). Clicks are turned
 * into placements (Box tool), a box selection (Select tool), or a JS attach
 * (JS tool). The selection outline is drawn on an overlay layer, never
 * injected into the source.
 */
export function SceneStage({
  source,
  tool,
  selectedHandle,
  onCreateBox,
  onSelectBox,
  onAttachJs,
}: SceneStageProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  /** The latest geometry the bridge reported, in iframe coordinates. */
  const [layout, setLayout] = useState<StageLayout | null>(null)

  /** Canvas bounding box in page coordinates, from the bridged layout. */
  function canvasPageRect(): DOMRect | null {
    const canvas = layout?.canvas
    const iframe = iframeRef.current
    if (!canvas || !iframe) return null
    const f = iframe.getBoundingClientRect()
    return new DOMRect(f.left + canvas.left, f.top + canvas.top, canvas.width, canvas.height)
  }

  // Box-tool marquee/click → canvas-relative placement.
  function onPointerDown(event: ReactPointerEvent) {
    if (tool !== 'box') return
    const rect = canvasPageRect()
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
    event.currentTarget.setPointerCapture?.(event.pointerId)
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
    const rect = canvasPageRect()
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

  // Everything from the scene arrives as a message. Only the stage's own
  // iframe is listened to — any other window posting on the same channel is
  // ignored. Rebound when the tool or handlers change, so a click is always
  // read against the current tool.
  useEffect(
    function listenToBridge() {
      function onMessage(event: MessageEvent) {
        const frame = iframeRef.current?.contentWindow
        if (!frame || event.source !== frame) return
        const message: unknown = event.data
        if (!isBridgeMessage(message)) return

        switch (message.type) {
          case 'layout': {
            const next = layoutOf(message)
            if (next) setLayout(next)
            break
          }
          case 'click': {
            const handle = message.handle
            if (typeof handle !== 'string') return
            if (tool === 'js') onAttachJs(handle)
            else if (tool === 'select') onSelectBox(handle)
            break
          }
          case 'keydown':
            // Focus is inside the iframe, so the app's window listeners never
            // saw this key. Replaying it there keeps Esc, V/B/J, N and the
            // rest working after the stage has been clicked.
            window.dispatchEvent(
              new KeyboardEvent('keydown', {
                key: String(message.key),
                code: String(message.code),
                altKey: !!message.altKey,
                ctrlKey: !!message.ctrlKey,
                metaKey: !!message.metaKey,
                shiftKey: !!message.shiftKey,
                repeat: !!message.repeat,
                bubbles: true,
                cancelable: true,
              }),
            )
            break
        }
      }
      window.addEventListener('message', onMessage)
      return function unlisten() {
        window.removeEventListener('message', onMessage)
      }
    },
    [tool, onSelectBox, onAttachJs],
  )

  // Ask the scene to re-measure when the selection or tool changes — boxes may
  // have moved since the last report (a scene can animate them). A fresh
  // render reports on its own once it has loaded.
  useEffect(
    function requestMeasure() {
      const request: StageRequest = { channel: BRIDGE_CHANNEL, type: 'measure' }
      // The sandboxed frame has an opaque origin, so there is no origin to name.
      iframeRef.current?.contentWindow?.postMessage(request, '*')
    },
    [selectedHandle, tool, source],
  )

  // Coordinates are iframe-relative and the overlay layer is aligned to the
  // iframe, so a reported rect is used as is.
  const outline = selectedHandle ? layout?.boxes[selectedHandle] : undefined

  return (
    <div className="bg-muted/30 relative h-full w-full">
      <iframe
        ref={iframeRef}
        title="Scene preview"
        sandbox="allow-scripts"
        srcDoc={stageDocument(source)}
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
