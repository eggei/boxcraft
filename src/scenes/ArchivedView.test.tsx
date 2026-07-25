import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ArchivedView } from './ArchivedView'
import { type Scene } from './sceneList'

const SCENES: Scene[] = [
  { id: 'a', title: 'Glow', source: '<html>a</html>', order: 0, archivedAt: null },
  { id: 'b', title: 'Old one', source: '<html>b</html>', order: 1, archivedAt: 10 },
]

describe('ArchivedView', () => {
  it('shows a 100×100 snapshot of the artwork next to each archived scene', () => {
    render(<ArchivedView scenes={SCENES} onUnarchive={vi.fn()} />)

    const snapshot = screen.getByTitle('Old one snapshot')
    expect(snapshot).toHaveAttribute('srcdoc', '<html>b</html>')

    // The frame renders the scene at its own canvas size and is scaled to fit
    // the 100px box, so the whole artwork shows.
    const box = snapshot.parentElement!
    expect(box).toHaveStyle({ width: '100px', height: '100px' })
    expect(snapshot).toHaveStyle({ transform: 'scale(0.25)' })
  })

  it('lists only archived scenes', () => {
    render(<ArchivedView scenes={SCENES} onUnarchive={vi.fn()} />)

    expect(screen.getAllByTestId('archived-item')).toHaveLength(1)
    expect(screen.queryByTitle('Glow snapshot')).not.toBeInTheDocument()
  })
})
