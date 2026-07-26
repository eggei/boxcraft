import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { getAllScenes, getScene } from './persistence/scenes'
import { SCENE_PITCH } from './scenes/SceneFeed'
import { LIBRARY_FORMAT, LIBRARY_VERSION } from './library/libraryFile'

/**
 * The app reads its location from the router, so tests mount it behind an
 * in-memory one. Each render starts from a fresh history — no location leaking
 * from the test before it — and `at` deep-links a specific page.
 */
function renderApp(at = '/') {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <App />
    </MemoryRouter>,
  )
}

describe('App', () => {
  it('renders the BoxCraft heading', async () => {
    renderApp()
    expect(
      await screen.findByRole('heading', { name: 'BoxCraft' }),
    ).toBeInTheDocument()
  })

  it('ships both cuts of the logo so the theme can pick one in CSS', async () => {
    const { container } = renderApp()
    await screen.findByRole('heading', { name: 'BoxCraft' })

    const sources = [...container.querySelectorAll('header img')].map((img) =>
      img.getAttribute('src'),
    )
    expect(sources).toEqual(['/logo-dark.png', '/logo-light.png'])
  })

  it('seeds example scenes on first run with an empty database', async () => {
    renderApp()
    await screen.findAllByTestId('scene-card')
    const seeded = await getAllScenes()
    expect(seeded.length).toBeGreaterThanOrEqual(3)
  })

  it('autosaves a title edit so it persists across a reload', async () => {
    const user = userEvent.setup()
    const { unmount } = renderApp()

    const [firstTitle] = await screen.findAllByRole('textbox')
    await user.clear(firstTitle)
    await user.type(firstTitle, 'Neon ring')

    await waitFor(async () => {
      expect((await getScene('seed-1'))?.title).toBe('Neon ring')
    })

    // Simulate a reload: throw away the React tree, remount from persistence.
    unmount()
    renderApp()
    expect(await screen.findByDisplayValue('Neon ring')).toBeInTheDocument()
  })

  it('opens the editor directly when a new scene is created', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findAllByTestId('scene-card')

    await user.click(screen.getByRole('button', { name: 'New' }))

    // The editing level: no feed cards, and the header edits the new scene.
    expect(screen.queryAllByTestId('scene-card')).toHaveLength(0)
    expect(screen.getByLabelText('Scene title')).toHaveValue('Untitled')
    expect(screen.getByRole('link', { name: 'Exit (Esc)' })).toBeInTheDocument()
  })

  it('enters the editor when a feed card is clicked', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findAllByTestId('scene-card')

    await user.click(screen.getByRole('button', { name: 'Edit Gradient card' }))

    expect(screen.queryAllByTestId('scene-card')).toHaveLength(0)
    expect(screen.getByLabelText('Scene title')).toHaveValue('Gradient card')
  })

  it('toggles dark mode on the document root', async () => {
    const user = userEvent.setup()
    renderApp()
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
    renderApp()
    await screen.findAllByTestId('scene-card')
    expect(document.documentElement).toHaveClass('dark')
  })
})

describe('deleting a scene', () => {
  /** The Delete button on the first feed card. */
  async function clickDelete(user: ReturnType<typeof userEvent.setup>) {
    await screen.findAllByTestId('scene-card')
    const [deleteButton] = screen.getAllByRole('button', { name: 'Delete' })
    await user.click(deleteButton)
    return screen.findByRole('dialog')
  }

  it('asks for confirmation and says the deletion is permanent', async () => {
    const user = userEvent.setup()
    renderApp()

    const dialog = await clickDelete(user)

    expect(dialog).toHaveTextContent('Glow button')
    expect(dialog).toHaveTextContent(/permanently/i)
    expect(dialog).toHaveTextContent(/can't be undone/i)
    // Nothing is gone while the question is still on screen.
    expect(await getScene('seed-1')).toBeDefined()
  })

  it('keeps the scene when the confirmation is cancelled', async () => {
    const user = userEvent.setup()
    renderApp()

    await clickDelete(user)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('scene-card')).toHaveLength(3)
    expect(await getScene('seed-1')).toBeDefined()
  })

  it('keeps the scene when the confirmation is dismissed with Escape', async () => {
    const user = userEvent.setup()
    renderApp()

    await clickDelete(user)
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('scene-card')).toHaveLength(3)
  })

  it('does not create a scene when N is pressed with the dialog open', async () => {
    const user = userEvent.setup()
    renderApp()

    await clickDelete(user)
    await user.keyboard('n')

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(await getAllScenes()).toHaveLength(3)
  })

  it('removes the scene from storage on confirmation — it is not archived', async () => {
    const user = userEvent.setup()
    renderApp()

    await clickDelete(user)
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }))

    await waitFor(async () => {
      expect(await getScene('seed-1')).toBeUndefined()
    })
    expect(screen.getAllByTestId('scene-card')).toHaveLength(2)
    expect(screen.getByRole('status')).toHaveTextContent('Scene deleted')

    // Gone for good: the archive has nothing to restore either.
    await user.click(screen.getByRole('link', { name: 'Archived' }))
    expect(await screen.findByText('No archived scenes.')).toBeInTheDocument()
  })

  it('undo puts the deleted scene back in its old position, and in storage', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findAllByTestId('scene-card')

    const [, secondDelete] = screen.getAllByRole('button', { name: 'Delete' })
    await user.click(secondDelete)
    await user.click(
      await screen.findByRole('button', { name: 'Delete permanently' }),
    )
    await waitFor(async () => expect(await getScene('seed-2')).toBeUndefined())

    await user.click(screen.getByRole('button', { name: 'Undo' }))

    await waitFor(async () => {
      expect((await getScene('seed-2'))?.title).toBe('Gradient card')
    })
    expect(
      screen.getAllByRole('textbox').map((input) => (input as HTMLInputElement).value),
    ).toEqual(['Glow button', 'Gradient card', 'Pulsing dot'])
  })

  it('a deleted scene stays gone across a reload', async () => {
    const user = userEvent.setup()
    const { unmount } = renderApp()

    await clickDelete(user)
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }))
    await waitFor(async () => expect(await getScene('seed-1')).toBeUndefined())

    unmount()
    renderApp()

    expect(await screen.findByDisplayValue('Gradient card')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Glow button')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('scene-card')).toHaveLength(2)
  })
})

