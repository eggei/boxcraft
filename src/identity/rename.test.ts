import { describe, it, expect } from 'vitest'
import { renameBox } from './rename'

// box-1 appears as a CSS selector and an HTML class. It also appears in a
// script as an id string — which Phase 2 rename must NOT touch (that joins in
// Phase 3, DESIGN.md §8).
const SCENE = `<!doctype html>
<html>
  <head>
    <style>
      .box-1 { position: absolute; }
    </style>
  </head>
  <body>
    <div class="canvas">
      <div class="box-1" id="box-1"></div>
    </div>
    <script>
      const b = document.getElementById('box-1');
    </script>
  </body>
</html>
`

/** Apply a change-set (from-descending) to verify the resulting source. */
function applyChanges(source: string, changes: { from: number; to: number; insert: string }[]) {
  let out = source
  for (const c of [...changes].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, c.from) + c.insert + out.slice(c.to)
  }
  return out
}

describe('renameBox', () => {
  it('rewrites the CSS selector and HTML class occurrences to the new name', () => {
    const { source } = renameBox(SCENE, 'box-1', 'hero')

    expect(source).toContain('.hero {')
    expect(source).toContain('class="hero"')
  })

  it('leaves the JS id and getElementById string untouched (Phase 3 scope)', () => {
    const { source } = renameBox(SCENE, 'box-1', 'hero')

    // Only class + selector changed; the id attribute and the script keep box-1.
    expect(source).toContain('id="box-1"')
    expect(source).toContain("getElementById('box-1')")
  })

  it('returns a change-set that applies as one atomic edit (one undo step)', () => {
    const { changes, source } = renameBox(SCENE, 'box-1', 'hero')

    // Two managed occurrences: the selector and the class.
    expect(changes).toHaveLength(2)
    expect(changes.every((c) => c.insert === 'hero')).toBe(true)
    // Applying the change-set reproduces the returned source.
    expect(applyChanges(SCENE, changes)).toBe(source)
  })
})
