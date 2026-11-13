import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ScenePreview } from './ScenePreview'

describe('ScenePreview', () => {
  it('lets the live scene run scripts but keeps it out of the app origin', () => {
    render(<ScenePreview source="<html>a</html>" title="Glow" live />)

    const frame = screen.getByTitle('Glow')
    // allow-scripts without allow-same-origin: the scene runs in an opaque
    // origin with no access to the page, localStorage or IndexedDB.
    expect(frame).toHaveAttribute('sandbox', 'allow-scripts')
  })
})
