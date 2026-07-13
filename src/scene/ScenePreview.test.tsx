import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScenePreview } from './ScenePreview'

describe('ScenePreview', () => {
  it('renders a cached snapshot as an image when one is available', () => {
    render(<ScenePreview source="<p>hi</p>" snapshot="data:image/png;base64,abc" title="Scene 1" />)

    const img = screen.getByRole('img', { name: 'Scene 1 preview' })
    expect(img).toHaveAttribute('src', 'data:image/png;base64,abc')
  })

  it('falls back to the sandboxed placeholder when no snapshot is cached yet', () => {
    render(<ScenePreview source="<p>hi</p>" title="Scene 1" />)

    expect(screen.getByTitle('Scene 1 preview').tagName).toBe('IFRAME')
  })
})
