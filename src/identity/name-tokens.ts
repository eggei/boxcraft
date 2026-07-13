import { parseElements } from '../box/html-tree'

/** A managed token occurrence in the source and where it appears. */
export interface NameToken {
  /** The managed class name, e.g. `box-1` or a renamed `hero`. */
  name: string
  /** Start offset of the name token (the dot of a selector is *not* included). */
  from: number
  /** End offset of the name token. */
  to: number
  /** Where it occurs: an HTML `class` value or a CSS class selector. */
  kind: 'class' | 'selector'
}

/**
 * Every occurrence of the given managed names in the source: the HTML `class`
 * tokens and the matching CSS `.name` selectors. Managed names come from the
 * handle markers, not from a text pattern, so a box renamed out of the `box-N`
 * namespace is still tracked while an unmanaged user class (`.glow`) is never
 * touched (DESIGN.md §5). This is the single basis for both chips and rename.
 * Tokens are returned in document order.
 */
export function locateNameTokens(source: string, names: Set<string>): NameToken[] {
  if (names.size === 0) return []
  const tokens: NameToken[] = []

  for (const el of parseElements(source)) {
    if (el.classValueFrom == null) continue
    const value = source.slice(el.classValueFrom, el.classValueTo!)
    for (const name of names) {
      const idx = wordIndex(value, name)
      if (idx >= 0) {
        const from = el.classValueFrom + idx
        tokens.push({ name, from, to: from + name.length, kind: 'class' })
      }
    }
  }

  for (const style of styleContentRanges(source)) {
    const text = source.slice(style.from, style.to)
    for (const name of names) {
      const re = new RegExp(`\\.(${escapeRegExp(name)})\\b`, 'g')
      for (const m of text.matchAll(re)) {
        const from = style.from + m.index + 1 // skip the leading dot
        tokens.push({ name, from, to: from + name.length, kind: 'selector' })
      }
    }
  }

  return tokens.sort((a, b) => a.from - b.from)
}

/** Content ranges (between the tags) of every `<style>` element. */
function styleContentRanges(source: string): { from: number; to: number }[] {
  return parseElements(source)
    .filter((el) => el.tagName === 'style' && el.closeFrom != null)
    .map((el) => ({ from: el.openTo, to: el.closeFrom! }))
}

/** Index of `name` as a whole space-delimited word within a class value, or -1. */
function wordIndex(value: string, name: string): number {
  const re = new RegExp(`(?:^|\\s)(${escapeRegExp(name)})(?:\\s|$)`)
  const m = re.exec(value)
  return m ? m.index + m[0].indexOf(m[1]) : -1
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
