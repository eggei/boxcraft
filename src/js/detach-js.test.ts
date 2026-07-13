import { describe, it, expect } from 'vitest'
import { attachJs } from './attach-js'
import { detachJs } from './detach-js'

const SCENE = `<!doctype html>
<html>
  <head>
    <style>
      .box-1 { position: absolute; }
    </style>
  </head>
  <body>
    <div class="canvas">
      <div class="box-1"></div>
    </div>
    <script>
      console.log('BoxCraft scene loaded');
    </script>
  </body>
</html>
`

describe('detachJs', () => {
  it("removes the box's id attribute", () => {
    const attached = attachJs(SCENE, 'box-1').source
    const { source } = detachJs(attached, 'box-1')

    expect(source).not.toContain('id="box-1"')
    // The class is untouched — the box still exists, just without JS.
    expect(source).toContain('<div class="box-1"></div>')
  })

  it('removes the generated wiring line', () => {
    const attached = attachJs(SCENE, 'box-1').source
    const { source } = detachJs(attached, 'box-1')

    expect(source).not.toContain('getElementById')
  })

  it('leaves user code in the shared script intact', () => {
    const attached = attachJs(SCENE, 'box-1').source
    // The user types real code below the wiring after attaching.
    const withUserCode = attached.replace(
      "getElementById('box-1');\n",
      "getElementById('box-1');\n      box1.textContent = 'hi';\n",
    )

    const { source } = detachJs(withUserCode, 'box-1')

    expect(source).not.toContain('getElementById')
    expect(source).toContain("box1.textContent = 'hi';")
  })
})
