import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toolbar } from './Toolbar'

describe('Toolbar', () => {
  it('offers a Select and a Box tool', () => {
    render(<Toolbar tool="select" onToolChange={() => {}} />)

    expect(screen.getByRole('button', { name: /select/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /box/i })).toBeInTheDocument()
  })

  it('marks the active tool as pressed', () => {
    const { rerender } = render(<Toolbar tool="select" onToolChange={() => {}} />)
    expect(screen.getByRole('button', { name: /select/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /box/i })).toHaveAttribute('aria-pressed', 'false')

    rerender(<Toolbar tool="box" onToolChange={() => {}} />)
    expect(screen.getByRole('button', { name: /box/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('reports the chosen tool when a tool is clicked', async () => {
    const user = userEvent.setup()
    const onToolChange = vi.fn()
    render(<Toolbar tool="select" onToolChange={onToolChange} />)

    await user.click(screen.getByRole('button', { name: /box/i }))

    expect(onToolChange).toHaveBeenCalledWith('box')
  })

  it('offers an active Attach JS tool (Phase 3)', async () => {
    const user = userEvent.setup()
    const onToolChange = vi.fn()
    render(<Toolbar tool="select" onToolChange={onToolChange} />)

    const attach = screen.getByRole('button', { name: /attach js/i })
    expect(attach).not.toBeDisabled()

    await user.click(attach)
    expect(onToolChange).toHaveBeenCalledWith('js')
  })
})
