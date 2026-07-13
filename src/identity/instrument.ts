import { parseElements } from '../box/html-tree'

/**
 * Produce the *instrumented* copy of a scene that the iframe renders: each
 * managed box carries a transient `data-bc="<handle>"` on its opening tag for
 * hit-testing (DESIGN.md §5). This is the render input, which deliberately
 * diverges from the source of truth — the editor's source stays clean and the
 * user never sees or exports this copy.
 *
 * A box is located by its current managed name (the keys of `handleByName`),
 * not by the `box-N` pattern, so a renamed box is still instrumented and still
 * resolves. Insert-only text surgery, like `insertBox`: the attribute is spliced
 * before each box's `>`, so untouched regions survive byte-for-byte. User
 * elements and user-invented classes are never in the map, so never tagged.
 */
export function instrument(source: string, handleByName: Map<string, string>): string {
  if (handleByName.size === 0) return source

  const inserts: { at: number; text: string }[] = []
  for (const el of parseElements(source)) {
    const name = el.classNames.find((c) => handleByName.has(c))
    if (name) inserts.push({ at: el.openTo - 1, text: ` data-bc="${handleByName.get(name)}"` })
  }
  inserts.sort((a, b) => a.at - b.at)

  let out = ''
  let last = 0
  for (const ins of inserts) {
    out += source.slice(last, ins.at) + ins.text
    last = ins.at
  }
  return out + source.slice(last)
}
