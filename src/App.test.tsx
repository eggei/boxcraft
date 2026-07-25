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

  it('opens the editor directly when a new scene is created', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findAllByTestId('scene-card')

    await user.click(screen.getByRole('button', { name: 'New' }))

    // The editing level: no feed cards, and the header edits the new scene.
    expect(screen.queryAllByTestId('scene-card')).toHaveLength(0)
    expect(screen.getByLabelText('Scene title')).toHaveValue('Untitled')
    expect(
      screen.getByRole('button', { name: 'Exit (Esc)' }),
    ).toBeInTheDocument()
  })

  it('enters the editor when a feed card is clicked', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findAllByTestId('scene-card')

    await user.click(screen.getByRole('button', { name: 'Edit Gradient card' }))

    expect(screen.queryAllByTestId('scene-card')).toHaveLength(0)
    expect(screen.getByLabelText('Scene title')).toHaveValue('Gradient card')
  })

  it('toggles dark mode on the document root', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findAllByTestId('scene-card')
    const root = document.documentElement

    // jsdom reports no dark OS preference, so the app starts light.
    expect(root).not.toHaveClass('dark')

    await user.click(
      screen.getByRole('button', { name: 'Switch to dark theme' }),
    )
    expect(root).toHaveClass('dark')
    expect(localStorage.getItem('boxcraft:theme')).toBe('dark')

    await user.click(
      screen.getByRole('button', { name: 'Switch to light theme' }),
    )
    expect(root).not.toHaveClass('dark')
    expect(localStorage.getItem('boxcraft:theme')).toBe('light')
  })

  it('restores a stored dark preference on load', async () => {
    localStorage.setItem('boxcraft:theme', 'dark')
    render(<App />)
    await screen.findAllByTestId('scene-card')
    expect(document.documentElement).toHaveClass('dark')
  })
})
