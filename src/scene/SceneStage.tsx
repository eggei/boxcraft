import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Pause, Play } from 'lucide-react'
import { WithTooltip } from '@/components/ui/tooltip'
import { translateHandle, type BoxGeometry, type BoxPlacement } from './document'
import {
  BRIDGE_CHANNEL,
  isBridgeMessage,
  layoutOf,
  renderStage,
  type BridgeRect,
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
  /**
   * A box was dragged (Select tool) — moved, or resized by a handle. `from`
   * and `to` are its rendered rect before and after, canvas-relative.
   */
  onMoveResizeBox: (handle: string, from: BoxGeometry, to: BoxGeometry) => void
}

interface DragState {
  startX: number
  startY: number
  x: number
  y: number
}

const CLICK_THRESHOLD = 4 // px of travel below which a drag counts as a click

/** What part of the selected box a drag grabbed: its body, or an edge/corner. */
type GrabMode = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const GEOMETRY = ['left', 'top', 'width', 'height'] as const

const RESIZE_HANDLES: { mode: GrabMode; className: string }[] = [
  { mode: 'nw', className: '-top-1.5 -left-1.5 cursor-nwse-resize' },
  { mode: 'n', className: '-top-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize' },
  { mode: 'ne', className: '-top-1.5 -right-1.5 cursor-nesw-resize' },
  { mode: 'e', className: 'top-1/2 -right-1.5 -translate-y-1/2 cursor-ew-resize' },
  { mode: 'se', className: '-right-1.5 -bottom-1.5 cursor-nwse-resize' },
  { mode: 's', className: '-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize' },
  { mode: 'sw', className: '-bottom-1.5 -left-1.5 cursor-nesw-resize' },
  { mode: 'w', className: 'top-1/2 -left-1.5 -translate-y-1/2 cursor-ew-resize' },
]

interface BoxDrag {
  /** The box's handle in the render on screen. */
  handle: string
  mode: GrabMode
  /** The box's rect when the drag started, iframe-relative. */
  rect: BridgeRect
  startX: number
  startY: number
  x: number
  y: number
}

/**
 * The rect a drag has produced so far: the body moves the whole box, an edge
 * or corner moves just its sides. A side can't be dragged past the opposite
 * one — the box bottoms out at 1px rather than turning inside out.
 */
function draggedRect({ rect, mode, startX, startY, x, y }: BoxDrag): BridgeRect {
  const dx = x - startX
  const dy = y - startY
  if (mode === 'move') return { ...rect, left: rect.left + dx, top: rect.top + dy }
  let { left, top, width, height } = rect
  if (mode.includes('e')) width = Math.max(1, width + dx)
  if (mode.includes('s')) height = Math.max(1, height + dy)
  if (mode.includes('w')) {
    width = Math.max(1, rect.width - dx)
    left = rect.left + rect.width - width
  }
  if (mode.includes('n')) {
    height = Math.max(1, rect.height - dy)
    top = rect.top + rect.height - height
  }
  return { left, top, width, height }
}

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
 *
 * With the Select tool, the selected box's outline doubles as a drag frame:
 * dragging its body moves the box, its handles resize it. Feedback is the
 * outline alone; the box's rule is rewritten once, on drop.
 *
 * Scripts run with every loop guarded (see loopGuard.ts). While a script
 * doesn't parse — usually because it is half-typed — the stage keeps showing
 * the last render that did, with a quiet notice; and scripts can be paused
 * outright from the stage corner.
 */
