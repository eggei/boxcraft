import { describe, expect, it } from 'vitest'
import {
  createScene,
  seedScenes,
  addScene,
  duplicateScene,
  activeScenes,
  archivedScenes,
  archiveScene,
  unarchiveScene,
  reorderScenes,
  renameScene,
  DEFAULT_SOURCE,
} from './sceneList'

describe('createScene', () => {
  it('produces a scene with the given id/order, a default title and the blank source', () => {
    const scene = createScene({ id: 'scene-x', order: 3 })

    expect(scene).toEqual({
      id: 'scene-x',
      title: 'Untitled',
      source: DEFAULT_SOURCE,
      order: 3,
      archivedAt: null,
    })
  })

  it('accepts an explicit title and source', () => {
    const scene = createScene({
      id: 'scene-y',
      order: 0,
      title: 'Glow',
      source: '<html>glow</html>',
    })

    expect(scene.title).toBe('Glow')
    expect(scene.source).toBe('<html>glow</html>')
  })
})

describe('seedScenes', () => {
  it('returns several example scenes, ordered contiguously from 0 and none archived', () => {
    const seeds = seedScenes()

    expect(seeds.length).toBeGreaterThanOrEqual(3)
    expect(seeds.map((s) => s.order)).toEqual(seeds.map((_, i) => i))
    expect(seeds.every((s) => s.archivedAt === null)).toBe(true)
    expect(new Set(seeds.map((s) => s.id)).size).toBe(seeds.length)
  })

  it('gives each example a distinct human title and a real HTML document as source', () => {
    const seeds = seedScenes()

    expect(new Set(seeds.map((s) => s.title)).size).toBe(seeds.length)
    expect(seeds.every((s) => s.source.includes('<html'))).toBe(true)
    expect(seeds.every((s) => s.source.includes('class="canvas"'))).toBe(true)
  })
})

describe('addScene', () => {
  it('appends a new blank active scene ordered after the last active one', () => {
    const base = seedScenes() // orders 0,1,2
    const { scenes, scene } = addScene(base, { id: 'new-1' })

    expect(scene.id).toBe('new-1')
    expect(scene.source).toBe(DEFAULT_SOURCE)
    expect(scene.archivedAt).toBeNull()
    expect(scene.order).toBe(3)
    expect(scenes).toHaveLength(base.length + 1)
    expect(activeScenes(scenes).at(-1)?.id).toBe('new-1')
  })

  it('ignores archived scenes when computing the next order', () => {
    const scenes = [
      createScene({ id: 'a', order: 0 }),
      { ...createScene({ id: 'b', order: 1 }), archivedAt: 5 },
    ]
    const { scene } = addScene(scenes, { id: 'c' })
    expect(scene.order).toBe(1)
  })
})

describe('duplicateScene', () => {
  it('copies the source, titles it "<title> copy", and drops the copy right after the original', () => {
    const base = seedScenes() // seed-1, seed-2, seed-3
    const { scenes, scene } = duplicateScene(base, 'seed-1', 'dup-1')

    expect(scene).not.toBeNull()
    expect(scene?.id).toBe('dup-1')
    expect(scene?.title).toBe('Glow button copy')
    expect(scene?.source).toBe(base[0].source)
    expect(scene?.archivedAt).toBeNull()

    // order among active scenes: original, then the copy, then the rest
    expect(activeScenes(scenes).map((s) => s.id)).toEqual([
      'seed-1',
      'dup-1',
      'seed-2',
      'seed-3',
    ])
    // orders stay contiguous from 0
    expect(activeScenes(scenes).map((s) => s.order)).toEqual([0, 1, 2, 3])
  })

  it('returns the scenes unchanged when the id is unknown', () => {
    const base = seedScenes()
    const { scenes, scene } = duplicateScene(base, 'nope', 'dup-x')
    expect(scene).toBeNull()
    expect(scenes).toEqual(base)
  })
})

describe('archiveScene / unarchiveScene', () => {
  it('stamps archivedAt and closes the gap left in the active order', () => {
    const scenes = archiveScene(seedScenes(), 'seed-1', 1234)

    const archived = scenes.find((s) => s.id === 'seed-1')
    expect(archived?.archivedAt).toBe(1234)

    // remaining active scenes reflow to contiguous 0..n
    expect(activeScenes(scenes).map((s) => s.id)).toEqual(['seed-2', 'seed-3'])
    expect(activeScenes(scenes).map((s) => s.order)).toEqual([0, 1])
  })

  it('unarchive clears archivedAt and re-appends the scene to the active order', () => {
    const archived = archiveScene(seedScenes(), 'seed-1', 1234)
    const restored = unarchiveScene(archived, 'seed-1')

    const scene = restored.find((s) => s.id === 'seed-1')
    expect(scene?.archivedAt).toBeNull()
    expect(activeScenes(restored).at(-1)?.id).toBe('seed-1')
    expect(activeScenes(restored).map((s) => s.order)).toEqual([0, 1, 2])
  })

  it('archivedScenes lists archived scenes, most-recently-archived first', () => {
    let scenes = archiveScene(seedScenes(), 'seed-1', 100)
    scenes = archiveScene(scenes, 'seed-3', 200)

    expect(archivedScenes(scenes).map((s) => s.id)).toEqual(['seed-3', 'seed-1'])
  })
})

describe('reorderScenes', () => {
  it('assigns order from the given active id sequence, leaving archived scenes alone', () => {
    const scenes = reorderScenes(seedScenes(), ['seed-3', 'seed-1', 'seed-2'])

    expect(activeScenes(scenes).map((s) => s.id)).toEqual([
      'seed-3',
      'seed-1',
      'seed-2',
    ])
    expect(activeScenes(scenes).map((s) => s.order)).toEqual([0, 1, 2])
  })
})

describe('renameScene', () => {
  it('sets the title of the matching scene only', () => {
    const scenes = renameScene(seedScenes(), 'seed-2', 'Renamed')
    expect(scenes.find((s) => s.id === 'seed-2')?.title).toBe('Renamed')
    expect(scenes.find((s) => s.id === 'seed-1')?.title).toBe('Glow button')
  })
})
