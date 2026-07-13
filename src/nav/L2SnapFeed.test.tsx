import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { openSceneStore, type SceneStore } from '../persistence/scene-store'
import { SceneStoreProvider } from '../persistence/SceneStoreContext'
import { SceneListProvider } from '../scenes/SceneListContext'
import { NavProvider, useNav } from './NavContext'
import { L2SnapFeed } from './L2SnapFeed'

let n = 0
const freshDb = () => `boxcraft-l2-${n++}`

function CurrentId() {
  const { state } = useNav()
  return <span data-testid="current">{state.currentId ?? 'none'}</span>
}

async function setup(
  store: SceneStore,
  initialScenes: { id: string; title: string }[],
  onStartEditing = (_id: string) => {},
) {
  render(
    <SceneStoreProvider store={store}>
      <SceneListProvider initialScenes={initialScenes}>
        <NavProvider>
          <CurrentId />
          <L2SnapFeed onStartEditing={onStartEditing} />
        </NavProvider>
      </SceneListProvider>
    </SceneStoreProvider>,
  )
  return userEvent.setup()
}

describe('L2SnapFeed', () => {
  it('defaults the current scene to the first in the list', async () => {
    const store = await openSceneStore(freshDb())
    await store.put({ id: 'a', title: 'Scene 1', source: '<p>a</p>', order: 0 })
    await store.put({ id: 'b', title: 'Scene 2', source: '<p>b</p>', order: 1 })
    await setup(store, [
      { id: 'a', title: 'Scene 1' },
      { id: 'b', title: 'Scene 2' },
    ])

    await waitFor(() => expect(screen.getByTestId('current')).toHaveTextContent('a'))
  })

  it('mounting already centered on a scene (e.g. from an L1 click) scrolls that item into view, not the top of the list', async () => {
    const store = await openSceneStore(freshDb())
    await store.put({ id: 'a', title: 'Scene 1', source: '<p>a</p>', order: 0 })
    await store.put({ id: 'b', title: 'Scene 2', source: '<p>b</p>', order: 1 })
    await store.put({ id: 'c', title: 'Scene 3', source: '<p>c</p>', order: 2 })
    const calls: string[] = []
    const original = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
      calls.push(this.dataset.sceneId ?? '')
    }
    try {
      render(
        <SceneStoreProvider store={store}>
          <SceneListProvider
            initialScenes={[
              { id: 'a', title: 'Scene 1' },
              { id: 'b', title: 'Scene 2' },
              { id: 'c', title: 'Scene 3' },
            ]}
          >
            <NavProvider initialState={{ level: 'L2', currentId: 'c' }}>
              <L2SnapFeed onStartEditing={() => {}} />
            </NavProvider>
          </SceneListProvider>
        </SceneStoreProvider>,
      )
      await waitFor(() => expect(calls).toContain('c'))
    } finally {
      HTMLElement.prototype.scrollIntoView = original
    }
  })

  it('renders a live iframe for the current scene, a static preview for scenes outside the window', async () => {
    const store = await openSceneStore(freshDb())
    await store.put({ id: 'a', title: 'Scene 1', source: '<p>a</p>', order: 0 })
    await store.put({ id: 'b', title: 'Scene 2', source: '<p>b</p>', order: 1 })
    await store.put({ id: 'c', title: 'Scene 3', source: '<p>c</p>', order: 2 })
    await setup(store, [
      { id: 'a', title: 'Scene 1' },
      { id: 'b', title: 'Scene 2' },
      { id: 'c', title: 'Scene 3' },
    ])

    // a (current) and b (± 1 neighbor) are live; c is a sandboxed static preview.
    await waitFor(() => expect(screen.getAllByTitle('scene')).toHaveLength(2))
    await waitFor(() => expect(screen.getByTitle('Scene 3 preview')).toBeInTheDocument())
  })

  it('Start Editing calls back with the current scene id', async () => {
    const store = await openSceneStore(freshDb())
    await store.put({ id: 'a', title: 'Scene 1', source: '<p>a</p>', order: 0 })
    let started: string | undefined
    const user = await setup(store, [{ id: 'a', title: 'Scene 1' }], (id) => (started = id))

    await user.click(await screen.findByText('Start Editing (⌘+Enter)'))

    expect(started).toBe('a')
  })

  it('⌘/Ctrl+Enter also starts editing the current scene', async () => {
    const store = await openSceneStore(freshDb())
    await store.put({ id: 'a', title: 'Scene 1', source: '<p>a</p>', order: 0 })
    let started: string | undefined
    await setup(store, [{ id: 'a', title: 'Scene 1' }], (id) => (started = id))
    await waitFor(() => screen.getByText('Start Editing (⌘+Enter)'))

    fireEvent.keyDown(window, { key: 'Enter', metaKey: true })

    expect(started).toBe('a')
  })

  it('plain Enter does not start editing', async () => {
    const store = await openSceneStore(freshDb())
    await store.put({ id: 'a', title: 'Scene 1', source: '<p>a</p>', order: 0 })
    let started: string | undefined
    await setup(store, [{ id: 'a', title: 'Scene 1' }], (id) => (started = id))
    await waitFor(() => screen.getByText('Start Editing (⌘+Enter)'))

    fireEvent.keyDown(window, { key: 'Enter' })

    expect(started).toBeUndefined()
  })
})
