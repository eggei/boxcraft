import {
  ColorType,
  makeColorPicker,
  colorPickerTheme,
  parseCallExpression,
  parseColorLiteral,
  parseNamedColor,
  wrapperClassName,
  type ColorData,
  type WidgetOptions,
} from '@replit/codemirror-css-color-picker'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

type DiscoverColors = Parameters<typeof makeColorPicker>[0]['discoverColors']
type Tree = Parameters<DiscoverColors>[0]
type Doc = Parameters<DiscoverColors>[4]
type SyntaxNode = ReturnType<Tree['resolveInner']>

/** Class on the span that wraps each swatch's `<input type="color">`. */
export const swatchClassName = wrapperClassName

const NUM = String.raw`(\d+(?:\.\d+)?)`
const SEP = String.raw`(?:\s*,\s*|\s+)`
const hslRegex = new RegExp(
  String.raw`^hsla?\(\s*${NUM}(?:deg)?${SEP}${NUM}%${SEP}${NUM}%\s*(?:[,/]\s*(\d*\.?\d+%?)\s*)?\)$`,
  'i',
)

const hex2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0')

/** `hsl()`/`hsla()` to `#rrggbb` (CSS Color 4's reference conversion). */
export function hslToHex(h: number, s: number, l: number): string {
  s /= 100
  l /= 100
  const a = s * Math.min(l, 1 - l)
  const channel = (n: number) => {
    const k = (n + h / 30) % 12
    return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))
  }
  return `#${hex2(channel(0))}${hex2(channel(8))}${hex2(channel(4))}`
}

/**
 * A CSS color function as the picker sees it: its hex value, plus the alpha
 * suffix to carry through a pick unchanged. The plugin's own HSL conversion is
 * wrong (`hsl(120, 100%, 50%)` comes out as `#-1ff01`) and it skips `hsla()`,
 * so HSL is parsed here. Alpha is kept in comma form because the plugin writes
 * picks back as `rgb(r, g, b<alpha>)` / `hsl(h, s%, l%<alpha>)`, and a
 * `/ 50%` suffix after commas would not be valid CSS.
 */
export function parseColorFunction(text: string): ColorData | null {
  const hsl = hslRegex.exec(text)
  if (hsl) {
    const [, h, s, l, alpha] = hsl
    return {
      colorType: ColorType.hsl,
      color: hslToHex(Number(h) % 360, Number(s), Number(l)),
      alpha: alpha ? `, ${alpha}` : '',
    }
  }
  if (/^hsla?\(/i.test(text)) return null
  const data = parseCallExpression(text)
  if (!data) return null
  return { ...data, alpha: data.alpha.replace(/^\s*[,/]\s*/, ', ') }
}

/** The color a single CSS syntax node spells, if it spells one. */
function colorAt(type: string, from: number, to: number, doc: Doc): WidgetOptions | null {
  const text = doc.sliceString(from, to)
  let data: ColorData | null = null
  if (type === 'ColorLiteral') data = parseColorLiteral(text)
  else if (type === 'CallExpression') data = parseColorFunction(text)
  else if (type === 'ValueName') data = parseNamedColor(text.toLowerCase())
  return data && { ...data, from, to }
}

/**
 * `style="…"` attributes are parsed as overlay trees, which a plain iteration
 * of the HTML tree doesn't enter; resolving a position inside the value does.
 */
function colorsInStyleAttribute(tree: Tree, from: number, to: number, doc: Doc): WidgetOptions[] {
  let node: SyntaxNode | null = tree.resolveInner(from + 1, 1)
  while (node && node.name !== 'Styles') node = node.parent
  if (!node || node.from < from || node.to > to) return []

  const found: WidgetOptions[] = []
  const walk = (n: SyntaxNode) => {
    const color = colorAt(n.name, n.from, n.to, doc)
    if (color) found.push(color)
    for (let child = n.firstChild; child; child = child.nextSibling) walk(child)
  }
  walk(node)
  return found
}

const discoverColors: DiscoverColors = (tree, from, to, type, doc) =>
  type === 'AttributeValue'
    ? colorsInStyleAttribute(tree, from, to, doc)
    : colorAt(type, from, to, doc)

/**
 * The plugin's base theme outlines swatches in a fixed light gray; this
 * restyles them from the app's tokens so they sit right in both themes.
 */
const swatchTheme = EditorView.theme({
  [`.${swatchClassName}`]: {
    outline: '1px solid var(--border)',
    borderRadius: '2px',
    overflow: 'hidden',
  },
})

/**
 * Inline color swatches beside CSS color values (hex, rgb()/rgba(),
 * hsl()/hsla() and named colors), in the `<style>` block and in `style="…"`
 * attributes. Only CSS syntax nodes are inspected, so color-like text elsewhere
 * in the document is left alone. Clicking a swatch opens the native color
 * picker; committing a pick rewrites the color text, in its original notation,
 * in a single transaction, so one undo puts the old value back.
 */
export const colorSwatches: Extension = [
  makeColorPicker({ discoverColors }),
  colorPickerTheme,
  swatchTheme,
]