describe('routes', () => {
  it('lands on the feed from the root', async () => {
    renderApp('/')
    expect(await screen.findAllByTestId('scene-card')).not.toHaveLength(0)
  })

  it('opens the files grid at /files', async () => {
    renderApp('/files')
    expect(await screen.findAllByTestId('files-tile')).toHaveLength(3)
    expect(screen.queryAllByTestId('scene-card')).toHaveLength(0)
  })

  it('opens the archive at /archived', async () => {
    renderApp('/archived')
    expect(await screen.findByText('No archived scenes.')).toBeInTheDocument()
  })

  it('deep-links straight into the editor for one scene', async () => {
    renderApp('/edit/seed-2')
    expect(await screen.findByLabelText('Scene title')).toHaveValue(
      'Gradient card',
    )
  })

  it('falls back to the feed when the URL names a scene that is gone', async () => {
    renderApp('/edit/does-not-exist')
    expect(await screen.findAllByTestId('scene-card')).not.toHaveLength(0)
    expect(screen.queryByLabelText('Scene title')).not.toBeInTheDocument()
  })

  it('falls back to the feed on an unknown path', async () => {
    renderApp('/nonsense')
    expect(await screen.findAllByTestId('scene-card')).not.toHaveLength(0)
  })

  it('scrolls the feed to the scene named in the URL', async () => {
    // jsdom does no layout, so record what scrollTop is set to rather than
    // reading where the feed ended up.
    const scrollTops: number[] = []
    vi.spyOn(HTMLElement.prototype, 'scrollTop', 'set').mockImplementation(
      (value) => scrollTops.push(value),
    )

    renderApp('/feed/seed-3')
    await screen.findAllByTestId('scene-card')

    // Cards rest one pitch apart, so the third one is two pitches down.
    expect(scrollTops).toContain(2 * SCENE_PITCH)
    vi.restoreAllMocks()
  })

  it('navigates from the feed to the files grid and back', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findAllByTestId('scene-card')

    await user.click(screen.getByRole('link', { name: 'Files' }))
    expect(await screen.findAllByTestId('files-tile')).toHaveLength(3)

    await user.click(screen.getByRole('link', { name: 'Feed' }))
    expect(await screen.findAllByTestId('scene-card')).not.toHaveLength(0)
  })

  it('leaves the editor on Escape', async () => {
    const user = userEvent.setup()
    renderApp('/edit/seed-1')
    await screen.findByLabelText('Scene title')

    await user.keyboard('{Escape}')

    expect(await screen.findAllByTestId('scene-card')).not.toHaveLength(0)
    expect(screen.queryByLabelText('Scene title')).not.toBeInTheDocument()
  })
})

