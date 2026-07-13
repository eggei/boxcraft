import { describe, it, expect } from 'vitest'
import { computeGreyedRanges } from './greyed-ranges'

function textAt(source: string, ranges: { from: number; to: number }[]): string[] {
  return ranges.map((r) => source.slice(r.from, r.to))
}

describe('computeGreyedRanges', () => {
  it('greys the doctype declaration', () => {
    const source = '<!doctype html><html></html>'
    const ranges = computeGreyedRanges(source)
    expect(textAt(source, ranges)).toContain('<!doctype html>')
  })

  it('greys the html/head/body tags but not their text content', () => {
    const source = '<html><body>hello</body></html>'
    const ranges = computeGreyedRanges(source)
    const texts = textAt(source, ranges)
    expect(texts).toContain('<html>')
    expect(texts).toContain('</html>')
    expect(texts).toContain('<body>')
    expect(texts).toContain('</body>')
    expect(texts.join('')).not.toContain('hello')
  })

  it('greys the style/script tags but leaves their content alone', () => {
    const source = '<style>.a{color:red}</style><script>console.log(1)</script>'
    const ranges = computeGreyedRanges(source)
    const texts = textAt(source, ranges)
    expect(texts).toContain('<style>')
    expect(texts).toContain('</style>')
    expect(texts).toContain('<script>')
    expect(texts).toContain('</script>')
    expect(texts.join('')).not.toContain('.a{color:red}')
    expect(texts.join('')).not.toContain('console.log(1)')
  })

  it('greys generated box markup — the div tags of every canvas child', () => {
    const source = '<div class="canvas"><div class="box-1"></div></div>'
    const ranges = computeGreyedRanges(source)
    const texts = textAt(source, ranges)
    expect(texts).toContain('<div class="box-1">')
    expect(texts).toContain('</div>')
    // The canvas element's own tags are not boilerplate-greyed here — they are
    // ordinary user-authored markup, not tool-generated (DESIGN.md §4).
    expect(texts).not.toContain('<div class="canvas">')
  })

  it('greys a generated JS wiring line but not the user code around it', () => {
    const source = "<script>\nconst box1 = document.getElementById('box-1');\nconsole.log(box1)\n</script>"
    const ranges = computeGreyedRanges(source)
    const texts = textAt(source, ranges)
    expect(texts.some((t) => t.includes("getElementById('box-1')"))).toBe(true)
    expect(texts.join('')).not.toContain('console.log(box1)')
  })
})
