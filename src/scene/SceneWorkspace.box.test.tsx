import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SceneWorkspace } from './SceneWorkspace'

// Canvas-relative coordinate mapping depends on real iframe geometry, which
// jsdom has none of. Mock the seam so the gesture wiring can be exercised with
// injected coords (the real mapping is verified in the browser). The mock
// echoes the pointer's client coords straight through as canvas coords.
vi.mock('./canvas-coords', () => ({
  clientToCanvas: (_frame: unknown, x: number, y: number) => ({ x, y }),
}))

const SCENE = `<!doctype html>
<html>
  <head>
    <style>
      .canvas { position: relative; width: 400px; height: 400px; }
    </style>
  </head>
  <body>
    <div class="canvas"></div>
  </body>
</html>
`

describe('SceneWorkspace — Box tool', () => {
  it('switches tools with the V and B keyboard shortcuts', async () => {
    const user = userEvent.setup()
    render(<SceneWorkspace initialSource={SCENE} />)

    // Select is the default (DESIGN.md §6).
    expect(screen.getByRole('button', { name: /select/i })).toHaveAttribute('aria-pressed', 'true')

    await user.keyboard('b')
    expect(screen.getByRole('button', { name: /box/i })).toHaveAttribute('aria-pressed', 'true')

    await user.keyboard('v')
    expect(screen.getByRole('button', { name: /select/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('does not switch tools when the shortcut key is typed into the editor', async () => {
    const user = userEvent.setup()
    render(<SceneWorkspace initialSource="x" />)

    const content = document.querySelector('.cm-content') as HTMLElement
    await user.click(content)
    await user.type(content, 'b')

    // 'b' was typed as code, not consumed as the Box shortcut.
    expect(screen.getByRole('button', { name: /select/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /box/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('inserts a box on a Box-tool gesture and reverts to Select', async () => {
    const user = userEvent.setup()
    const onSourceChange = vi.fn()
    render(<SceneWorkspace initialSource={SCENE} onSourceChange={onSourceChange} />)

    await user.click(screen.getByRole('button', { name: /box/i }))

    const overlay = screen.getByTestId('box-overlay')
    fireEvent.pointerDown(overlay, { clientX: 10, clientY: 20 })
    fireEvent.pointerUp(overlay, { clientX: 110, clientY: 100 })

    await waitFor(() => {
      const latest = onSourceChange.mock.lastCall?.[0] ?? ''
      expect(latest).toContain('<div class="box-1">')
      expect(latest).toContain('.box-1 {')
      // Marquee mapped straight through: width 100, height 80.
      expect(latest).toContain('width: 100px;')
      expect(latest).toContain('height: 80px;')
    })

    // Tool reverts to Select after creation (DESIGN.md §6).
    expect(screen.getByRole('button', { name: /select/i })).toHaveAttribute('aria-pressed', 'true')
  })
})
