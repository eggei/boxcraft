import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SceneThumbnail } from './SceneThumbnail'

describe('SceneThumbnail', () => {
  it('renders the scene in a fully sandboxed frame so its scripts never run', () => {
    render(<SceneThumbnail source="<html>a</html>" title="Glow" size={120} />)

    const frame = screen.getByTitle('Glow snapshot')
    // An empty sandbox grants nothing: no scripts, no same-origin access. A
    // looping or hostile scene can't freeze the browse views or touch the app.
    expect(frame).toHaveAttribute('sandbox', '')
    expect(frame).toHaveAttribute('srcdoc', '<html>a</html>')
  })
})
