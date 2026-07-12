import { parser } from '@lezer/html'
import type { SyntaxNode } from '@lezer/common'

/** A box rectangle in canvas-relative pixels. */
export interface BoxRect {
  x: number
  y: number
  width: number
  height: number
}

export interface InsertBoxResult {
  source: string
  /** Offset in the returned source where the cursor should land — inside the new rule. */
  cursorOffset: number
}

/**
 * Insert a new box into a scene's HTML source: a `<div class="box-N">` as the
 * last child of `.canvas`, and a matching starter CSS rule appended to the end
 * of `<style>` (DESIGN.md §7). This is targeted text surgery via the Lezer tree
 * — the rest of the document is preserved byte-for-byte, never reserialized.
 */
export function insertBox(source: string, rect: BoxRect): InsertBoxResult {
  const canvasCloseFrom = findCanvasCloseTag(source)
  const styleCloseFrom = findStyleCloseTag(source)

  const name = `box-${nextBoxNumber(source)}`
  const divText = `<div class="${name}"></div>`

  const cssHead =
    `      .${name} {\n` +
    `        position: absolute;\n` +
    `        left: ${rect.x}px;\n` +
    `        top: ${rect.y}px;\n` +
    `        width: ${rect.width}px;\n` +
    `        height: ${rect.height}px;\n` +
    `        background: ${boxColor(name)};\n` +
    `        ` // empty, indented line — the cursor lands here (DESIGN.md §7)
  const cssTail = `\n      }\n    `
  const cssText = cssHead + cssTail

  return spliceInserts(source, [
    { at: styleCloseFrom, text: cssText, cursorInText: cssHead.length },
    { at: canvasCloseFrom, text: divText },
  ])
}

/**
 * The number for the next box, derived from the document in creation order:
 * one past the highest existing `box-N` class. Since rules are always appended,
 * this keeps numbering monotonic with creation.
 */
export function nextBoxNumber(source: string): number {
  let max = 0
  for (const m of source.matchAll(/\bbox-(\d+)\b/g)) {
    max = Math.max(max, Number(m[1]))
  }
  return max + 1
}

/** A deterministic, instantly-visible fill so each new box stands out. */
function boxColor(_name: string): string {
  return '#4f46e5'
}

/** Offset of the `<style>` element's closing tag, where a new rule is appended. */
function findStyleCloseTag(source: string): number {
  // Last <style> wins, so a box rule always lands in the scene's shared sheet.
  return closeTagOf(source, '<style>', (node) => elementTagName(source, node) === 'style', {
    last: true,
  })
}

/** The lowercased tag name of an Element node. */
function elementTagName(source: string, node: SyntaxNode): string {
  const open = node.getChild('OpenTag') ?? node.getChild('SelfClosingTag')
  const tag = open?.getChild('TagName')
  return tag ? source.slice(tag.from, tag.to).toLowerCase() : ''
}

/**
 * The `from` offset of the closing tag of the first (or last) Element matching
 * `predicate`. This is where new content is spliced — before the element's
 * `</…>` — so it becomes the element's last child / trailing content.
 */
function closeTagOf(
  source: string,
  label: string,
  predicate: (node: SyntaxNode) => boolean,
  { last = false }: { last?: boolean } = {},
): number {
  const cursor = parser.parse(source).cursor()
  let closeFrom = -1
  do {
    if (cursor.name === 'Element' && predicate(cursor.node)) {
      const close = cursor.node.getChild('CloseTag')
      if (close) closeFrom = close.from
      if (!last) break
    }
  } while (cursor.next())
  if (closeFrom < 0) throw new Error(`insertBox: no ${label} element found in source`)
  return closeFrom
}

/**
 * Apply insert-only edits to a source string. Edits are sorted by offset so
 * earlier insertions don't shift later ones. An edit may carry `cursorInText`
 * (an offset within its own text); the returned `cursorOffset` is that point
 * mapped into the final string. Nothing is ever deleted — the untouched regions
 * survive byte-for-byte.
 */
function spliceInserts(
  source: string,
  inserts: { at: number; text: string; cursorInText?: number }[],
): InsertBoxResult {
  const sorted = [...inserts].sort((a, b) => a.at - b.at)
  let out = ''
  let last = 0
  let cursorOffset = 0
  for (const ins of sorted) {
    out += source.slice(last, ins.at)
    if (ins.cursorInText != null) cursorOffset = out.length + ins.cursorInText
    out += ins.text
    last = ins.at
  }
  out += source.slice(last)
  return { source: out, cursorOffset }
}

/** Offset of the `.canvas` element's closing tag, where a new child is inserted. */
function findCanvasCloseTag(source: string): number {
  return closeTagOf(source, '.canvas', (node) => elementHasClass(source, node, 'canvas'))
}

/** True when an Element's opening tag carries `class="…name…"`. */
function elementHasClass(source: string, node: SyntaxNode, name: string): boolean {
  const open = node.getChild('OpenTag')
  if (!open) return false
  for (const attr of open.getChildren('Attribute')) {
    const attrName = attr.getChild('AttributeName')
    const attrValue = attr.getChild('AttributeValue')
    if (!attrName || !attrValue) continue
    if (source.slice(attrName.from, attrName.to) !== 'class') continue
    const raw = source.slice(attrValue.from, attrValue.to).replace(/^["']|["']$/g, '')
    if (raw.split(/\s+/).includes(name)) return true
  }
  return false
}
