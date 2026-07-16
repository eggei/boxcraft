import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import { getScene } from './persistence/scenes'

describe('App', () => {
  it('renders the BoxCraft heading', async () => {
    render(<App />)
    expect(
      await screen.findByRole('heading', { name: 'BoxCraft' }),
    ).toBeInTheDocument()
  })

  it('autosaves title edits so they persist across a reload', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<App />)

    const titleInput = await screen.findByLabelText('Scene title')
    await user.clear(titleInput)
    await user.type(titleInput, 'Glow button')

    await waitFor(async () => {
      expect((await getScene('scene-1'))?.title).toBe('Glow button')
    })

    // Simulate a reload: throw away the React tree, remount from persistence.
    unmount()
    render(<App />)
    expect(await screen.findByDisplayValue('Glow button')).toBeInTheDocument()
  })
})
