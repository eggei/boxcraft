import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { openSceneStore, type SceneStore } from '../persistence/scene-store'
import { SceneStoreProvider } from '../persistence/SceneStoreContext'
import { SceneListProvider, useSceneList } from '../scenes/SceneListContext'
import { SceneActionsProvider } from '../scenes/SceneActionsContext'
import { L1FilesGrid } from './L1FilesGrid'

let n = 0
const freshDb = () => `boxcraft-l1-${n++}`

function Ids() {
  const { scenes } = useSceneList()
  return <span data-testid="ids">{scenes.map((s) => s.id).join(',')}</span>
}

async function setup(store: SceneStore, initialScenes: { id: string; title: string }[], onOpen = (_id: string) => {}) {
  render(
    <SceneStoreProvider store={store}>
      <SceneListProvider initialScenes={initialScenes}>
        <SceneActionsProvider>
          <Ids />
          <L1FilesGrid onOpen={onOpen} />
        </SceneActionsProvider>
      </SceneListProvider>
    </SceneStoreProvider>,
  )
  return userEvent.setup()
}

describe('L1FilesGrid', () => {
  it('clicking a card opens that scene', async () => {
    const store = await openSceneStore(freshDb())
    await store.put({ id: 'a', title: 'Scene 1', source: '<p>a</p>', order: 0 })
    let opened: string | undefined
    const user = await setup(store, [{ id: 'a', title: 'Scene 1' }], (id) => (opened = id))

    await user.click(screen.getByRole('button', { name: 'Open Scene 1' }))

    expect(opened).toBe('a')
  })

  it('drag-and-drop reorders the grid, driving the persisted order', async () => {
    const store = await openSceneStore(freshDb())
    await store.put({ id: 'a', title: 'Scene 1', source: '<p>a</p>', order: 0 })
    await store.put({ id: 'b', title: 'Scene 2', source: '<p>b</p>', order: 1 })
    await setup(store, [
      { id: 'a', title: 'Scene 1' },
      { id: 'b', title: 'Scene 2' },
    ])

    const cardA = screen.getByRole('button', { name: 'Open Scene 1' }).closest('[draggable]')!
    const cardB = screen.getByRole('button', { name: 'Open Scene 2' }).closest('[draggable]')!

    fireEvent.dragStart(cardB)
    fireEvent.dragOver(cardA)
    fireEvent.drop(cardA)

    await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('b,a'))
  })

  it('double-clicking the title renames the scene', async () => {
    const store = await openSceneStore(freshDb())
    await store.put({ id: 'a', title: 'Scene 1', source: '<p>a</p>', order: 0 })
    const user = await setup(store, [{ id: 'a', title: 'Scene 1' }])

    await user.dblClick(screen.getByText('Scene 1'))
    const input = screen.getByDisplayValue('Scene 1')
    await user.clear(input)
    await user.type(input, 'Hero{Enter}')

    await waitFor(() => expect(screen.getByText('Hero')).toBeInTheDocument())
    await waitFor(async () => expect((await store.get('a'))?.title).toBe('Hero'))
  })

  it('duplicate and delete buttons act on the right scene', async () => {
    const store = await openSceneStore(freshDb())
    await store.put({ id: 'a', title: 'Scene 1', source: '<p>a</p>', order: 0 })
    const user = await setup(store, [{ id: 'a', title: 'Scene 1' }])

    await user.click(screen.getByRole('button', { name: 'Duplicate Scene 1' }))
    await waitFor(() => expect(screen.getByText('Scene 1 copy')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Delete Scene 1' }))
    await waitFor(() => expect(screen.queryByText('Scene 1')).not.toBeInTheDocument())
    expect(screen.getByText('Scene 1 copy')).toBeInTheDocument()
  })
})
