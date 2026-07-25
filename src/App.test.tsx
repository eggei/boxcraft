import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { getAllScenes, getScene } from './persistence/scenes'
import { LIBRARY_FORMAT, LIBRARY_VERSION } from './library/libraryFile'

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
    render(<App />)
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
    render(<App />)
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
    render(<App />)
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
    const { unmount } = render(<App />)
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
    render(<App />)

    expect(await screen.findByDisplayValue('Only one')).toBeInTheDocument()
    expect(screen.getAllByTestId('scene-card')).toHaveLength(1)
  })

  it('round-trips an export back into an empty library', async () => {
    const exported = captureExport()
    const user = userEvent.setup()
    const { unmount } = render(<App />)
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
    render(<App />)
    expect(await screen.findByDisplayValue('Glow button')).toBeInTheDocument()
  })

  it('does not create a scene when N is pressed with the import dialog open', async () => {
    const user = userEvent.setup()
    render(<App />)
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
    render(<App />)
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
