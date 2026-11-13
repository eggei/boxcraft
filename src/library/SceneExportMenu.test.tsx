import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SceneExportMenu } from './SceneExportMenu'

const SOURCE = '<!doctype html><html><body><div class="box-1"></div></body></html>'

/**
 * jsdom has no object URLs, downloads or tabs: keep every blob that was made a
 * URL for, and what was done with each URL.
 */
function captureBlobs() {
  const blobs = new Map<string, Blob>()
  const downloads: Array<{ filename: string; blob: Blob }> = []

  // Spy on the statics rather than replacing URL, so the constructor survives.
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    const url = `blob:${blobs.size}`
    blobs.set(url, blob as Blob)
    return url
  })
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    const blob = blobs.get(this.getAttribute('href') ?? '')
    if (blob) downloads.push({ filename: this.download, blob })
  })
  const open = vi.spyOn(window, 'open').mockImplementation(() => null)

  return { blobs, downloads, open, revoke }
}

async function openMenu() {
  const user = userEvent.setup()
  render(<SceneExportMenu title="Neon Ring" source={SOURCE} />)
  await user.click(screen.getByRole('button', { name: 'Export scene' }))
  return user
}

describe('SceneExportMenu', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('offers download, copy and open-in-tab', async () => {
    await openMenu()

    expect(
      screen.getAllByRole('menuitem').map((item) => item.textContent),
    ).toEqual(['Download .html', 'Copy HTML', 'Open in new tab'])
  })

  it('downloads the scene as an HTML file named after its title', async () => {
    const { downloads } = captureBlobs()
    const user = await openMenu()

    await user.click(screen.getByRole('menuitem', { name: 'Download .html' }))

    expect(downloads).toHaveLength(1)
    expect(downloads[0].filename).toBe('neon-ring.html')
    expect(downloads[0].blob.type).toBe('text/html')
    expect(await downloads[0].blob.text()).toBe(SOURCE)
  })

  it('copies the HTML and says so', async () => {
    const user = await openMenu()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')

    await user.click(screen.getByRole('menuitem', { name: 'Copy HTML' }))

    expect(writeText).toHaveBeenCalledWith(SOURCE)
    expect(await screen.findByRole('status')).toHaveTextContent('HTML copied')
  })

  it('says so when the browser refuses the copy', async () => {
    const user = await openMenu()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))

    await user.click(screen.getByRole('menuitem', { name: 'Copy HTML' }))

    expect(await screen.findByRole('status')).toHaveTextContent("Couldn't copy")
  })

  it('opens the scene sandboxed in a new tab from an HTML blob URL, revoked later', async () => {
    const { blobs, open, revoke } = captureBlobs()
    const user = await openMenu()
    // Watch for the revoke being scheduled rather than faking timers, which
    // would also stall the menu's own pointer handling.
    const schedule = vi.spyOn(globalThis, 'setTimeout')

    await user.click(screen.getByRole('menuitem', { name: 'Open in new tab' }))

    expect(open).toHaveBeenCalledWith('blob:0', '_blank', 'noopener')
    const blob = blobs.get('blob:0')!
    expect(blob.type).toBe('text/html')
    // The blob is a script-free shell; the scene itself only runs inside a
    // sandboxed frame, never with the app's origin.
    const viewer = new DOMParser().parseFromString(await blob.text(), 'text/html')
    expect(viewer.querySelectorAll('script')).toHaveLength(0)
    const frame = viewer.querySelector('iframe')!
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
    expect(frame.getAttribute('srcdoc')).toBe(SOURCE)

    // The tab needs the URL to load, so it outlives the click...
    expect(revoke).not.toHaveBeenCalled()
    // ...and is let go once the scheduled cleanup runs.
    const cleanup = schedule.mock.calls.find(([, delay]) => (delay ?? 0) >= 10_000)
    expect(cleanup).toBeDefined()
    const runCleanup = cleanup![0] as () => void
    runCleanup()
    expect(revoke).toHaveBeenCalledWith('blob:0')
  })
})