describe('library backup and restore', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  /** jsdom can't download: capture the blob the export anchor would have saved. */
  function captureExport(): () => Promise<string> {
    const blobs = new Map<string, Blob>()
    let saved: Blob | null = null

    vi.stubGlobal('URL', {
      createObjectURL(blob: Blob) {
        const url = `blob:${blobs.size}`
        blobs.set(url, blob)
        return url
      },
      revokeObjectURL() {},
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved = blobs.get(this.getAttribute('href') ?? '') ?? saved
    })

    return async () => {
      if (!saved) throw new Error('nothing was downloaded')
      return (saved as Blob).text()
    }
  }

  function libraryFile(scenes: unknown[], name = 'backup.json'): File {
    return new File(
      [
        JSON.stringify({
          format: LIBRARY_FORMAT,
          version: LIBRARY_VERSION,
          exportedAt: Date.UTC(2026, 6, 24),
          scenes,
        }),
      ],
      name,
      { type: 'application/json' },
    )
  }

  it('exports the scenes that are actually in the library', async () => {
    const exported = captureExport()
    const user = userEvent.setup()
    renderApp()
    await screen.findAllByTestId('scene-card')

    await user.click(screen.getByRole('button', { name: 'Export library' }))

    const parsed = JSON.parse(await exported())
    expect(parsed.format).toBe(LIBRARY_FORMAT)
    expect(parsed.scenes.map((s: { title: string }) => s.title)).toEqual([
      'Glow button',
      'Gradient card',
      'Pulsing dot',
    ])
  })

  it('adds imported scenes alongside the existing ones', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findAllByTestId('scene-card')

    await user.upload(
      screen.getByLabelText('Library file'),
      libraryFile([
        { id: 'restored', title: 'Restored', source: '<html>r</html>', order: 0, archivedAt: null },
      ]),
    )
    await user.click(await screen.findByRole('button', { name: 'Add to library' }))

    await waitFor(async () => {
      expect((await getAllScenes()).map((s) => s.title).sort()).toEqual([
        'Glow button',
        'Gradient card',
        'Pulsing dot',
        'Restored',
      ])
    })
    expect(await screen.findByDisplayValue('Restored')).toBeInTheDocument()
  })

  it('replacing drops the old scenes from storage, not just from the screen', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findAllByTestId('scene-card')
    expect(await getScene('seed-1')).toBeDefined()

    await user.upload(
      screen.getByLabelText('Library file'),
      libraryFile([
        { id: 'only', title: 'Only one', source: '<html>o</html>', order: 0, archivedAt: null },
      ]),
    )
    await user.click(await screen.findByRole('button', { name: 'Replace library' }))

    await waitFor(async () => {
      expect((await getAllScenes()).map((s) => s.id)).toEqual(['only'])
    })
    expect(await getScene('seed-1')).toBeUndefined()

    // And the feed shows the one imported scene, not the three it replaced.
    await waitFor(() =>
      expect(screen.getAllByTestId('scene-card')).toHaveLength(1),
    )
  })

  it('survives a reload after a replace', async () => {
    const user = userEvent.setup()
    const { unmount } = renderApp()
    await screen.findAllByTestId('scene-card')

    await user.upload(
      screen.getByLabelText('Library file'),
      libraryFile([
        { id: 'only', title: 'Only one', source: '<html>o</html>', order: 0, archivedAt: null },
      ]),
    )
    await user.click(await screen.findByRole('button', { name: 'Replace library' }))
    await waitFor(async () =>
      expect((await getAllScenes())).toHaveLength(1),
    )

    unmount()
    renderApp()

    expect(await screen.findByDisplayValue('Only one')).toBeInTheDocument()
    expect(screen.getAllByTestId('scene-card')).toHaveLength(1)
  })

  it('round-trips an export back into an empty library', async () => {
    const exported = captureExport()
    const user = userEvent.setup()
    const { unmount } = renderApp()
    await screen.findAllByTestId('scene-card')

    await user.click(screen.getByRole('button', { name: 'Export library' }))
    const backup = new File([await exported()], 'boxcraft-library.json', {
      type: 'application/json',
    })

    // Wipe the library down to a single throwaway scene, then restore.
    await user.upload(
      screen.getByLabelText('Library file'),
      libraryFile([
        { id: 'x', title: 'Throwaway', source: '<html>x</html>', order: 0, archivedAt: null },
      ]),
    )
    await user.click(await screen.findByRole('button', { name: 'Replace library' }))
    await waitFor(async () => expect(await getAllScenes()).toHaveLength(1))

    await user.upload(screen.getByLabelText('Library file'), backup)
    await user.click(await screen.findByRole('button', { name: 'Replace library' }))

    await waitFor(async () => {
      const restored = await getAllScenes()
      expect(restored.map((s) => s.title).sort()).toEqual([
        'Glow button',
        'Gradient card',
        'Pulsing dot',
      ])
      // Sources come back byte-identical, not re-seeded from the examples.
      expect((await getScene('seed-1'))?.source).toContain('box-shadow')
    })

    unmount()
    renderApp()
    expect(await screen.findByDisplayValue('Glow button')).toBeInTheDocument()
  })

  it('does not create a scene when N is pressed with the import dialog open', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findAllByTestId('scene-card')

    await user.upload(
      screen.getByLabelText('Library file'),
      libraryFile([
        { id: 'restored', title: 'Restored', source: '<html>r</html>', order: 0, archivedAt: null },
      ]),
    )
    await screen.findByRole('dialog')

    await user.keyboard('n')

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(await getAllScenes()).toHaveLength(3)
  })

  it('closes the import dialog on Escape', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findAllByTestId('scene-card')

    await user.upload(
      screen.getByLabelText('Library file'),
      libraryFile([
        { id: 'restored', title: 'Restored', source: '<html>r</html>', order: 0, archivedAt: null },
      ]),
    )
    await screen.findByRole('dialog')

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
