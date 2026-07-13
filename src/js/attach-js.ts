import { parseElements, type ElementInfo } from '../box/html-tree'
import { deriveVarName } from './var-name'

export interface AttachResult {
  source: string
  /** Offset in the returned source where the cursor should land — the empty
   *  indented line just below the box's wiring, ready for the user to code.
   *  On re-attach, the existing wiring line (so the editor jumps, not edits). */
  cursorOffset: number
  /** True when the box was already attached: no id/const was added and the
   *  cursor points at the existing wiring line (DESIGN.md §8, re-attach jumps). */
  alreadyAttached: boolean
}

/**
 * Attach JS behavior to a box (DESIGN.md §8): add a real `id` to the element so
 * the user's JS has a legitimate hook, and generate a
 * `const <var> = document.getElementById('<name>')` wiring line in the scene's
 * one shared `<script>` at the end of `<body>` (reusing it, or creating it if
 * absent). Insert-only text surgery via the Lezer tree — every splice happens
 * before an existing tag, so the rest of the document survives byte-for-byte and
 * is never reserialized. The auto-derived variable name is user-owned from here
 * on (it does not follow renames — DESIGN.md §8).
 */
export function attachJs(source: string, name: string): AttachResult {
  const elements = parseElements(source)
  const box = elements.find((el) => el.classNames.includes(name))
  if (!box) return { source, cursorOffset: 0, alreadyAttached: false }

  // Re-attach: the box already has its id and wiring — jump, don't duplicate.
  const existing = existingWiringOffset(source, name)
  if (hasId(source, box, name) && existing != null) {
    return { source, cursorOffset: existing, alreadyAttached: true }
  }

  const inserts: { at: number; text: string; cursorInText?: number }[] = [
    { at: box.openTo - 1, text: ` id="${name}"` },
  ]

  const script = lastScript(elements)
  if (script && script.closeFrom != null) {
    const { text, cursorInText } = scriptAppend(source, script.closeFrom, wiringLine(name))
    inserts.push({ at: script.closeFrom, text, cursorInText })
  } else {
    const body = elements.find((el) => el.tagName === 'body' && el.closeFrom != null)
    const at = body?.closeFrom ?? source.length
    const { text, cursorInText } = newScript(source, at, wiringLine(name))
    inserts.push({ at, text, cursorInText })
  }
  return { ...splice(source, inserts), alreadyAttached: false }
}

/** True when the box's opening tag already carries `id="<name>"`. */
function hasId(source: string, box: ElementInfo, name: string): boolean {
  const openTag = source.slice(box.openFrom, box.openTo)
  return new RegExp(`\\bid\\s*=\\s*["']${escapeRegExp(name)}["']`).test(openTag)
}

/** Offset of the `const` on the existing wiring line for a box, or null. */
function existingWiringOffset(source: string, name: string): number | null {
  const idx = source.indexOf(`getElementById('${name}')`)
  if (idx < 0) return null
  const lineStart = source.lastIndexOf('\n', idx) + 1
  return lineStart + (source.slice(lineStart, idx).match(/^\s*/)?.[0].length ?? 0)
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** The generated `getElementById` wiring for a box. */
function wiringLine(name: string): string {
  return `const ${deriveVarName(name)} = document.getElementById('${name}');`
}

/** The last `<script>` element (the shared, end-of-body one), if any. */
function lastScript(elements: ElementInfo[]): ElementInfo | undefined {
  return [...elements].reverse().find((el) => el.tagName === 'script' && el.closeFrom != null)
}

/**
 * Build the text to splice before a `</script>`: the wiring line plus a blank
 * landing line, both indented one level past the closing tag. `cursorInText`
 * points at the empty landing line so the editor drops the cursor there.
 */
function scriptAppend(
  source: string,
  closeFrom: number,
  wiring: string,
): { text: string; cursorInText: number } {
  // The insertion sits right after the `</script>` line's indent, so the wiring
  // needs only the *extra* level of indent (two spaces) to align one deeper.
  const closeIndent = indentBefore(source, closeFrom)
  const bodyLine = closeIndent + '  '
  const head = `  ${wiring}\n${bodyLine}`
  return { text: `${head}\n${closeIndent}`, cursorInText: head.length }
}

/**
 * Build the text to splice before `</body>` when the scene has no `<script>`:
 * a fresh `<script>` holding the wiring line plus a blank landing line.
 * `cursorInText` points at the landing line.
 */
function newScript(
  source: string,
  bodyClose: number,
  wiring: string,
): { text: string; cursorInText: number } {
  const bodyIndent = indentBefore(source, bodyClose)
  const scriptIndent = bodyIndent + '  '
  const bodyLine = scriptIndent + '  '
  const head = `  <script>\n${bodyLine}${wiring}\n${bodyLine}`
  return { text: `${head}\n${scriptIndent}</script>\n${bodyIndent}`, cursorInText: head.length }
}

/** The whitespace indentation of the line ending at `offset`. */
function indentBefore(source: string, offset: number): string {
  const lineStart = source.lastIndexOf('\n', offset - 1) + 1
  const indent = source.slice(lineStart, offset)
  return /^[ \t]*$/.test(indent) ? indent : ''
}

/** Apply insert-only edits, tracking a cursor offset carried by one of them. */
function splice(
  source: string,
  inserts: { at: number; text: string; cursorInText?: number }[],
): { source: string; cursorOffset: number } {
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
  return { source: out + source.slice(last), cursorOffset }
}
