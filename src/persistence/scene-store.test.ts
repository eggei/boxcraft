import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { openSceneStore } from './scene-store'

// Unique db name per test so cases don't share state.
let dbCounter = 0
function freshDb() {
  return `boxcraft-test-${dbCounter++}`
}

describe('SceneStore', () => {
  it('round-trips a scene: put then get returns it', async () => {
    const store = await openSceneStore(freshDb())
    const scene = { id: 's1', title: 'Scene 1', source: '<h1>hi</h1>' }

    await store.put(scene)

    expect(await store.get('s1')).toEqual(scene)
  })

  it('returns undefined for an unknown id', async () => {
    const store = await openSceneStore(freshDb())
    expect(await store.get('nope')).toBeUndefined()
  })

  it('getAll returns every stored scene', async () => {
    const store = await openSceneStore(freshDb())
    const a = { id: 'a', title: 'A', source: '<i>a</i>' }
    const b = { id: 'b', title: 'B', source: '<i>b</i>' }
    await store.put(a)
    await store.put(b)

    const all = await store.getAll()

    expect(all).toHaveLength(2)
    expect(all).toContainEqual(a)
    expect(all).toContainEqual(b)
  })

  it('delete removes a scene', async () => {
    const store = await openSceneStore(freshDb())
    await store.put({ id: 'x', title: 'X', source: '' })

    await store.delete('x')

    expect(await store.get('x')).toBeUndefined()
    expect(await store.getAll()).toHaveLength(0)
  })

  it('put overwrites an existing scene (same id)', async () => {
    const store = await openSceneStore(freshDb())
    await store.put({ id: 'x', title: 'Old', source: '<p>old</p>' })

    await store.put({ id: 'x', title: 'New', source: '<p>new</p>' })

    expect(await store.get('x')).toEqual({ id: 'x', title: 'New', source: '<p>new</p>' })
    expect(await store.getAll()).toHaveLength(1)
  })

  it('persists scenes across a reopen of the same database', async () => {
    const name = freshDb()
    const first = await openSceneStore(name)
    await first.put({ id: 'keep', title: 'Kept', source: '<main>x</main>' })

    const reopened = await openSceneStore(name)

    expect(await reopened.get('keep')).toEqual({
      id: 'keep',
      title: 'Kept',
      source: '<main>x</main>',
    })
  })
})
