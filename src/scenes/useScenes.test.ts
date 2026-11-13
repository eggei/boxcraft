import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getAllScenes,
  getScene,
  replaceAllScenes,
  saveScene,
} from '@/persistence/scenes'
import { AUTOSAVE_DELAY_MS, useScenes } from './useScenes'

// Spy on the persistence module while keeping it real, so the tests can count
// writes and still read back what reached IndexedDB.
vi.mock('@/persistence/scenes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/persistence/scenes')>()
  return {
    ...actual,
    saveScene: vi.fn(actual.saveScene),
    removeScene: vi.fn(actual.removeScene),
    replaceAllScenes: vi.fn(actual.replaceAllScenes),
  }
})

const save = vi.mocked(saveScene)
const replaceAll = vi.mocked(replaceAllScenes)

/** Mount the hook, wait for the restore, and forget the writes seeding made. */
async function renderReady() {
  const hook = renderHook(() => useScenes())
  await waitFor(() => expect(hook.result.current.status).toBe('ready'))
  save.mockClear()
  replaceAll.mockClear()
  return hook
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
}

afterEach(() => {
  vi.clearAllMocks()
  setVisibility('visible')
})

describe('useScenes autosave', () => {
  it('seeds every example scene on first run', async () => {
    const { result } = renderHook(() => useScenes())
    await waitFor(() => expect(result.current.status).toBe('ready'))

    expect(save).toHaveBeenCalledTimes(result.current.scenes.length)
    expect(await getAllScenes()).toHaveLength(result.current.scenes.length)
  })

  it('writes one edited scene exactly once, after the debounce', async () => {
    const { result } = await renderReady()

    act(() => result.current.updateSource('seed-1', '<html>edited</html>'))
    expect(save).not.toHaveBeenCalled()

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'seed-1', source: '<html>edited</html>' }),
    )

    // Nothing else trickles in afterwards.
    await wait(AUTOSAVE_DELAY_MS + 100)
    expect(save).toHaveBeenCalledTimes(1)
    expect((await getScene('seed-1'))?.source).toBe('<html>edited</html>')
  })

  it('collapses a burst of edits into a single write of the latest state', async () => {
    const { result } = await renderReady()

    for (const source of ['<a>', '<ab>', '<abc>']) {
      act(() => result.current.updateSource('seed-1', source))
    }

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ source: '<abc>' }))
  })

  it('writes only the scenes that changed', async () => {
    const { result } = await renderReady()

    act(() => {
      result.current.renameScene('seed-1', 'One')
      result.current.renameScene('seed-3', 'Three')
    })

    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    expect(save.mock.calls.map(([scene]) => scene.id).sort()).toEqual(['seed-1', 'seed-3'])
  })

  it('does not write back a scene deleted while it had unsaved edits', async () => {
    const { result } = await renderReady()

    act(() => result.current.renameScene('seed-1', 'Doomed'))
    act(() => result.current.deleteScene('seed-1'))

    await waitFor(async () => expect(await getScene('seed-1')).toBeUndefined())
    await wait(AUTOSAVE_DELAY_MS + 100)

    expect(save.mock.calls.map(([scene]) => scene.id)).not.toContain('seed-1')
    expect(await getScene('seed-1')).toBeUndefined()
  })

  it('flushes pending edits as soon as the tab is hidden', async () => {
    const { result } = await renderReady()

    act(() => result.current.renameScene('seed-1', 'Hidden'))
    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ title: 'Hidden' }))
  })

  it('flushes pending edits on pagehide', async () => {
    const { result } = await renderReady()

    act(() => result.current.renameScene('seed-1', 'Leaving'))
    window.dispatchEvent(new Event('pagehide'))

    expect(save).toHaveBeenCalledTimes(1)
  })

  it('flushes pending edits when the hook unmounts', async () => {
    const { result, unmount } = await renderReady()

    act(() => result.current.renameScene('seed-1', 'Unmounted'))
    unmount()

    expect(save).toHaveBeenCalledTimes(1)
    await waitFor(async () => expect((await getScene('seed-1'))?.title).toBe('Unmounted'))
  })

  it('flushes pending edits before an import swaps the library', async () => {
    const { result } = await renderReady()

    act(() => result.current.renameScene('seed-1', 'Before import'))
    await act(() => result.current.importLibrary([], 'merge'))

    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.invocationCallOrder[0]).toBeLessThan(replaceAll.mock.invocationCallOrder[0])

    // The swap stored everything, so the debounce has nothing left to write.
    await wait(AUTOSAVE_DELAY_MS + 100)
    expect(save).toHaveBeenCalledTimes(1)
  })
})
