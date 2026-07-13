import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { openSceneStore } from './scene-store'
import { SceneStoreProvider } from './SceneStoreContext'
import { useSceneSource } from './use-scene-source'

let n = 0
const freshDb = () => `boxcraft-source-${n++}`

function Probe({ id }: { id: string }) {
  const source = useSceneSource(id)
  return <span data-testid="source">{source ?? 'loading'}</span>
}

describe('useSceneSource', () => {
  it('loads a scene source by id from the store', async () => {
    const store = await openSceneStore(freshDb())
    await store.put({ id: 'a', title: 'A', source: '<p>hello</p>' })

    render(
      <SceneStoreProvider store={store}>
        <Probe id="a" />
      </SceneStoreProvider>,
    )

    expect(await screen.findByText('<p>hello</p>')).toBeInTheDocument()
  })
})
