import { parseElements } from '../box/html-tree'

export interface Range {
  from: number
  to: number
}

/**
 * Locate a box's CSS rule — from its `.name` selector to the matching closing
 * brace — inside any `<style>` block. Used to jump the editor to a box's rule on
 * select (DESIGN.md §7) and to detect a box whose rule was hand-deleted. Returns
 * null when the box has no rule. Flat generated rules have no nested braces, so
 * the first `}` after the selector closes the rule.
 */
export function locateRule(source: string, name: string): Range | null {
  const selector = new RegExp(`\\.${escapeRegExp(name)}\\b\\s*\\{`)
  for (const style of styleContentRanges(source)) {
    const text = source.slice(style.from, style.to)
    const open = selector.exec(text)
    if (!open) continue
    const close = text.indexOf('}', open.index)
    if (close < 0) continue
    return { from: style.from + open.index, to: style.from + close + 1 }
  }
  return null
}

/**
 * The managed box whose rule contains the given cursor offset, or null. This is
 * the editor→scene direction of bidirectional sync: a cursor inside a box's rule
 * highlights that box in the scene (DESIGN.md §7). Names come from the handle
 * markers so a renamed box is still recognized.
 */
export function boxAtCursor(source: string, offset: number, names: Set<string>): string | null {
  for (const name of names) {
    const rule = locateRule(source, name)
    if (rule && offset >= rule.from && offset <= rule.to) return name
  }
  return null
}

/** Content ranges (between the tags) of every `<style>` element. */
function styleContentRanges(source: string): Range[] {
  return parseElements(source)
    .filter((el) => el.tagName === 'style' && el.closeFrom != null)
    .map((el) => ({ from: el.openTo, to: el.closeFrom! }))
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
