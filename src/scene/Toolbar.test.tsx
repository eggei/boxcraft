import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Toolbar } from './Toolbar'

describe('Toolbar', () => {
  it('reports the tool when a button is clicked', async () => {
    const onToolChange = vi.fn()
    const user = userEvent.setup()
    render(<Toolbar tool="select" onToolChange={onToolChange} />)

    await user.click(screen.getByRole('button', { name: 'Box' }))

    expect(onToolChange).toHaveBeenCalledWith('box')
  })

  it('marks the active tool as pressed', () => {
    render(<Toolbar tool="box" onToolChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Box' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('switches tools with the V, B and J shortcuts', async () => {
    const onToolChange = vi.fn()
    const user = userEvent.setup()
    render(<Toolbar tool="select" onToolChange={onToolChange} />)

    await user.keyboard('b')
    expect(onToolChange).toHaveBeenLastCalledWith('box')

    await user.keyboard('j')
    expect(onToolChange).toHaveBeenLastCalledWith('js')

    await user.keyboard('v')
    expect(onToolChange).toHaveBeenLastCalledWith('select')
  })

  it('ignores shortcuts while typing in a field', async () => {
    const onToolChange = vi.fn()
    const user = userEvent.setup()
    render(
      <>
        <input aria-label="field" />
        <Toolbar tool="select" onToolChange={onToolChange} />
      </>,
    )

    await user.click(screen.getByLabelText('field'))
    await user.keyboard('b')

    expect(onToolChange).not.toHaveBeenCalled()
  })
})
