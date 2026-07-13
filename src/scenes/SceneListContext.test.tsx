import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SceneListProvider, useSceneList } from './SceneListContext'

function Probe() {
  const { scenes, dispatch } = useSceneList()
  return (
    <div>
      <span data-testid="titles">{scenes.map((s) => s.title).join(',')}</span>
      <button onClick={() => dispatch({ type: 'RENAME', id: 'a', title: 'Hero' })}>rename</button>
    </div>
  )
}

describe('SceneListProvider', () => {
  it('provides the initial list and updates on dispatch', async () => {
    const user = userEvent.setup()
    render(
      <SceneListProvider initialScenes={[{ id: 'a', title: 'Scene 1' }]}>
        <Probe />
      </SceneListProvider>,
    )

    expect(screen.getByTestId('titles')).toHaveTextContent('Scene 1')

    await user.click(screen.getByText('rename'))

    expect(screen.getByTestId('titles')).toHaveTextContent('Hero')
  })
})
