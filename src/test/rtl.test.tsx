import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

// Confirms React Testing Library renders components and jest-dom matchers work.
describe('React Testing Library', () => {
  it('renders a component and finds it in the DOM', () => {
    render(<h1>BoxCraft</h1>)
    expect(screen.getByRole('heading', { name: 'BoxCraft' })).toBeInTheDocument()
  })
})
