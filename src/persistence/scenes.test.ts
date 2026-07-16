import { describe, expect, it } from 'vitest'
import { getAllScenes, getScene, saveScene } from './scenes'

describe('scene persistence', () => {
  it('returns a saved scene unchanged, with byte-identical source', async () => {
    const scene = {
      id: 'scene-1',
      title: 'Glow button',
      source: '<!doctype html>\n<html>\n  <body>\n    <div class="canvas"></div>\n  </body>\n</html>\n',
    }

    await saveScene(scene)
    const loaded = await getScene('scene-1')

    expect(loaded).toEqual(scene)
  })

  it('returns every saved scene', async () => {
    await saveScene({ id: 'a', title: 'A', source: '<html>a</html>' })
    await saveScene({ id: 'b', title: 'B', source: '<html>b</html>' })

    const all = await getAllScenes()

    expect(all).toHaveLength(2)
    expect(all.map((s) => s.id).sort()).toEqual(['a', 'b'])
  })

  it('overwrites in place when the same scene is saved again (autosave)', async () => {
    await saveScene({ id: 'scene-1', title: 'Draft', source: '<html>v1</html>' })
    await saveScene({ id: 'scene-1', title: 'Draft', source: '<html>v2</html>' })

    const all = await getAllScenes()
    const loaded = await getScene('scene-1')

    expect(all).toHaveLength(1)
    expect(loaded?.source).toBe('<html>v2</html>')
  })

  it('returns undefined for an unknown scene id', async () => {
    expect(await getScene('nope')).toBeUndefined()
  })
})
