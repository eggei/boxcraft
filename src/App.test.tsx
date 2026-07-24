import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import { getAllScenes, getScene } from './persistence/scenes'

describe('App', () => {
  it('renders the BoxCraft heading', async () => {
    render(<App />)
    expect(
      await screen.findByRole('heading', { name: 'BoxCraft' }),
    ).toBeInTheDocument()
  })

  it('seeds example scenes on first run with an empty database', async () => {
    render(<App />)
    await screen.findAllByTestId('scene-card')
    const seeded = await getAllScenes()
    expect(seeded.length).toBeGreaterThanOrEqual(3)
  })

  it('autosaves a title edit so it persists across a reload', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<App />)

    const [firstTitle] = await screen.findAllByRole('textbox')
    await user.clear(firstTitle)
    await user.type(firstTitle, 'Neon ring')

    await waitFor(async () => {
      expect((await getScene('seed-1'))?.title).toBe('Neon ring')
    })

    // Simulate a reload: throw away the React tree, remount from persistence.
    unmount()
    render(<App />)
    expect(await screen.findByDisplayValue('Neon ring')).toBeInTheDocument()
  })
})
