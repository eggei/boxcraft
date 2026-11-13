/**
 * The scene-document domain module: pure operations over a scene's HTML source
 * string. The document is the single source of truth — these functions do
 * minimal, targeted text surgery and never reserialize (which would clobber the
 * user's formatting). The CodeMirror editor and the render iframe are adapters
 * on top of this; they hold no parallel model.
 */

import { parser as htmlParser } from '@lezer/html'
import type { SyntaxNode } from '@lezer/common'

/** Where a new box goes, in canvas-relative pixels. */
export type BoxPlacement =
  | { kind: 'point'; x: number; y: number }
  | { kind: 'rect'; left: number; top: number; width: number; height: number }

/**
 * Why a box can't be created in a document. The source is hand-editable, so
 * these are ordinary states the user can be in, not programming errors.
 */
export type CreateBoxProblem =
  /** No element carries a `canvas` class token — there is nowhere to draw. */
  | 'no-canvas'
  /** The canvas element has no closing tag yet, so there is no "inside" to append to. */
  | 'unterminated-canvas'
  /** No `<style>` block to hold the new box's rule. */
  | 'no-style'

export type CreateBoxResult =
  | {
      ok: true
      /** The new document source. */
      source: string
      /** The generated public class, e.g. `box-1`. */
      className: string
      /** Offset into `source` where the cursor should land — inside the new rule. */
      cursor: number
    }
  | { ok: false; problem: CreateBoxProblem }

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

/** One attribute of an opening tag, with source offsets. */
interface RawAttr {
  /** Lower-cased attribute name (HTML attribute names are case-insensitive). */
  name: string
  /** The value as written, without its quotes ('' for a bare attribute). */
  value: string
  /** Offset of the attribute's first character (its name). */
  from: number
  /** Offset just past the attribute (past the closing quote, if any). */
  to: number
  /** Offset where the value starts, inside any quotes. */
  valueFrom: number
}

interface RawBox {
  /** Offset of the `<` of the opening tag. */
  openStart: number
  /** Offset just after the `>` (or `/>`) of the opening tag. */
  openEnd: number
  /** Offset just after the tag name — an attribute can always go here. */
  tagNameEnd: number
  /** Offset of the tag's closing `>` or `/>` — where an attribute is appended. */
  endTagStart: number
  attrs: RawAttr[]
}

function attrsOf(source: string, tag: SyntaxNode): RawAttr[] {
  const attrs: RawAttr[] = []
  for (const attr of tag.getChildren('Attribute')) {
    const nameNode = attr.getChild('AttributeName')
    if (!nameNode) continue
    const quoted = attr.getChild('AttributeValue')
    const bare = attr.getChild('UnquotedAttributeValue')
    let value = ''
    let valueFrom = attr.to
    if (quoted) {
      // The node spans the quotes; strip whichever quote style was used.
      const text = source.slice(quoted.from, quoted.to)
      const closed = text.length > 1 && text[text.length - 1] === text[0]
      valueFrom = quoted.from + 1
      value = text.slice(1, closed ? -1 : undefined)
    } else if (bare) {
      valueFrom = bare.from
      value = source.slice(bare.from, bare.to)
    }
    attrs.push({
      name: source.slice(nameNode.from, nameNode.to).toLowerCase(),
      value,
      from: attr.from,
      to: attr.to,
      valueFrom,
    })
  }
  return attrs
}

/** Read an element's opening tag; null while it is still being typed. */
function rawBoxOf(source: string, element: SyntaxNode): RawBox | null {
  const tag = element.getChild('OpenTag') ?? element.getChild('SelfClosingTag')
  const tagName = tag?.getChild('TagName')
  const endTag = tag?.getChild('EndTag')
  if (!tag || !tagName || !endTag) return null
  return {
    openStart: tag.from,
    openEnd: endTag.to,
    tagNameEnd: tagName.to,
    endTagStart: endTag.from,
    attrs: attrsOf(source, tag),
  }
}

function attrOf(raw: RawBox, name: string): RawAttr | undefined {
  return raw.attrs.find((a) => a.name === name)
}

function classAttrOf(raw: RawBox): string | null {
  return attrOf(raw, 'class')?.value ?? null
}

/**
 * The canvas `Element` node: the first element carrying a `canvas` class token,
 * however the attribute is quoted (or not). Parsing rather than pattern
 * matching means comments, script/style text and attribute values that merely
 * contain `<div` or `canvas` never confuse the scan.
 */
