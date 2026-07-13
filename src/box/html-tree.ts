import { parser } from '@lezer/html'
import type { SyntaxNode } from '@lezer/common'

/**
 * A flat view of one HTML element from the Lezer tree, carrying just what the
 * identity layer needs: its tag name, the opening-tag span (where `data-bc`
 * splices and where a handle marker anchors), the closing-tag position (for
 * reading `<style>` content), and the parsed `class` names plus the value span.
 * Boxes are flat (DESIGN.md §6, §14), so a single walk yields every element.
 */
export interface ElementInfo {
  tagName: string
  /** Start offset of the opening tag (its `<`). */
  openFrom: number
  /** End offset of the opening tag (one past its `>`). */
  openTo: number
  /** Start offset of the closing tag, or null if the element has none. */
  closeFrom: number | null
  /** Start/end offsets of the raw `class` attribute value (inside the quotes). */
  classValueFrom: number | null
  classValueTo: number | null
  /** The `class` value split into individual class names. */
  classNames: string[]
  /** Start/end offsets of the raw `id` attribute value (inside the quotes), for
   *  the managed id token JS attach introduces (DESIGN.md §8). Null when absent. */
  idValueFrom: number | null
  idValueTo: number | null
}

/** Parse the source into a flat list of elements in document order. */
export function parseElements(source: string): ElementInfo[] {
  const elements: ElementInfo[] = []
  const cursor = parser.parse(source).cursor()
  do {
    if (cursor.name !== 'Element') continue
    const open = cursor.node.getChild('OpenTag') ?? cursor.node.getChild('SelfClosingTag')
    if (!open) continue
    const tag = open.getChild('TagName')
    const close = cursor.node.getChild('CloseTag')
    const { from: classValueFrom, to: classValueTo } = attrValueRange(source, open, 'class')
    const { from: idValueFrom, to: idValueTo } = attrValueRange(source, open, 'id')
    elements.push({
      tagName: tag ? source.slice(tag.from, tag.to).toLowerCase() : '',
      openFrom: open.from,
      openTo: open.to,
      closeFrom: close ? close.from : null,
      classValueFrom,
      classValueTo,
      classNames:
        classValueFrom != null
          ? source.slice(classValueFrom, classValueTo!).split(/\s+/).filter(Boolean)
          : [],
      idValueFrom,
      idValueTo,
    })
  } while (cursor.next())
  return elements
}

/** The inner span of a named attribute's value on an opening tag, if present. */
function attrValueRange(
  source: string,
  open: SyntaxNode,
  wanted: string,
): { from: number | null; to: number | null } {
  for (const attr of open.getChildren('Attribute')) {
    const attrName = attr.getChild('AttributeName')
    const attrValue = attr.getChild('AttributeValue')
    if (!attrName || !attrValue) continue
    if (source.slice(attrName.from, attrName.to) !== wanted) continue
    // Strip the surrounding quotes to expose just the value text.
    const raw = source.slice(attrValue.from, attrValue.to)
    const quoted = /^["']/.test(raw)
    return {
      from: attrValue.from + (quoted ? 1 : 0),
      to: attrValue.to - (quoted ? 1 : 0),
    }
  }
  return { from: null, to: null }
}
