/**
 * The scene-document domain module: pure operations over a scene's HTML source
 * string. The document is the single source of truth — these functions do
 * minimal, targeted text surgery and never reserialize (which would clobber the
 * user's formatting). The CodeMirror editor and the render iframe are adapters
 * on top of this; they hold no parallel model.
 */

/** Where a new box goes, in canvas-relative pixels. */
export type BoxPlacement =
  | { kind: 'point'; x: number; y: number }
  | { kind: 'rect'; left: number; top: number; width: number; height: number }

export interface CreateBoxResult {
  /** The new document source. */
  source: string
  /** The generated public class, e.g. `box-1`. */
  className: string
  /** Offset into `source` where the cursor should land — inside the new rule. */
  cursor: number
}

/** A click drops a box this size (px); a marquee overrides it with the drag. */
const DEFAULT_BOX_SIZE = 100
const STARTER_BACKGROUND = '#4f46e5'

function rectOf(placement: BoxPlacement) {
  if (placement.kind === 'rect') return placement
  return {
    left: placement.x,
    top: placement.y,
    width: DEFAULT_BOX_SIZE,
    height: DEFAULT_BOX_SIZE,
  }
}

/** Next box number = one past the highest `box-N` already in the source. */
function nextBoxNumber(source: string): number {
  let max = 0
  for (const match of source.matchAll(/box-(\d+)/g)) {
    max = Math.max(max, Number(match[1]))
  }
  return max + 1
}

/**
 * Offset just before the canvas element's own closing `</div>`, found by
 * depth-counting nested divs so boxes nest correctly as canvas children.
 */
function canvasCloseOffset(source: string): number {
  const open = source.search(/<div[^>]*class="[^"]*\bcanvas\b[^"]*"[^>]*>/)
  if (open === -1) throw new Error('createBox: no .canvas element in source')
  const openEnd = source.indexOf('>', open) + 1

  let depth = 1
  const tag = /<div\b|<\/div>/g
  tag.lastIndex = openEnd
  for (let m = tag.exec(source); m; m = tag.exec(source)) {
    depth += m[0] === '</div>' ? -1 : 1
    if (depth === 0) return m.index
  }
  throw new Error('createBox: unterminated .canvas element')
}

export function createBox(
  source: string,
  placement: BoxPlacement,
): CreateBoxResult {
  const n = nextBoxNumber(source)
  const className = `box-${n}`
  const { left, top, width, height } = rectOf(placement)

  // 1. Insert the box div as the last child of the canvas.
  const closeAt = canvasCloseOffset(source)
  const boxDiv = `  <div class="${className}"></div>\n    `
  let next = source.slice(0, closeAt) + boxDiv + source.slice(closeAt)

  // 2. Append the starter rule to the end of the <style> block. The blank line
  //    before `}` is the cursor's landing spot — ready to type the next prop.
  const styleClose = next.lastIndexOf('</style>')
  if (styleClose === -1) throw new Error('createBox: no <style> block in source')

  const rule =
    `      .${className} {\n` +
    `        position: absolute;\n` +
    `        left: ${left}px;\n` +
    `        top: ${top}px;\n` +
    `        width: ${width}px;\n` +
    `        height: ${height}px;\n` +
    `        background: ${STARTER_BACKGROUND};\n` +
    `        ` // cursor lands here, on an indented blank line
  const ruleTail = `\n      }\n    `

  const cursor = styleClose + rule.length
  next = next.slice(0, styleClose) + rule + ruleTail + next.slice(styleClose)

  return { source: next, className, cursor }
}
