import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getScene, saveScene } from '@/persistence/scenes'
import { createScene } from './sceneList'
import { AUTOSAVE_DELAY_MS, useScenes } from './useScenes'

// Keep persistence real but countable.
vi.mock('@/persistence/scenes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/persistence/scenes')>()
  return { ...actual, saveScene: vi.fn(actual.saveScene) }
})

/**
 * Two mounted hooks stand in for two tabs: they share the (fake) IndexedDB and
 * hear each other over the (fake) BroadcastChannel from the test setup.
 */
async function openTabs() {
  const a = renderHook(() => useScenes())
  await waitFor(() => expect(a.result.current.status).toBe('ready'))
  const b = renderHook(() => useScenes())
  await waitFor(() => expect(b.result.current.status).toBe('ready'))
  return { a, b }
}

type Tab = Awaited<ReturnType<typeof openTabs>>['a']

function titleIn(tab: Tab, id: string) {
  return tab.result.current.scenes.find((scene) => scene.id === id)?.title
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useScenes across tabs', () => {
  it('picks up a scene another tab saved', async () => {
    const { a, b } = await openTabs()

    act(() => a.result.current.renameScene('seed-1', 'From A'))
    await act(() => a.result.current.flush())

    await waitFor(() => expect(titleIn(b, 'seed-1')).toBe('From A'))
    expect(b.result.current.conflicts).toEqual([])
  })

  it('picks up a scene another tab created', async () => {
    const { a, b } = await openTabs()

    let id = ''
    act(() => {
      id = a.result.current.addScene()
    })
    await act(() => a.result.current.flush())

    await waitFor(() => expect(b.result.current.scenes.map((s) => s.id)).toContain(id))
  })

  it('drops a scene another tab deleted', async () => {
    const { a, b } = await openTabs()

    act(() => a.result.current.deleteScene('seed-2'))

    await waitFor(() =>
      expect(b.result.current.scenes.map((s) => s.id)).not.toContain('seed-2'),
    )
  })

  it('takes the whole library when another tab replaces it', async () => {
    const { a, b } = await openTabs()

    await act(() =>
      a.result.current.importLibrary(
        [createScene({ id: 'only', order: 0, title: 'Imported' })],
        'replace',
      ),
    )

    await waitFor(() => expect(b.result.current.scenes.map((s) => s.title)).toEqual(['Imported']))
  })

  it('does not echo merged changes back as writes of its own', async () => {
    const { a, b } = await openTabs()
    vi.mocked(saveScene).mockClear()

    act(() => a.result.current.renameScene('seed-1', 'From A'))
    await act(() => a.result.current.flush())
    await waitFor(() => expect(titleIn(b, 'seed-1')).toBe('From A'))

    // Had B marked the merge dirty, its debounce would write it out (and
    // announce it back to A) — A's save would not be the only one.
    await wait(AUTOSAVE_DELAY_MS + 100)
    expect(saveScene).toHaveBeenCalledTimes(1)
    expect(titleIn(a, 'seed-1')).toBe('From A')
  })

  describe('when both tabs edit the same scene', () => {
    /** B has an unsaved rename when A's save of the same scene arrives. */
    async function clash() {
      const tabs = await openTabs()
      act(() => tabs.b.result.current.renameScene('seed-1', 'Mine (B)'))
      act(() => tabs.a.result.current.renameScene('seed-1', 'Theirs (A)'))
      await act(() => tabs.a.result.current.flush())
      await waitFor(() => expect(tabs.b.result.current.conflicts).toEqual(['seed-1']))
      return tabs
    }

    it('keeps the unsaved edit and holds it back from autosave', async () => {
      const { b } = await clash()

      expect(titleIn(b, 'seed-1')).toBe('Mine (B)')
      await wait(AUTOSAVE_DELAY_MS + 100)
      expect((await getScene('seed-1'))?.title).toBe('Theirs (A)')
    })

    it('Reload takes the other tab’s version', async () => {
      const { b } = await clash()

      await act(() => b.result.current.resolveConflict('seed-1', 'theirs'))

      expect(titleIn(b, 'seed-1')).toBe('Theirs (A)')
      expect(b.result.current.conflicts).toEqual([])
      await wait(AUTOSAVE_DELAY_MS + 100)
      expect((await getScene('seed-1'))?.title).toBe('Theirs (A)')
    })

    it('Keep mine writes this tab’s version, and the other tab follows', async () => {
      const { a, b } = await clash()

      await act(() => b.result.current.resolveConflict('seed-1', 'mine'))

      expect(b.result.current.conflicts).toEqual([])
      expect((await getScene('seed-1'))?.title).toBe('Mine (B)')
      await waitFor(() => expect(titleIn(a, 'seed-1')).toBe('Mine (B)'))
    })
  })

  it('works on its own where BroadcastChannel does not exist', async () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    const { result } = renderHook(() => useScenes())
    await waitFor(() => expect(result.current.status).toBe('ready'))

    act(() => result.current.renameScene('seed-1', 'Solo'))
    await act(() => result.current.flush())

    expect((await getScene('seed-1'))?.title).toBe('Solo')
  })
})
