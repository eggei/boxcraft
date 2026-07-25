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

  it('centers each card in a viewport-tall section', () => {
    render(<SceneFeed scenes={SCENES} {...feedProps()} />)

    const [card] = screen.getAllByTestId('scene-card')
    expect(card.className).toContain('h-full')
    expect(card.className).toContain('justify-center')
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
