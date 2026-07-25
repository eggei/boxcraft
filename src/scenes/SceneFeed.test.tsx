import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SceneFeed } from './SceneFeed'
import { CANVAS_SIZE, type Scene } from './sceneList'

const SCENES: Scene[] = [
  { id: 'a', title: 'Glow', source: '<html>a</html>', order: 0, archivedAt: null },
  { id: 'b', title: 'Card', source: '<html>b</html>', order: 1, archivedAt: null },
]

function feedProps() {
  return {
    onRename: vi.fn(),
    onDuplicate: vi.fn(),
    onArchive: vi.fn(),
    onDelete: vi.fn(),
  }
}

describe('SceneFeed', () => {
  it('renders each scene at its canvas size instead of filling the height', () => {
    render(<SceneFeed scenes={SCENES} {...feedProps()} />)

    const artwork = screen.getByRole('button', { name: 'Edit Glow' })
    expect(artwork).toHaveStyle({
      width: `${CANVAS_SIZE}px`,
      height: `${CANVAS_SIZE}px`,
    })
  })

  it('gives each card a canvas-tall slot that snaps to the middle', () => {
    render(<SceneFeed scenes={SCENES} {...feedProps()} />)

    const [card] = screen.getAllByTestId('scene-card')
    // The slot is the artwork and nothing more, so the space between slots is
    // what shows through at the top and bottom of the screen.
    expect(card).toHaveStyle({ height: `${CANVAS_SIZE}px` })
    expect(card.className).toContain('snap-center')
  })

  it('shows the neighbouring scenes as smaller, translucent tips', () => {
    render(<SceneFeed scenes={SCENES} {...feedProps()} />)

    const [current, next] = screen.getAllByTestId('scene-card')
    expect(current.style.opacity).toBe('1')
    expect(current.style.transform).toBe('')
    // How faint a tip is depends on the theme, so it comes from the palette.
    expect(next.style.opacity).toBe('var(--tip-opacity)')
    expect(next.style.transform).toMatch(/^scale\(0\.\d+\)$/)
  })

  it('runs only the centered scene — a tip is static, never an iframe', () => {
    const { container } = render(<SceneFeed scenes={SCENES} {...feedProps()} />)

    const frames = Array.from(container.querySelectorAll('iframe'))
    expect(frames.map((frame) => frame.title)).toEqual(['Glow'])
    expect(screen.getByLabelText('Card (preview)')).toBeInTheDocument()
  })

  it('fades the top and bottom edges so the stack reads as rolling', () => {
    render(<SceneFeed scenes={SCENES} {...feedProps()} />)

    const vignette = screen.getByTestId('feed-vignette')
    expect(vignette.style.background).toContain('linear-gradient')
    expect(vignette.className).toContain('pointer-events-none')
  })

  it('reports the focused scene by id so the owner can route to it', () => {
    const onCurrentSceneChange = vi.fn()
    render(
      <SceneFeed
        scenes={SCENES}
        focusSceneId="b"
        onCurrentSceneChange={onCurrentSceneChange}
        {...feedProps()}
      />,
    )

    expect(onCurrentSceneChange).toHaveBeenCalledWith('b')
  })

  it('opens a scene by id when its render is clicked', async () => {
    const onOpen = vi.fn()
    render(<SceneFeed scenes={SCENES} onOpen={onOpen} {...feedProps()} />)

    screen.getByRole('button', { name: 'Edit Card' }).click()

    expect(onOpen).toHaveBeenCalledWith('b')
  })
})
