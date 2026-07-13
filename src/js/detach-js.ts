import { parseElements } from '../box/html-tree'

export interface DetachResult {
  source: string
}

/**
 * Detach JS from a box (DESIGN.md §8): remove the now-purposeless `id` from the
 * element and the generated `const … = getElementById('<name>')` wiring line.
 * Any code the user typed below the wiring is left intact — only the two
 * generated fragments are removed. Removal-only text surgery via the Lezer tree
 * and a scoped scan; the rest of the document survives byte-for-byte.
 */
export function detachJs(source: string, name: string): DetachResult {
  const removals: { from: number; to: number }[] = []

  const box = parseElements(source).find((el) => el.classNames.includes(name))
  if (box) {
    const idAttr = new RegExp(`\\s*id\\s*=\\s*["']${escapeRegExp(name)}["']`)
    const m = idAttr.exec(source.slice(box.openFrom, box.openTo))
    if (m) removals.push({ from: box.openFrom + m.index, to: box.openFrom + m.index + m[0].length })
  }

  const wiring = wiringLineRange(source, name)
  if (wiring) removals.push(wiring)

  let out = source
  for (const r of removals.sort((a, b) => b.from - a.from)) {
    out = out.slice(0, r.from) + out.slice(r.to)
  }
  return { source: out }
}

/**
 * The full-line range (including its trailing newline) of the generated wiring
 * line for a box — the `const … = document.getElementById('<name>');` line. Only
 * that exact generated shape is matched, so user code is never removed.
 */
function wiringLineRange(source: string, name: string): { from: number; to: number } | null {
  const re = new RegExp(
    `[ \\t]*const\\s+[A-Za-z0-9_$]+\\s*=\\s*document\\.getElementById\\('${escapeRegExp(name)}'\\);[ \\t]*\\n?`,
  )
  const m = re.exec(source)
  return m ? { from: m.index, to: m.index + m[0].length } : null
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
