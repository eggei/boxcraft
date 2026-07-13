import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NavProvider, useNav } from './NavContext'

function Probe() {
  const { state, dispatch } = useNav()
  return (
    <div>
      <span data-testid="level">{state.level}</span>
      <span data-testid="current">{state.currentId ?? 'none'}</span>
      <button onClick={() => dispatch({ type: 'ZOOM_IN', id: 'a' })}>zoom in</button>
    </div>
  )
}

describe('NavProvider', () => {
  it('starts at L2 and updates on dispatch', async () => {
    const user = userEvent.setup()
    render(
      <NavProvider>
        <Probe />
      </NavProvider>,
    )

    expect(screen.getByTestId('level')).toHaveTextContent('L2')
    expect(screen.getByTestId('current')).toHaveTextContent('none')

    await user.click(screen.getByText('zoom in'))

    expect(screen.getByTestId('current')).toHaveTextContent('a')
  })
})
