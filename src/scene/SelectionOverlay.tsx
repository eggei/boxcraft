/**
 * Draws the selection outline and the cursor-driven highlight over the scene, on
 * a layer in parent coordinates — never injected into the source (DESIGN.md §6).
 * The selected box gets a solid outline; the box under the editor cursor gets a
 * subtle highlight (the editor→scene direction of bidirectional sync, §7). Box
 * geometry is read from the instrumented render, so this is a geometry seam —
 * exercised for real in the browser.
 */
export function SelectionOverlay({
  frame,
  handles,
  selected,
  highlighted,
}: {
  frame: HTMLIFrameElement | null
  handles: Map<string, string>
  selected: string | null
  highlighted: string | null
}) {
  const selectedRect = readBoxRect(frame, selected, handles)
  const highlightedRect = readBoxRect(frame, highlighted, handles)

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {highlightedRect && highlighted !== selected && (
        <div
          data-testid="box-highlight"
          data-box={highlighted ?? undefined}
          className="absolute rounded-sm bg-indigo-400/20 ring-1 ring-indigo-300"
          style={rectStyle(highlightedRect)}
        />
      )}
      {selectedRect && (
        <div
          data-testid="box-selection"
          data-box={selected ?? undefined}
          className="absolute rounded-sm ring-2 ring-indigo-500"
          style={rectStyle(selectedRect)}
        />
      )}
    </div>
  )
}

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

function rectStyle(r: Rect): React.CSSProperties {
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

/**
 * The box's rect relative to the frame's container. The container is
 * position:relative and the iframe fills it at inset 0, so the element's
 * iframe-viewport rect doubles as the container-relative rect. Returns null when
 * the box has no live element (nothing to outline).
 */
function readBoxRect(
  frame: HTMLIFrameElement | null,
  name: string | null,
  handles: Map<string, string>,
): Rect | null {
  const doc = frame?.contentDocument
  const handle = name ? handles.get(name) : undefined
  if (!doc || !handle) return null
  const el = doc.querySelector(`[data-bc="${handle}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}
