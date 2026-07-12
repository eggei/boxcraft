import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SceneFrame } from './SceneFrame'

describe('SceneFrame', () => {
  it('renders the scene source into an isolated iframe via srcdoc', () => {
    render(<SceneFrame source="<h1>hi</h1>" />)

    const frame = screen.getByTitle('scene')
    expect(frame.tagName).toBe('IFRAME')
    expect(frame).toHaveAttribute('srcdoc', '<h1>hi</h1>')
  })

  it('re-renders when the source changes', () => {
    const { rerender } = render(<SceneFrame source="<p>one</p>" />)
    expect(screen.getByTitle('scene')).toHaveAttribute('srcdoc', '<p>one</p>')

    rerender(<SceneFrame source="<p>two</p>" />)

    expect(screen.getByTitle('scene')).toHaveAttribute('srcdoc', '<p>two</p>')
  })
})