function findCanvas(source: string): SyntaxNode | null {
  const cursor = htmlParser.parse(source).cursor()
  do {
    if (cursor.name !== 'Element') continue
    const raw = rawBoxOf(source, cursor.node)
    if (raw && (classAttrOf(raw) ?? '').split(/\s+/).includes('canvas')) {
      return cursor.node
    }
  } while (cursor.next())
  return null
}

/**
 * Offset just before the canvas element's own closing tag, so a new box lands
 * as the canvas's last child — or why there is no such place.
 */
function canvasCloseOffset(source: string): number | CreateBoxProblem {
  const canvas = findCanvas(source)
  if (!canvas) return 'no-canvas'
  const close = canvas.getChild('CloseTag')
  if (!close) return 'unterminated-canvas'
  return close.from
}

/**
 * What would stop `createBox` in this document, or null when a box can be
 * drawn. Lets the UI explain itself before the user even tries.
 */
export function createBoxProblem(source: string): CreateBoxProblem | null {
  const closeAt = canvasCloseOffset(source)
  if (typeof closeAt !== 'number') return closeAt
  if (source.lastIndexOf('</style>') === -1) return 'no-style'
  return null
}

/**
 * Scan the direct element children of the canvas — any tag name; flat boxes,
 * no nesting in MVP — returning each box's opening-tag geometry in document
 * order.
 */
function scanBoxes(source: string): RawBox[] {
  const canvas = findCanvas(source)
  if (!canvas) return []
  const boxes: RawBox[] = []
  for (const child of canvas.getChildren('Element')) {
    const raw = rawBoxOf(source, child)
    if (raw) boxes.push(raw)
  }
  return boxes
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
    className: identityClass(classAttrOf(raw)),
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
  const attr = attrOf(raw, 'class')
  if (!attr) return []
  const out: { name: string; from: number; to: number }[] = []
  for (const t of attr.value.matchAll(/\S+/g)) {
    out.push({
      name: t[0],
      from: attr.valueFrom + t.index,
      to: attr.valueFrom + t.index + t[0].length,
    })
  }
  return out
}

