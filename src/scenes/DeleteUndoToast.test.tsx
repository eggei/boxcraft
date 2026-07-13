import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { openSceneStore } from '../persistence/scene-store'
import { SceneStoreProvider } from '../persistence/SceneStoreContext'
import { SceneListProvider, useSceneList } from './SceneListContext'
import { SceneActionsProvider, useSceneActions } from './SceneActionsContext'
import { DeleteUndoToast } from './DeleteUndoToast'

let n = 0
const freshDb = () => `boxcraft-toast-${n++}`

function DeleteButton() {
  const actions = useSceneActions()
  return <button onClick={() => actions.softDeleteScene('a')}>delete</button>
}

function Titles() {
  const { scenes } = useSceneList()
  return <span data-testid="titles">{scenes.map((s) => s.title).join(',')}</span>
}

describe('DeleteUndoToast', () => {
  it('appears after a soft-delete and restores the scene on Undo', async () => {
    const store = await openSceneStore(freshDb())
    await store.put({ id: 'a', title: 'Scene 1', source: '<p>a</p>', order: 0 })
    const user = userEvent.setup()
    render(
      <SceneStoreProvider store={store}>
        <SceneListProvider initialScenes={[{ id: 'a', title: 'Scene 1' }]}>
          <SceneActionsProvider>
            <Titles />
            <DeleteButton />
            <DeleteUndoToast />
          </SceneActionsProvider>
        </SceneListProvider>
      </SceneStoreProvider>,
    )

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await user.click(screen.getByText('delete'))

    expect(await screen.findByText('Deleted "Scene 1"')).toBeInTheDocument()

    await user.click(screen.getByText('Undo'))

    await waitFor(() => expect(screen.getByTestId('titles')).toHaveTextContent('Scene 1'))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
