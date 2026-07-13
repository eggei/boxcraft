import 'fake-indexeddb/auto'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { openSceneStore, type SceneStore } from '../persistence/scene-store'
import { SceneStoreProvider } from '../persistence/SceneStoreContext'
import { SceneListProvider, useSceneList } from './SceneListContext'
import { SceneActionsProvider, useSceneActions } from './SceneActionsContext'

let n = 0
const freshDb = () => `boxcraft-actions-${n++}`

function Probe() {
  const { scenes } = useSceneList()
  const actions = useSceneActions()
  return (
    <div>
      <span data-testid="titles">{scenes.map((s) => s.title).join(',')}</span>
      <span data-testid="ids">{scenes.map((s) => s.id).join(',')}</span>
      <span data-testid="pending">{actions.pendingDelete?.scene.title ?? 'none'}</span>
      <button onClick={() => actions.addScene()}>add</button>
      <button onClick={() => actions.duplicateScene('a')}>duplicate a</button>
      <button onClick={() => actions.softDeleteScene('a')}>delete a</button>
      <button onClick={() => actions.undoDelete()}>undo</button>
      <button onClick={() => actions.renameScene('a', 'Hero')}>rename a</button>
      <button onClick={() => actions.reorder(['b', 'a'])}>reorder</button>
    </div>
  )
}

async function renderWithProviders(store: SceneStore, initialScenes: { id: string; title: string }[]) {
  const user = userEvent.setup()
  render(
    <SceneStoreProvider store={store}>
      <SceneListProvider initialScenes={initialScenes}>
        <SceneActionsProvider>
          <Probe />
        </SceneActionsProvider>
      </SceneListProvider>
    </SceneStoreProvider>,
  )
  return user
}

describe('SceneActionsProvider', () => {
  it('addScene creates and persists a new scene, appended to the list', async () => {
    const store = await openSceneStore(freshDb())
    await store.put({ id: 'a', title: 'Scene 1', source: '<p>a</p>', order: 0 })
    const user = await renderWithProviders(store, [{ id: 'a', title: 'Scene 1' }])

    await user.click(screen.getByText('add'))

    await waitFor(() => expect(screen.getByTestId('titles')).toHaveTextContent('Scene 1,Scene 2'))
    const all = await store.getAll()
    expect(all).toHaveLength(2)
  })

  it('duplicateScene forks the source under a new id, inserted after the original', async () => {
    const store = await openSceneStore(freshDb())
    await store.put({ id: 'a', title: 'Scene 1', source: '<p>a</p>', order: 0 })
    await store.put({ id: 'c', title: 'Scene 2', source: '<p>c</p>', order: 1 })
    const user = await renderWithProviders(store, [
      { id: 'a', title: 'Scene 1' },
      { id: 'c', title: 'Scene 2' },
    ])

    await user.click(screen.getByText('duplicate a'))

    await waitFor(() => expect(screen.getByTestId('titles')).toHaveTextContent('Scene 1,Scene 1 copy,Scene 2'))
    const ids = screen.getByTestId('ids').textContent!.split(',')
    expect(ids[0]).toBe('a')
    expect(ids[2]).toBe('c')
    const fork = await store.get(ids[1])
    expect(fork?.source).toBe('<p>a</p>')
  })

  it('softDeleteScene removes the scene immediately and undoDelete restores it at its original index', async () => {
    const store = await openSceneStore(freshDb())
    await store.put({ id: 'a', title: 'Scene 1', source: '<p>a</p>', order: 0 })
    await store.put({ id: 'b', title: 'Scene 2', source: '<p>b</p>', order: 1 })
    const user = await renderWithProviders(store, [
      { id: 'a', title: 'Scene 1' },
      { id: 'b', title: 'Scene 2' },
    ])

    await user.click(screen.getByText('delete a'))
    await waitFor(() => expect(screen.getByTestId('titles')).toHaveTextContent('Scene 2'))
    expect(screen.getByTestId('pending')).toHaveTextContent('Scene 1')

    await user.click(screen.getByText('undo'))

    expect(screen.getByTestId('titles')).toHaveTextContent('Scene 1,Scene 2')
    expect(screen.getByTestId('pending')).toHaveTextContent('none')
    expect(await store.get('a')).toBeDefined()
  })

  it('a soft-deleted scene is actually removed from the store once the undo window elapses', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const store = await openSceneStore(freshDb())
      await store.put({ id: 'a', title: 'Scene 1', source: '<p>a</p>', order: 0 })
      const user = await renderWithProviders(store, [{ id: 'a', title: 'Scene 1' }])

      await user.click(screen.getByText('delete a'))
      await vi.advanceTimersByTimeAsync(5000)

      expect(await store.get('a')).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('renameScene updates the list and persists the title', async () => {
    const store = await openSceneStore(freshDb())
    await store.put({ id: 'a', title: 'Scene 1', source: '<p>a</p>', order: 0 })
    const user = await renderWithProviders(store, [{ id: 'a', title: 'Scene 1' }])

    await user.click(screen.getByText('rename a'))

    await waitFor(() => expect(screen.getByTestId('titles')).toHaveTextContent('Hero'))
    await waitFor(async () => expect((await store.get('a'))?.title).toBe('Hero'))
  })

  it('reorder updates the list and persists the new order', async () => {
    const store = await openSceneStore(freshDb())
    await store.put({ id: 'a', title: 'Scene 1', source: '<p>a</p>', order: 0 })
    await store.put({ id: 'b', title: 'Scene 2', source: '<p>b</p>', order: 1 })
    const user = await renderWithProviders(store, [
      { id: 'a', title: 'Scene 1' },
      { id: 'b', title: 'Scene 2' },
    ])

    await user.click(screen.getByText('reorder'))

    await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('b,a'))
    await waitFor(async () => expect((await store.get('b'))?.order).toBe(0))
    expect((await store.get('a'))?.order).toBe(1)
  })
})
