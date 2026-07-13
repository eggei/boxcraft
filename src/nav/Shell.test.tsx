import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { openSceneStore, type SceneStore } from '../persistence/scene-store'
import { SceneStoreProvider } from '../persistence/SceneStoreContext'
import { SceneListProvider } from '../scenes/SceneListContext'
import { SceneActionsProvider } from '../scenes/SceneActionsContext'
import { NavProvider } from './NavContext'
import { Shell } from './Shell'

let n = 0
const freshDb = () => `boxcraft-shell-${n++}`

async function setup(store: SceneStore, initialScenes: { id: string; title: string }[]) {
  render(
    <SceneStoreProvider store={store}>
      <SceneListProvider initialScenes={initialScenes}>
        <SceneActionsProvider>
          <NavProvider>
            <Shell />
          </NavProvider>
        </SceneActionsProvider>
      </SceneListProvider>
    </SceneStoreProvider>,
  )
  return userEvent.setup()
}

function wheel(deltaY: number, ctrlKey = true) {
  fireEvent.wheel(window, { deltaY, ctrlKey })
}

describe('Shell', () => {
  it('starts in L2, the snap-feed', async () => {
    const store = await openSceneStore(freshDb())
    await store.put({ id: 'a', title: 'Scene 1', source: '<p>a</p>', order: 0 })
    await setup(store, [{ id: 'a', title: 'Scene 1' }])

    expect(await screen.findByText('Start Editing (⌘+Enter)')).toBeInTheDocument()
  })

  it('⌘+scroll-up zooms out to L1', async () => {
    const store = await openSceneStore(freshDb())
    await store.put({ id: 'a', title: 'Scene 1', source: '<p>a</p>', order: 0 })
    await setup(store, [{ id: 'a', title: 'Scene 1' }])
    await screen.findByText('Start Editing (⌘+Enter)')

    wheel(-100)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Scene 1' })).toBeInTheDocument())
  })

  it('clicking a scene in L1 zooms into L2 centered on it', async () => {
    const store = await openSceneStore(freshDb())
    await store.put({ id: 'a', title: 'Scene 1', source: '<p>a</p>', order: 0 })
    const user = await setup(store, [{ id: 'a', title: 'Scene 1' }])
    await screen.findByText('Start Editing (⌘+Enter)')
    wheel(-100)
    await screen.findByRole('button', { name: 'Open Scene 1' })

    await user.click(screen.getByRole('button', { name: 'Open Scene 1' }))

    expect(await screen.findByText('Start Editing (⌘+Enter)')).toBeInTheDocument()
  })

  it('plain scroll in L2 never changes level', async () => {
    const store = await openSceneStore(freshDb())
    await store.put({ id: 'a', title: 'Scene 1', source: '<p>a</p>', order: 0 })
    await setup(store, [{ id: 'a', title: 'Scene 1' }])
    await screen.findByText('Start Editing (⌘+Enter)')

    wheel(-100, false)

    expect(screen.getByText('Start Editing (⌘+Enter)')).toBeInTheDocument()
  })

  it('⌘+scroll-down from L2 enters L3 editing', async () => {
    const store = await openSceneStore(freshDb())
    await store.put({ id: 'a', title: 'Scene 1', source: '<div class="canvas"></div>', order: 0 })
    await setup(store, [{ id: 'a', title: 'Scene 1' }])
    await screen.findByText('Start Editing (⌘+Enter)')

    wheel(100)

    expect(await screen.findByTitle('scene')).toBeInTheDocument()
  })
})