export function resolveTokens(source: string): ManagedToken[] {
  // Identity class → its HTML class-attr occurrences, for boxes that exist.
  const boxes = scanBoxes(source)
  const htmlRanges = new Map<string, TokenRange[]>()
  for (const raw of boxes) {
    const cls = identityClass(classAttrOf(raw))
    if (!cls) continue
    const ranges = htmlRanges.get(cls) ?? []
    for (const t of classTokenRanges(raw)) {
      if (t.name === cls) ranges.push({ from: t.from, to: t.to })
    }
    htmlRanges.set(cls, ranges)
  }
  const live = new Set(htmlRanges.keys())

  // Orphaned references in our `box-N` namespace with no live box → error
  // tokens: a `.box-N` rule or a `getElementById('box-N')` line left behind.
  const names = new Set(live)
  for (const m of source.matchAll(/\.(box-\d+)(?![\w-])/g)) {
    if (!live.has(m[1])) names.add(m[1])
  }
  for (const m of source.matchAll(/getElementById\((['"])(box-\d+)\1\)/g)) {
    if (!live.has(m[2])) names.add(m[2])
  }

  return [...names].map((name) => {
    const ranges = [...(htmlRanges.get(name) ?? [])]
    const escaped = escapeRegExp(name)

    // CSS selector `.name`
    for (const m of source.matchAll(new RegExp('\\.' + escaped + '(?![\\w-])', 'g'))) {
      ranges.push({ from: m.index + 1, to: m.index + 1 + name.length })
    }
    // Managed `id` on a box (added by the JS tool; the id mirrors the class)
    for (const raw of boxes) {
      const id = attrOf(raw, 'id')
      if (id?.value === name) {
        ranges.push({ from: id.valueFrom, to: id.valueFrom + name.length })
      }
    }
    // `getElementById('name')` argument
    for (const m of source.matchAll(
      new RegExp("getElementById\\((['\"])" + escaped + '\\1\\)', 'g'),
    )) {
      const at = m.index + m[0].indexOf(name)
      ranges.push({ from: at, to: at + name.length })
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

/** Auto-derive a JS variable name from a class (`box-1` → `box1`). */
function varNameFor(className: string): string {
  const parts = className.split(/[^a-zA-Z0-9]+/).filter(Boolean)
  if (parts.length === 0) return 'el'
  return (
    parts[0].toLowerCase() +
    parts.slice(1).map((p) => p[0].toUpperCase() + p.slice(1)).join('')
  )
}

export interface AttachJsResult {
  source: string
  /** Offset to land the cursor at — below the generated wiring, ready to code. */
  cursor: number
  /** The auto-derived, user-owned variable name (does not follow renames). */
  varName: string
}

/**
 * Wire a box for scripting: add a real `id` to the element and a
 * `const <var> = document.getElementById('<id>')` line to the single shared
 * `<script>` at the end of `<body>` (created on first attach). Re-attaching an
 * already-wired box jumps to its existing line instead of duplicating it.
 */
export function attachJs(source: string, handle: string): AttachJsResult {
  const boxes = scanBoxes(source)
  const idx = listBoxes(source).findIndex((b) => b.handle === handle)
  if (idx === -1) return { source, cursor: 0, varName: '' }

  const raw = boxes[idx]
  const id = identityClass(classAttrOf(raw))
  const varName = varNameFor(id)

  // Already wired → jump to the existing const line (no duplicate).
  if (attrOf(raw, 'id')?.value) {
    const marker = `getElementById('${id}')`
    const at = source.indexOf(marker)
    return { source, cursor: at === -1 ? source.length : at + marker.length, varName }
  }

  // 1. Add the id to the box's opening tag (just before its closing `>`, or
  //    before the `/>` of a self-closing tag), ahead of any padding there.
  let insertIdAt = raw.endTagStart
  while (insertIdAt > raw.tagNameEnd && /\s/.test(source[insertIdAt - 1])) insertIdAt--
  let out = source.slice(0, insertIdAt) + ` id="${id}"` + source.slice(insertIdAt)

  // 2. Append the wiring to the single shared <script> (create if absent).
  const constLine = `      const ${varName} = document.getElementById('${id}');`
  const scriptClose = out.indexOf('</script>')

  if (scriptClose === -1) {
    const bodyClose = out.lastIndexOf('</body>')
    const block = `  <script>\n${constLine}\n      \n    </script>\n  `
    const cursor = bodyClose + `  <script>\n${constLine}\n      `.length
    out = out.slice(0, bodyClose) + block + out.slice(bodyClose)
    return { source: out, cursor, varName }
  }

  // Insert before the line that holds </script>, with a blank landing line.
  const lineStart = out.lastIndexOf('\n', scriptClose) + 1
  const cursor = lineStart + `${constLine}\n      `.length
  out = out.slice(0, lineStart) + `${constLine}\n      \n` + out.slice(lineStart)
  return { source: out, cursor, varName }
}

/**
 * Remove a box's JS wiring: strip the `id` from the element and the box's own
 * `const … = document.getElementById('<id>')` line from the script. Everything
 * else in the script is the user's code and stays put — the `<script>` block is
 * only dropped when nothing but whitespace is left inside it. A box with no JS
 * attached is left untouched.
 */
export function detachJs(source: string, handle: string): { source: string } {
  const boxes = scanBoxes(source)
  const idx = listBoxes(source).findIndex((b) => b.handle === handle)
  if (idx === -1) return { source }

  const raw = boxes[idx]
  const idAttr = attrOf(raw, 'id')
  const id = idAttr?.value
  if (!idAttr || !id) return { source } // no JS attached

  // 1. Strip the id attribute, and the whitespace before it, from the tag.
  let stripFrom = idAttr.from
  while (stripFrom > raw.openStart && /\s/.test(source[stripFrom - 1])) stripFrom--
  let out = source.slice(0, stripFrom) + source.slice(idAttr.to)

  // 2. Remove the const line that references this id — and only that line.
  const line = new RegExp(
    `[ \\t]*const [^\\n]*getElementById\\((['"])${escapeRegExp(id)}\\1\\)[^\\n]*\\n`,
  )
  const hit = line.exec(out)
  if (!hit) return { source: out }
  out = out.slice(0, hit.index) + out.slice(hit.index + hit[0].length)

  // 3. Drop the script that held it, but only if it is now empty. Judging by
  //    "no more `const`" would delete user code written any other way.
  const open = out.lastIndexOf('<script', hit.index)
  const openEnd = open === -1 ? -1 : out.indexOf('>', open) + 1
  const close = out.indexOf('</script>', hit.index)
  if (open !== -1 && close !== -1 && openEnd <= close) {
    if (out.slice(openEnd, close).trim() === '') {
      const lineStart = out.lastIndexOf('\n', open) + 1
      const from = /^[ \t]*$/.test(out.slice(lineStart, open)) ? lineStart : open
      let to = close + '</script>'.length
      if (out[to] === '\n') to += 1
      out = out.slice(0, from) + out.slice(to)
    }
  }
  return { source: out }
}

/** Why a name can't become a box's class. */
export type RenameProblem =
  /** Nothing (or only whitespace) was entered. */
  | 'empty'
  /** Not a plain CSS identifier — it would need escaping in a selector, or break the markup. */
  | 'invalid'
  /** Another box, or an existing CSS rule, already uses it — renaming would merge the two. */
  | 'taken'

/**
 * Plain CSS class identifiers only. Valid CSS allows more with escaping, but a
 * name that needs escaping in a selector — or that holds a space or a quote —
 * can't be written into both the class attribute and the rule as-is.
 */
const CLASS_NAME = /^-?[_a-zA-Z][_a-zA-Z0-9-]*$/

/** Every class name used as a selector in the document's `<style>` blocks. */
function cssClassNames(source: string): Set<string> {
  const names = new Set<string>()
  const cursor = htmlParser.parse(source).cursor()
  do {
    if (cursor.name !== 'StyleText') continue
    const css = source.slice(cursor.from, cursor.to).replace(/\/\*[\s\S]*?\*\//g, '')
    for (const m of css.matchAll(/\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g)) names.add(m[1])
  } while (cursor.next())
  return names
}

/**
 * Check `newName` as the new class of box `handle`, before anything is written.
 * Renaming to the box's own current name is fine (a no-op). Anything already
 * in use — another box's class, or any class selector in the styles — is
 * refused, since sharing a name would silently merge two boxes' styling.
 */
export function validateBoxName(
  source: string,
  handle: string,
  newName: string,
): RenameProblem | null {
  const name = newName.trim()
  if (!name) return 'empty'
  if (!CLASS_NAME.test(name)) return 'invalid'

  const boxes = scanBoxes(source)
  const idx = listBoxes(source).findIndex((b) => b.handle === handle)
  const current = idx === -1 ? '' : identityClass(classAttrOf(boxes[idx]))
  if (name === current) return null

  const otherBoxClasses = boxes
    .filter((_, i) => i !== idx)
    .flatMap((raw) => (classAttrOf(raw) ?? '').split(/\s+/))
  if (otherBoxClasses.includes(name) || cssClassNames(source).has(name)) return 'taken'
  return null
}

export interface RenameResult {
  source: string
  /** Set when `newName` was refused; `source` is then returned unchanged. */
  problem?: RenameProblem
}

/**
 * Rewrite every occurrence of a box's public class to `newName` in one edit
 * (CSS selector + HTML class; the id + `getElementById` arg once JS is attached
 * — see attachJs). The box's handle is untouched, so tracking survives, and
 * because it returns a single new source the editor applies it as one undo step.
 * A name that fails `validateBoxName` is refused rather than written.
 */
export function rename(source: string, handle: string, newName: string): RenameResult {
  const box = listBoxes(source).find((b) => b.handle === handle)
  if (!box || !box.className) return { source }

  const problem = validateBoxName(source, handle, newName)
  if (problem) return { source, problem }
  const name = newName.trim()

  const token = resolveTokens(source).find((t) => t.className === box.className)
  const ranges = token?.ranges ?? []

  // Splice from the end so earlier offsets stay valid.
  let out = source
  for (let i = ranges.length - 1; i >= 0; i--) {
    const { from, to } = ranges[i]
    out = out.slice(0, from) + name + out.slice(to)
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
    const insertAt = raw.tagNameEnd
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
  const closeAt = canvasCloseOffset(source)
  if (typeof closeAt !== 'number') return { ok: false, problem: closeAt }
  if (source.lastIndexOf('</style>') === -1) return { ok: false, problem: 'no-style' }

  const n = nextBoxNumber(source)
  const className = `box-${n}`
  const { left, top, width, height } = rectOf(placement)

  // 1. Insert the box div as the last child of the canvas.
  const boxDiv = `  <div class="${className}"></div>\n    `
  let next = source.slice(0, closeAt) + boxDiv + source.slice(closeAt)

  // 2. Append the starter rule to the end of the <style> block. The blank line
  //    before `}` is the cursor's landing spot — ready to type the next prop.
  const styleClose = next.lastIndexOf('</style>')

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

  return { ok: true, source: next, className, cursor }
}
