import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LibraryControls } from './LibraryControls'
import { buildLibrary, serializeLibrary, LIBRARY_FORMAT } from './libraryFile'
import { type Scene } from '@/scenes/sceneList'

const SCENES: Scene[] = [
  { id: 'a', title: 'Glow', source: '<html>a</html>', order: 0, archivedAt: null },
  { id: 'b', title: 'Card', source: '<html>b</html>', order: 1, archivedAt: null },
  { id: 'c', title: 'Old', source: '<html>c</html>', order: 2, archivedAt: 1 },
]

/** jsdom has no object URLs and no real downloads: capture what would be saved. */
function captureDownloads() {
  const blobs = new Map<string, Blob>()
  const saved: Array<{ filename: string; blob: Blob }> = []

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
    const blob = blobs.get(this.getAttribute('href') ?? '')
    if (blob) saved.push({ filename: this.download, blob })
  })

  return {
    get count() {
      return saved.length
    },
    async first() {
      return { filename: saved[0].filename, contents: await saved[0].blob.text() }
    },
  }
}

function libraryFile(scenes: Scene[], name = 'backup.json'): File {
  return new File([serializeLibrary(buildLibrary(scenes, Date.UTC(2026, 6, 24)))], name, {
    type: 'application/json',
  })
}

let downloads: ReturnType<typeof captureDownloads>

beforeEach(() => {
  downloads = captureDownloads()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('export', () => {
  it('downloads every scene, archived ones included, in a dated file', async () => {
    const user = userEvent.setup()
    render(<LibraryControls scenes={SCENES} onImport={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Export library' }))

    const { filename, contents } = await downloads.first()
    expect(filename).toMatch(/^boxcraft-library-\d{4}-\d{2}-\d{2}\.json$/)
    const parsed = JSON.parse(contents)
    expect(parsed.format).toBe(LIBRARY_FORMAT)
    expect(parsed.scenes.map((s: Scene) => s.id)).toEqual(['a', 'b', 'c'])
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Exported 3 scenes',
    )
  })

  it('is disabled while the library is empty', () => {
    render(<LibraryControls scenes={[]} onImport={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Export library' })).toBeDisabled()
  })
})

describe('import', () => {
  it('summarizes the picked file and waits for a choice', async () => {
    const user = userEvent.setup()
    const onImport = vi.fn()
    render(<LibraryControls scenes={SCENES} onImport={onImport} />)

    await user.upload(screen.getByLabelText('Library file'), libraryFile(SCENES))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('backup.json')
    expect(dialog).toHaveTextContent('2 scenes, 1 archived')
    // Nothing happens until the user picks add or replace.
    expect(onImport).not.toHaveBeenCalled()
  })

  it('adds to the library when "Add to library" is chosen', async () => {
    const user = userEvent.setup()
    const onImport = vi.fn()
    render(<LibraryControls scenes={SCENES} onImport={onImport} />)

    await user.upload(screen.getByLabelText('Library file'), libraryFile(SCENES))
    await user.click(await screen.findByRole('button', { name: 'Add to library' }))

    expect(onImport).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'a' })]),
      'merge',
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Imported 3 scenes',
    )
  })

  it('replaces the library when "Replace library" is chosen', async () => {
    const user = userEvent.setup()
    const onImport = vi.fn()
    render(<LibraryControls scenes={SCENES} onImport={onImport} />)

    await user.upload(screen.getByLabelText('Library file'), libraryFile(SCENES))
    await user.click(await screen.findByRole('button', { name: 'Replace library' }))

    expect(onImport).toHaveBeenCalledWith(expect.any(Array), 'replace')
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Library replaced with 3 scenes',
    )
  })

  it('cancelling imports nothing', async () => {
    const user = userEvent.setup()
    const onImport = vi.fn()
    render(<LibraryControls scenes={SCENES} onImport={onImport} />)

    await user.upload(screen.getByLabelText('Library file'), libraryFile(SCENES))
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(onImport).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('explains an unreadable file instead of importing it', async () => {
    const user = userEvent.setup()
    const onImport = vi.fn()
    render(<LibraryControls scenes={SCENES} onImport={onImport} />)

    await user.upload(
      screen.getByLabelText('Library file'),
      new File(['not json {'], 'notes.json', { type: 'application/json' }),
    )

    expect(await screen.findByRole('dialog')).toHaveTextContent(
      "That file isn't valid JSON",
    )
    expect(
      screen.queryByRole('button', { name: 'Add to library' }),
    ).not.toBeInTheDocument()
    expect(onImport).not.toHaveBeenCalled()
  })

  it('reports entries it had to skip', async () => {
    const user = userEvent.setup()
    render(<LibraryControls scenes={SCENES} onImport={vi.fn()} />)

    await user.upload(
      screen.getByLabelText('Library file'),
      new File(
        [
          JSON.stringify({
            format: LIBRARY_FORMAT,
            version: 1,
            scenes: [{ id: 'ok', source: '<html/>' }, null, 7],
          }),
        ],
        'partial.json',
      ),
    )

    expect(await screen.findByRole('dialog')).toHaveTextContent(
      "2 entries couldn't be read",
    )
  })
})
