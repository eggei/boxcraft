import { describe, it, expect } from 'vitest'
import { ensureRule } from './ensure-rule'

const WITH_RULE = `<!doctype html>
<html>
  <head>
    <style>
      .canvas { position: relative; }
      .box-1 { position: absolute; }
    </style>
  </head>
  <body>
    <div class="canvas">
      <div class="box-1"></div>
    </div>
  </body>
</html>
`

// box-1's <div> survives but its rule was hand-deleted (DESIGN.md §7).
const NO_RULE = WITH_RULE.replace('      .box-1 { position: absolute; }\n', '')

describe('ensureRule', () => {
  it('re-creates a minimal rule for a box whose rule was deleted', () => {
    const result = ensureRule(NO_RULE, 'box-1')!

    expect(result).not.toBeNull()
    expect(result.source).toContain('.box-1 {')
    // The cursor lands inside the freshly created rule, ready to style.
    const ruleOpen = result.source.indexOf('.box-1 {')
    const ruleClose = result.source.indexOf('}', ruleOpen)
    expect(result.cursorOffset).toBeGreaterThan(ruleOpen)
    expect(result.cursorOffset).toBeLessThan(ruleClose)
  })

  it('is a no-op when the box already has a rule', () => {
    expect(ensureRule(WITH_RULE, 'box-1')).toBeNull()
  })
})
