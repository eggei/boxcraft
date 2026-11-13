import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ScenePreview } from './ScenePreview'

describe('ScenePreview', () => {
  it('lets the live scene run scripts but keeps it out of the app origin', () => {
    render(<ScenePreview source="<html>a</html>" title="Glow" mode="live" />)

    const frame = screen.getByTitle('Glow')
    // allow-scripts without allow-same-origin: the scene runs in an opaque
    // origin with no access to the page, localStorage or IndexedDB.
    expect(frame).toHaveAttribute('sandbox', 'allow-scripts')
  })

  it('shows a still as the artwork itself, with scripts off', () => {
    render(<ScenePreview source="<html>a</html>" title="Glow" mode="still" />)

    const frame = screen.getByTitle('Glow (still)')
    expect(frame).toHaveAttribute('srcdoc', '<html>a</html>')
    // An empty sandbox grants nothing, so a neighbor never runs its JS.
    expect(frame).toHaveAttribute('sandbox', '')
    // It keeps the dimmed tip's shadowed edge.
    expect(screen.getByLabelText('Glow (preview)').className).toContain(
      'shadow-raised',
    )
  })

  it('renders no frame at all for a placeholder', () => {
    const { container } = render(
      <ScenePreview source="<html>a</html>" title="Glow" mode="placeholder" />,
    )

    expect(container.querySelector('iframe')).toBeNull()
    expect(screen.getByLabelText('Glow (preview)')).toBeInTheDocument()
  })
})
