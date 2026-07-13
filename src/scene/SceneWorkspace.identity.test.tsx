import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SceneWorkspace } from './SceneWorkspace'

// Hit-testing depends on real iframe geometry, which jsdom lacks. Mock the seam
// so a Select click resolves to box-1 (the real mapping is verified in the
// browser). Resolved-names reading is geometry-free but the srcdoc iframe does
// not render synchronously in jsdom, so selection/rename are driven directly.
vi.mock('./hit-test', () => ({ hitTestBox: () => 'box-1' }))

const SCENE = `<!doctype html>
<html>
  <head>
    <style>
      .canvas { position: relative; }
      .box-1 { position: absolute; left: 10px; }
    </style>
  </head>
  <body>
    <div class="canvas">
      <div class="box-1"></div>
    </div>
  </body>
</html>
`

// A scene whose box-1 <div> survives but its rule was hand-deleted.
const NO_RULE = SCENE.replace('      .box-1 { position: absolute; left: 10px; }\n', '')

describe('SceneWorkspace — instrumented render', () => {
  it('renders an instrumented copy with data-bc while the editor source stays clean', async () => {
    render(<SceneWorkspace initialSource={SCENE} />)

    const frame = screen.getByTitle('scene') as HTMLIFrameElement
    await waitFor(() => expect(frame.getAttribute('srcdoc')).toContain('data-bc='))

    const editorText = document.querySelector('.cm-content')?.textContent ?? ''
    expect(editorText).toContain('box-1')
    expect(editorText).not.toContain('data-bc')
  })
})

describe('SceneWorkspace — selection', () => {
  it('selects the clicked box, surfacing its name in the Rename affordance', async () => {
    const user = userEvent.setup()
    render(<SceneWorkspace initialSource={SCENE} />)

    // Select is the default tool, so the capture overlay is present.
    await user.click(screen.getByTestId('select-overlay'))

    const input = (await screen.findByLabelText('Rename box')) as HTMLInputElement
    expect(input.value).toBe('box-1')
  })

  it('re-creates a minimal rule when selecting a box whose rule was deleted', async () => {
    const user = userEvent.setup()
    const onSourceChange = vi.fn()
    render(<SceneWorkspace initialSource={NO_RULE} onSourceChange={onSourceChange} />)

    await user.click(screen.getByTestId('select-overlay'))

    await waitFor(() => {
      const latest = onSourceChange.mock.lastCall?.[0] ?? ''
      expect(latest).toContain('.box-1 {')
    })
  })
})

describe('SceneWorkspace — rename', () => {
  it('renames class + selector in a single transaction (one undo step)', async () => {
    const user = userEvent.setup()
    const onSourceChange = vi.fn()
    render(<SceneWorkspace initialSource={SCENE} onSourceChange={onSourceChange} />)

    // Selecting a box that already has a rule only moves the cursor — no edit.
    await user.click(screen.getByTestId('select-overlay'))
    expect(onSourceChange).not.toHaveBeenCalled()

    const input = await screen.findByLabelText('Rename box')
    await user.clear(input)
    await user.type(input, 'hero')
    await user.click(screen.getByRole('button', { name: /rename/i }))

    await waitFor(() => {
      const latest = onSourceChange.mock.lastCall?.[0] ?? ''
      expect(latest).toContain('.hero {')
      expect(latest).toContain('class="hero"')
    })
    // Exactly one edit for the whole rename → a single ⌘Z reverts it.
    expect(onSourceChange).toHaveBeenCalledTimes(1)
  })
})
