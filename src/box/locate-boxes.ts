import { parseElements, type ElementInfo } from './html-tree'

/**
 * A managed box located in a scene's HTML source: its public name (`box-N`) and
 * the exact source span of that name token inside the element's `class` value.
 * Boxes are flat — always direct children of `.canvas` (DESIGN.md §6, §14) — so
 * a single walk over the tree finds them all. This is the *discovery* of
 * tool-generated boxes by their `box-N` naming; once a handle is bound, the
 * marker (not the name) is the authority for what is managed.
 */
export interface BoxLocation {
  /** The public class name, e.g. `box-1`. */
  name: string
  /** Start offset of the `box-N` token within the `class` attribute value. */
  nameFrom: number
  /** End offset of the `box-N` token within the `class` attribute value. */
  nameTo: number
  /** Start offset of the opening tag (its `<`); a stable anchor for the handle marker. */
  openTagFrom: number
  /** End offset of the opening tag (one past its `>`); `data-bc` splices before it. */
  openTagTo: number
}

/** Matches a managed box class name (`box-` + digits) as a whole word. */
const BOX_NAME = /\bbox-\d+\b/

/**
 * Find every `box-N` box in the source, precise `box-N` token span and all.
 * Naive user classes (`.glow`, `canvas`) never match the `box-N` namespace the
 * tool generates, so they are ignored (DESIGN.md §5).
 */
export function locateBoxes(source: string): BoxLocation[] {
  const boxes: BoxLocation[] = []
  for (const el of parseElements(source)) {
    const box = boxOf(source, el)
    if (box) boxes.push(box)
  }
  return boxes
}

/** The `box-N` box for an element, if its class carries a `box-N` name. */
function boxOf(source: string, el: ElementInfo): BoxLocation | null {
  if (el.classValueFrom == null) return null
  const value = source.slice(el.classValueFrom, el.classValueTo!)
  const match = BOX_NAME.exec(value)
  if (!match) return null
  return {
    name: match[0],
    nameFrom: el.classValueFrom + match.index,
    nameTo: el.classValueFrom + match.index + match[0].length,
    openTagFrom: el.openFrom,
    openTagTo: el.openTo,
  }
}
