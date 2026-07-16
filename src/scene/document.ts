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

/**
 * A box's app-owned identity. The `handle` is opaque and positional (document
 * order among canvas children) — it never appears in the source, so it survives
 * a rename (which only rewrites the public `className`). Cross-edit continuity
 * of a handle is the CodeMirror adapter's job (range-markers); this pure module
 * re-derives the registry from the source on demand.
 */
export interface Box {
  handle: string
  className: string
}

interface RawBox {
  /** Offset of the `<` of the opening tag. */
  openStart: number
  /** Offset just after the `>` of the opening tag. */
  openEnd: number
  /** The full opening tag text, e.g. `<div class="box-1">`. */
  openTag: string
}

/**
 * Scan the direct children of the canvas (flat boxes — no nesting in MVP),
 * returning each box's opening-tag range and text in document order.
 */
function scanBoxes(source: string): RawBox[] {
  const open = source.search(/<div[^>]*class="[^"]*\bcanvas\b[^"]*"[^>]*>/)
  if (open === -1) return []
  const canvasOpenEnd = source.indexOf('>', open) + 1

  const boxes: RawBox[] = []
  let depth = 1
  const tag = /<div\b[^>]*>|<\/div>/g
  tag.lastIndex = canvasOpenEnd
  for (let m = tag.exec(source); m; m = tag.exec(source)) {
    if (m[0] === '</div>') {
      depth -= 1
      if (depth === 0) break // reached the canvas's own closing tag
    } else {
      if (depth === 1) {
        boxes.push({
          openStart: m.index,
          openEnd: m.index + m[0].length,
          openTag: m[0],
        })
      }
      depth += 1
    }
  }
  return boxes
}

function classAttrOf(openTag: string): string | null {
  const m = openTag.match(/\bclass="([^"]*)"/)
  return m ? m[1] : null
}

/**
 * A box's managed identity class: the app-generated `box-N` class if present,
 * otherwise the element's first class. Extra classes (`active`, `glow`) are the
 * user's own and are never treated as the box's identity.
 */
function identityClass(classAttr: string | null): string {
  if (!classAttr) return ''
  const classes = classAttr.trim().split(/\s+/).filter(Boolean)
  return classes.find((c) => /^box-\d+$/.test(c)) ?? classes[0] ?? ''
}

export function listBoxes(source: string): Box[] {
  return scanBoxes(source).map((raw, i) => ({
    handle: `bx_${i + 1}`,
    className: identityClass(classAttrOf(raw.openTag)),
  }))
}

export interface TokenRange {
  from: number
  to: number
}

/**
 * A managed identity token (a box's class; its id too, once JS is attached) and
 * whether it currently resolves to a live element. Chips are a *computed*
 * projection of the box↔element correspondence — not naïve selector matching —
 * so a user's own classes (`.active`) are never included, and a class whose box
 * was deleted is reported unresolved (error) rather than silently dropped.
 */
export interface ManagedToken {
  className: string
  resolved: boolean
  /** Every occurrence of the token name (CSS selector + HTML class attr). */
  ranges: TokenRange[]
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Ranges of each whitespace-separated class token inside a box's opening tag. */
function classTokenRanges(raw: RawBox): { name: string; from: number; to: number }[] {
  const m = /class="([^"]*)"/.exec(raw.openTag)
  if (!m) return []
  const valueStart = raw.openStart + m.index + 'class="'.length
  const out: { name: string; from: number; to: number }[] = []
  for (const t of m[1].matchAll(/\S+/g)) {
    out.push({
      name: t[0],
      from: valueStart + t.index,
      to: valueStart + t.index + t[0].length,
    })
  }
  return out
}

export function resolveTokens(source: string): ManagedToken[] {
  // Identity class → its HTML class-attr occurrences, for boxes that exist.
  const htmlRanges = new Map<string, TokenRange[]>()
  for (const raw of scanBoxes(source)) {
    const cls = identityClass(classAttrOf(raw.openTag))
    if (!cls) continue
    const ranges = htmlRanges.get(cls) ?? []
    for (const t of classTokenRanges(raw)) {
      if (t.name === cls) ranges.push({ from: t.from, to: t.to })
    }
    htmlRanges.set(cls, ranges)
  }
  const live = new Set(htmlRanges.keys())

  // Orphaned `.box-N` rules (our namespace) with no live box → error tokens.
  const names = new Set(live)
  for (const m of source.matchAll(/\.(box-\d+)(?![\w-])/g)) {
    if (!live.has(m[1])) names.add(m[1])
  }

  return [...names].map((name) => {
    const ranges = [...(htmlRanges.get(name) ?? [])]
    const selector = new RegExp('\\.' + escapeRegExp(name) + '(?![\\w-])', 'g')
    for (const m of source.matchAll(selector)) {
      ranges.push({ from: m.index + 1, to: m.index + 1 + name.length })
    }
    ranges.sort((a, b) => a.from - b.from)
    return { className: name, resolved: live.has(name), ranges }
  })
}