export function SceneStage({
  source,
  tool,
  selectedHandle,
  onCreateBox,
  onSelectBox,
  onAttachJs,
  onMoveResizeBox,
}: SceneStageProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [boxDrag, setBoxDrag] = useState<BoxDrag | null>(null)
  /** The latest geometry the bridge reported, in iframe coordinates. */
  const [layout, setLayout] = useState<StageLayout | null>(null)
  const [scriptsPaused, setScriptsPaused] = useState(false)

  // What to render. A source whose scripts don't parse is not rendered: the
  // last good render stays up, remembered along with the source it came from.
  const render = useMemo(
    () => renderStage(source, { pauseScripts: scriptsPaused }),
    [source, scriptsPaused],
  )
  const [lastGood, setLastGood] = useState(() => {
    // Broken from the start: show the scene with its scripts held back.
    const first = render.ok ? render : renderStage(source, { pauseScripts: true })
    return { source, html: first.ok ? first.html : '' }
  })
  if (render.ok && render.html !== lastGood.html) {
    setLastGood({ source, html: render.html })
  }
  const shown = render.ok ? { source, html: render.html } : lastGood
  const scriptBroken = !render.ok

  // The render on screen may be of an older source, and handles are
  // positional — so they are translated between the two at this boundary.
  const toShown = (handle: string | null) =>
    handle && translateHandle(source, shown.source, handle)
  const fromShown = (handle: string) => translateHandle(shown.source, source, handle)

  // The render a stopped loop was reported for; the notice goes with it.
  const [loopStoppedIn, setLoopStoppedIn] = useState<string | null>(null)
  const loopStopped = loopStoppedIn === shown.html

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
  const shownHtml = shown.html
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
            if (typeof message.handle !== 'string') return
            const handle = fromShown(message.handle)
            if (!handle) return
            if (tool === 'js') onAttachJs(handle)
            else if (tool === 'select') onSelectBox(handle)
            break
          }
          case 'loop-stopped':
            setLoopStoppedIn(shownHtml)
            break
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
    // fromShown is rebuilt every render from the two sources listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tool, onSelectBox, onAttachJs, source, shown.source, shownHtml],
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
    [selectedHandle, tool, shownHtml],
  )

  // Coordinates are iframe-relative and the overlay layer is aligned to the
  // iframe, so a reported rect is used as is. Mid-drag, the outline follows
  // the pointer instead; the source is only rewritten on drop.
  const shownSelected = toShown(selectedHandle)
  const measured = shownSelected ? layout?.boxes[shownSelected] : undefined
  const outline = boxDrag ? draggedRect(boxDrag) : measured
  const canDragBox = tool === 'select' && !!shownSelected && !!measured

  // Select-tool drags on the selected box: its body moves it, the handles
  // resize it. The pointer is captured, so moves and the drop arrive here
  // even once it has left the frame.
  function onBoxPointerDown(mode: GrabMode, event: ReactPointerEvent) {
    if (!canDragBox) return
    event.stopPropagation()
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setBoxDrag({
      handle: shownSelected,
      mode,
      rect: measured,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
    })
  }

  function onBoxPointerMove(event: ReactPointerEvent) {
    if (!boxDrag) return
    setBoxDrag({ ...boxDrag, x: event.clientX, y: event.clientY })
  }

  function onBoxPointerUp() {
    if (!boxDrag) return
    setBoxDrag(null)
    const to = draggedRect(boxDrag)
    const from = boxDrag.rect
    if (GEOMETRY.every((prop) => Math.round(to[prop] - from[prop]) === 0)) return
    const handle = fromShown(boxDrag.handle)
    if (!handle) return
    // Canvas-relative, the frame the box's left/top are written in.
    const origin = layout?.canvas ?? { left: 0, top: 0 }
    const relative = (r: BridgeRect) => ({ ...r, left: r.left - origin.left, top: r.top - origin.top })
    onMoveResizeBox(handle, relative(from), relative(to))
  }

  return (
    <div className="bg-muted/30 relative h-full w-full">
      <iframe
        ref={iframeRef}
        title="Scene preview"
        sandbox="allow-scripts"
        srcDoc={shown.html}
        className="h-full w-full border-0"
      />

      {/* Above the Box tool's overlay, so it stays clickable with any tool. */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
        {(scriptBroken || loopStopped) && (
          <p
            role="status"
            className="bg-popover/90 text-muted-foreground shadow-raised rounded-md border px-2 py-1 text-xs"
          >
            {scriptBroken
              ? 'Script has errors — showing the last render that ran'
              : 'A loop ran too long and was stopped — see the console'}
          </p>
        )}
        <WithTooltip
          side="left"
          tip={
            scriptsPaused
              ? "Run the scene's scripts again"
              : "Render the scene without running its scripts"
          }
        >
          <button
            type="button"
            aria-label={scriptsPaused ? 'Resume scripts' : 'Pause scripts'}
            aria-pressed={scriptsPaused}
            onClick={() => setScriptsPaused((paused) => !paused)}
            className="bg-popover shadow-raised text-muted-foreground hover:text-foreground flex size-8 items-center justify-center rounded-lg border transition-colors"
          >
            {scriptsPaused ? <Play className="size-4" /> : <Pause className="size-4" />}
          </button>
        </WithTooltip>
      </div>

      {outline && (
        <div
          data-testid="selection-outline"
          className={
            'ring-primary absolute z-10 ring-2 ' +
            // With the Select tool the outline is the drag frame; otherwise
            // clicks pass through it to the scene.
            (canDragBox ? 'cursor-move touch-none' : 'pointer-events-none')
          }
          style={{
            left: outline.left,
            top: outline.top,
            width: outline.width,
            height: outline.height,
          }}
          onPointerDown={(event) => onBoxPointerDown('move', event)}
          onPointerMove={onBoxPointerMove}
          onPointerUp={onBoxPointerUp}
          onPointerCancel={() => setBoxDrag(null)}
        >
          {canDragBox &&
            RESIZE_HANDLES.map(({ mode, className }) => (
              <div
                key={mode}
                data-testid={`resize-${mode}`}
                className={
                  'bg-background border-primary absolute size-3 rounded-sm border ' + className
                }
                onPointerDown={(event) => onBoxPointerDown(mode, event)}
              />
            ))}
        </div>
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
