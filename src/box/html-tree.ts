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
    const { classValueFrom, classValueTo } = classValueRange(source, open)
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
    })
  } while (cursor.next())
  return elements
}

/** The inner span of an element's `class` attribute value, if present. */
function classValueRange(
  source: string,
  open: SyntaxNode,
): { classValueFrom: number | null; classValueTo: number | null } {
  for (const attr of open.getChildren('Attribute')) {
    const attrName = attr.getChild('AttributeName')
    const attrValue = attr.getChild('AttributeValue')
    if (!attrName || !attrValue) continue
    if (source.slice(attrName.from, attrName.to) !== 'class') continue
    // Strip the surrounding quotes to expose just the value text.
    const raw = source.slice(attrValue.from, attrValue.to)
    const quoted = /^["']/.test(raw)
    return {
      classValueFrom: attrValue.from + (quoted ? 1 : 0),
      classValueTo: attrValue.to - (quoted ? 1 : 0),
    }
  }
  return { classValueFrom: null, classValueTo: null }
}
