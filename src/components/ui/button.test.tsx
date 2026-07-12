import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from './button'

// Confirms shadcn/ui components import and render under the test harness.
describe('shadcn Button', () => {
  it('renders as a button with its label and variant classes', () => {
    render(<Button variant="destructive">Delete</Button>)
    const btn = screen.getByRole('button', { name: 'Delete' })
    expect(btn).toBeInTheDocument()
    expect(btn.className).toContain('bg-destructive')
  })
})
