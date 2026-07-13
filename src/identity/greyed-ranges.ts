import { parser } from '@lezer/html'
import type { SyntaxNode } from '@lezer/common'
import { parseElements } from '../box/html-tree'

/** A half-open source range, `[from, to)`. */
export interface Range {
  from: number
  to: number
}

/** Structural tags whose own `<tag>`/`</tag>` markup is boilerplate (DESIGN.md §4). */
const BOILERPLATE_TAGS = new Set(['html', 'head', 'body', 'style', 'script'])

/** The exact generated shape of a JS-attach wiring line (DESIGN.md §8). */
const WIRING_LINE = /[ \t]*const\s+[A-Za-z0-9_$]+\s*=\s*document\.getElementById\((['"])[^'"]*\1\)\s*;?[ \t]*\n?/g

/**
 * The source ranges that render as boilerplate / de-emphasized (DESIGN.md §4):
 * the doctype declaration; the `<html>`/`<head>`/`<body>`/`<style>`/`<script>`
 * tags themselves (never their content — CSS rules and script bodies are craft,
 * fully highlighted); every tool-generated box's `<div>`/`</div>` tags (any
 * direct child of `.canvas`, flat-only per DESIGN.md §6/§14); and generated JS
 * wiring lines. Pure and cheap enough to recompute on every keystroke — the
 * "wake on cursor-in" behavior lives in the decoration layer that consumes this.
 */
export function computeGreyedRanges(source: string): Range[] {
  const ranges: Range[] = []

  const doctype = /^<!doctype[^>]*>/i.exec(source)
  if (doctype) ranges.push({ from: 0, to: doctype[0].length })

  const cursor = parser.parse(source).cursor()
  do {
    if (cursor.name !== 'Element') continue
    const open = cursor.node.getChild('OpenTag')
    const close = cursor.node.getChild('CloseTag')
    const tagName = tagNameOf(source, open)
    if (!BOILERPLATE_TAGS.has(tagName)) continue
    if (open) ranges.push({ from: open.from, to: open.to })
    if (close) ranges.push({ from: close.from, to: close.to })
  } while (cursor.next())

  const elements = parseElements(source)
  const canvas = elements.find((el) => el.classNames.includes('canvas'))
  if (canvas) {
    for (const el of elements) {
      if (el === canvas) continue
      const insideCanvas = el.openFrom >= canvas.openTo && (canvas.closeFrom == null || el.openFrom < canvas.closeFrom)
      if (!insideCanvas) continue
      ranges.push({ from: el.openFrom, to: el.openTo })
      if (el.closeFrom != null) ranges.push({ from: el.closeFrom, to: closingTagEnd(source, el.closeFrom) })
    }
  }

  for (const m of source.matchAll(WIRING_LINE)) {
    ranges.push({ from: m.index, to: m.index + m[0].length })
  }

  return ranges.sort((a, b) => a.from - b.from)
}

function tagNameOf(source: string, open: SyntaxNode | null): string {
  const tag = open?.getChild('TagName')
  return tag ? source.slice(tag.from, tag.to).toLowerCase() : ''
}

/** End offset of a closing tag (`</…>`) given where it starts. */
function closingTagEnd(source: string, closeFrom: number): number {
  return source.indexOf('>', closeFrom) + 1
}
