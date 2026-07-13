import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { openSceneStore } from './scene-store'
import { SceneStoreProvider } from './SceneStoreContext'
import { useSceneSnapshot } from './use-scene-snapshot'

let n = 0
const freshDb = () => `boxcraft-snapshot-${n++}`

function Probe({ id }: { id: string }) {
  const snapshot = useSceneSnapshot(id)
  return <span data-testid="snapshot">{snapshot ?? 'none'}</span>
}

describe('useSceneSnapshot', () => {
  it('loads a scene snapshot by id from the store', async () => {
    const store = await openSceneStore(freshDb())
    await store.put({ id: 'a', title: 'A', source: '<p>hi</p>', snapshot: 'data:image/png;base64,abc' })

    render(
      <SceneStoreProvider store={store}>
        <Probe id="a" />
      </SceneStoreProvider>,
    )

    expect(await screen.findByText('data:image/png;base64,abc')).toBeInTheDocument()
  })

  it('reports undefined when the scene has no cached snapshot yet', async () => {
    const store = await openSceneStore(freshDb())
    await store.put({ id: 'a', title: 'A', source: '<p>hi</p>' })

    render(
      <SceneStoreProvider store={store}>
        <Probe id="a" />
      </SceneStoreProvider>,
    )

    expect(await screen.findByText('none')).toBeInTheDocument()
  })
})
