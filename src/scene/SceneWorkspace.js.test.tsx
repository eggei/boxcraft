import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SceneWorkspace } from './SceneWorkspace'
import { clickBoxInScene } from '../test/drive-scene'

// The scene stays live (no capture overlay); Select/Attach clicks are read from
// inside the iframe's own document. jsdom doesn't parse srcdoc, so
// `clickBoxInScene` injects the box's real handle element and dispatches a click.

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

// A scene where box-1 already has JS attached.
const ATTACHED = SCENE.replace('<div class="box-1"></div>', '<div class="box-1" id="box-1"></div>').replace(
  "console.log('BoxCraft scene loaded');",
  "console.log('BoxCraft scene loaded');\n      const box1 = document.getElementById('box-1');",
)

const frame = () => screen.getByTitle('scene') as HTMLIFrameElement

describe('SceneWorkspace — Attach JS tool', () => {
  it('switches to the Attach JS tool with the J shortcut', async () => {
    const user = userEvent.setup()
    render(<SceneWorkspace initialSource={SCENE} />)

    await user.keyboard('j')
    expect(screen.getByRole('button', { name: /attach js/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('attaches JS to the clicked box (id + wiring) and reverts to Select', async () => {
    const user = userEvent.setup()
    const onSourceChange = vi.fn()
    render(<SceneWorkspace initialSource={SCENE} onSourceChange={onSourceChange} />)

    await user.click(screen.getByRole('button', { name: /attach js/i }))
    await clickBoxInScene(frame())

    await waitFor(() => {
      const latest = onSourceChange.mock.lastCall?.[0] ?? ''
      expect(latest).toContain('<div class="box-1" id="box-1">')
      expect(latest).toContain("const box1 = document.getElementById('box-1');")
    })
    // Tool reverts to Select after use (DESIGN.md §6).
    expect(screen.getByRole('button', { name: /select/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('does not duplicate wiring when re-attaching an already-attached box', async () => {
    const user = userEvent.setup()
    const onSourceChange = vi.fn()
    render(<SceneWorkspace initialSource={SCENE} onSourceChange={onSourceChange} />)

    // First attach edits the doc (one change).
    await user.click(screen.getByRole('button', { name: /attach js/i }))
    await clickBoxInScene(frame())
    await waitFor(() => expect(onSourceChange).toHaveBeenCalledTimes(1))

    // Re-attach the same box: it only jumps to the existing line — no new edit,
    // so the change count stays at 1 (no duplicate id/const).
    await user.click(screen.getByRole('button', { name: /attach js/i }))
    await clickBoxInScene(frame())
    expect(onSourceChange).toHaveBeenCalledTimes(1)
  })
})

describe('SceneWorkspace — Rename with JS attached', () => {
  it('renames class, selector, id and getElementById in one transaction', async () => {
    const user = userEvent.setup()
    const onSourceChange = vi.fn()
    render(<SceneWorkspace initialSource={ATTACHED} onSourceChange={onSourceChange} />)

    // Select box-1 (already has a rule → no edit), then rename it.
    await clickBoxInScene(frame())
    const input = await screen.findByLabelText('Rename box')
    await user.clear(input)
    await user.type(input, 'hero')
    await user.click(screen.getByRole('button', { name: /^rename$/i }))

    await waitFor(() => {
      const latest = onSourceChange.mock.lastCall?.[0] ?? ''
      expect(latest).toContain('.hero {')
      expect(latest).toContain('class="hero"')
      expect(latest).toContain('id="hero"')
      expect(latest).toContain("getElementById('hero')")
      // The user-owned variable name is left alone (DESIGN.md §8).
      expect(latest).toContain('const box1 = document.getElementById')
    })
    // One transaction for the whole rename → a single ⌘Z reverts it.
    expect(onSourceChange).toHaveBeenCalledTimes(1)
  })
})

describe('SceneWorkspace — Detach JS', () => {
  it('offers Detach only for an attached box and removes the id + wiring', async () => {
    const user = userEvent.setup()
    const onSourceChange = vi.fn()
    render(<SceneWorkspace initialSource={ATTACHED} onSourceChange={onSourceChange} />)

    await clickBoxInScene(frame())
    await user.click(await screen.findByRole('button', { name: /detach js/i }))

    await waitFor(() => {
      const latest = onSourceChange.mock.lastCall?.[0] ?? ''
      expect(latest).not.toContain('id="box-1"')
      expect(latest).not.toContain('getElementById')
      // The box itself (class) survives — just without JS.
      expect(latest).toContain('<div class="box-1"></div>')
    })
  })

  it('does not offer Detach for a box without JS', async () => {
    render(<SceneWorkspace initialSource={SCENE} />)

    await clickBoxInScene(frame())
    await screen.findByLabelText('Rename box')
    expect(screen.queryByRole('button', { name: /detach js/i })).not.toBeInTheDocument()
  })
})
