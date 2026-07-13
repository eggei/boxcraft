import { describe, it, expect } from 'vitest'
import { buildSnapshotSvgDataUrl } from './capture-snapshot'

describe('buildSnapshotSvgDataUrl', () => {
  it('wraps the given HTML in an SVG foreignObject sized to width/height', () => {
    const url = buildSnapshotSvgDataUrl('<div>hi</div>', 400, 300)

    expect(url).toMatch(/^data:image\/svg\+xml;charset=utf-8,/)
    const svg = decodeURIComponent(url.slice(url.indexOf(',') + 1))
    expect(svg).toContain('width="400"')
    expect(svg).toContain('height="300"')
    expect(svg).toContain('<foreignObject')
    expect(svg).toContain('<div>hi</div>')
  })
})
