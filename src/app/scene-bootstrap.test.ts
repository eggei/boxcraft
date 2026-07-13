import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { openSceneStore } from '../persistence/scene-store'
import { loadOrCreateDefaultScene, loadOrCreateSceneList, DEFAULT_SCENE_ID, SEED_SOURCE } from './scene-bootstrap'
import { insertBox } from '../box/insert-box'

let n = 0
const freshDb = () => `boxcraft-bootstrap-${n++}`

describe('loadOrCreateSceneList', () => {
  it('seeds a single starter scene, ordered first, when the store is empty', async () => {
    const store = await openSceneStore(freshDb())

    const scenes = await loadOrCreateSceneList(store)

    expect(scenes).toHaveLength(1)
    expect(scenes[0].title).toBe('Scene 1')
    expect(scenes[0].order).toBe(0)
    expect(await store.get(scenes[0].id)).toEqual(scenes[0])
  })

  it('returns existing scenes sorted by order, never reseeding', async () => {
    const store = await openSceneStore(freshDb())
    await store.put({ id: 'b', title: 'Scene 2', source: '<p>b</p>', order: 1 })
    await store.put({ id: 'a', title: 'Scene 1', source: '<p>a</p>', order: 0 })

    const scenes = await loadOrCreateSceneList(store)

    expect(scenes.map((s) => s.id)).toEqual(['a', 'b'])
  })
})

describe('loadOrCreateDefaultScene', () => {
  it('seeds and persists a default scene when the store is empty', async () => {
    const store = await openSceneStore(freshDb())

    const scene = await loadOrCreateDefaultScene(store)

    expect(scene.id).toBe(DEFAULT_SCENE_ID)
    expect(scene.source).toContain('<')
    // It was written through, not just returned.
    expect(await store.get(DEFAULT_SCENE_ID)).toEqual(scene)
  })

  it('returns the existing scene instead of reseeding', async () => {
    const store = await openSceneStore(freshDb())
    await store.put({ id: DEFAULT_SCENE_ID, title: 'Mine', source: '<p>edited</p>' })

    const scene = await loadOrCreateDefaultScene(store)

    expect(scene).toEqual({ id: DEFAULT_SCENE_ID, title: 'Mine', source: '<p>edited</p>' })
  })
})

describe('SEED_SOURCE', () => {
  it('is born with a 400×400, position:relative .canvas element and rule', () => {
    // The canvas div lives in the body...
    expect(SEED_SOURCE).toContain('<div class="canvas">')
    // ...backed by a rule that makes it a 400×400 positioned stage (DESIGN.md §1).
    const rule = SEED_SOURCE.slice(
      SEED_SOURCE.indexOf('.canvas'),
      SEED_SOURCE.indexOf('}', SEED_SOURCE.indexOf('.canvas')),
    )
    expect(rule).toContain('position: relative')
    expect(rule).toContain('width: 400px')
    expect(rule).toContain('height: 400px')
  })

  it('is a valid drop target for the Box tool out of the box', () => {
    // Proves the seed and the Box tool agree on structure: inserting a box
    // yields a box-1 div in the canvas and a matching rule, no errors.
    const { source } = insertBox(SEED_SOURCE, { x: 10, y: 10, width: 50, height: 50 })
    expect(source).toContain('<div class="box-1">')
    expect(source).toContain('.box-1 {')
  })
})