/** The source range of a class's CSS rule (selector through closing brace). */
export function ruleRangeOf(source: string, className: string): TokenRange | null {
  const re = new RegExp('\\.' + escapeRegExp(className) + '(?![\\w-])\\s*\\{')
  const m = re.exec(source)
  if (!m) return null
  const close = source.indexOf('}', m.index)
  if (close === -1) return null
  return { from: m.index, to: close + 1 }
}

/**
 * The handle of the box whose CSS rule contains `offset`, or null. Drives the
 * reverse sync: a cursor placed in a rule highlights that box in the scene.
 */
export function boxAtOffset(source: string, offset: number): string | null {
  for (const box of listBoxes(source)) {
    if (!box.className) continue
    const range = ruleRangeOf(source, box.className)
    if (range && offset >= range.from && offset < range.to) return box.handle
  }
  return null
}

export interface EnsureRuleResult {
  source: string
  /** Offset to land the cursor inside the box's rule body. */
  cursor: number
  /** True when a missing rule was re-created. */
  created: boolean
}

/**
 * Guarantee the box has a CSS rule to style, so "select this box" always has a
 * target. If the rule exists, return it untouched with the cursor inside it; if
 * it was hand-deleted, append a minimal rule to the end of `<style>`.
 */
export function ensureRule(source: string, handle: string): EnsureRuleResult {
  const box = listBoxes(source).find((b) => b.handle === handle)
  if (!box || !box.className) return { source, cursor: 0, created: false }

  const existing = ruleRangeOf(source, box.className)
  if (existing) {
    return { source, cursor: existing.to - 1, created: false }
  }

  const styleClose = source.lastIndexOf('</style>')
  if (styleClose === -1) return { source, cursor: 0, created: false }

  const rule = `      .${box.className} {\n        ` // cursor lands here
  const ruleTail = `\n      }\n    `
  const cursor = styleClose + rule.length
  const next = source.slice(0, styleClose) + rule + ruleTail + source.slice(styleClose)
  return { source: next, cursor, created: true }
}

export interface RenameResult {
  source: string
}

/**
 * Rewrite every occurrence of a box's public class to `newName` in one edit
 * (CSS selector + HTML class; the id + `getElementById` arg once JS is attached
 * — see attachJs). The box's handle is untouched, so tracking survives, and
 * because it returns a single new source the editor applies it as one undo step.
 */
export function rename(source: string, handle: string, newName: string): RenameResult {
  const box = listBoxes(source).find((b) => b.handle === handle)
  if (!box || !box.className) return { source }

  const token = resolveTokens(source).find((t) => t.className === box.className)
  const ranges = token?.ranges ?? []

  // Splice from the end so earlier offsets stay valid.
  let out = source
  for (let i = ranges.length - 1; i >= 0; i--) {
    const { from, to } = ranges[i]
    out = out.slice(0, from) + newName + out.slice(to)
  }
  return { source: out }
}

/** The transient hit-testing attribute added only to the rendered copy. */
const BC_ATTR = 'data-bc'

/**
 * Produce a render-only copy of the source with a transient `data-bc="<handle>"`
 * on every box, so the iframe can hit-test a click back to a handle. This copy
 * is never stored or exported — `serialize` strips it by construction.
 */
export function instrument(source: string): string {
  const boxes = scanBoxes(source)
  // Splice from the end so earlier offsets stay valid as we insert.
  let out = source
  for (let i = boxes.length - 1; i >= 0; i--) {
    const raw = boxes[i]
    const insertAt = raw.openStart + '<div'.length
    const attr = ` ${BC_ATTR}="bx_${i + 1}"`
    out = out.slice(0, insertAt) + attr + out.slice(insertAt)
  }
  return out
}

/** The clean, export-ready document: any instrumentation removed. */
export function serialize(source: string): string {
  return source.replace(new RegExp(`\\s${BC_ATTR}="[^"]*"`, 'g'), '')
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
