import { parseElements } from './html-tree'
import { locateRule } from '../identity/rules'

export interface EnsureRuleResult {
  /** The source with a minimal rule appended. */
  source: string
  /** The single change, to dispatch as one transaction. */
  change: { from: number; to: number; insert: string }
  /** Offset in the returned source where the cursor should land — inside the new rule. */
  cursorOffset: number
}

/**
 * Guarantee a box has a CSS rule to target. When a box's `<div>` still exists
 * but its rule was hand-deleted, selecting it should re-create a minimal rule so
 * "style this box" always has a target (DESIGN.md §7). Returns null (no-op) when
 * the box already has a rule. Insert-only text surgery, like `insertBox`: the
 * rule is appended to the end of `<style>` and the surrounding document is
 * preserved byte-for-byte.
 */
export function ensureRule(source: string, name: string): EnsureRuleResult | null {
  if (locateRule(source, name)) return null

  const styleClose = lastStyleCloseTag(source)
  if (styleClose < 0) return null

  const head = `      .${name} {\n        ` // cursor lands on this empty indented line
  const tail = `\n      }\n    `
  const insert = head + tail

  return {
    source: source.slice(0, styleClose) + insert + source.slice(styleClose),
    change: { from: styleClose, to: styleClose, insert },
    cursorOffset: styleClose + head.length,
  }
}

/** Offset of the last `<style>` element's closing tag, where a rule is appended. */
function lastStyleCloseTag(source: string): number {
  let close = -1
  for (const el of parseElements(source)) {
    if (el.tagName === 'style' && el.closeFrom != null) close = el.closeFrom
  }
  return close
}
