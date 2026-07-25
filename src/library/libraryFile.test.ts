import { describe, expect, it } from 'vitest'
import {
  buildLibrary,
  importScenes,
  libraryFilename,
  LIBRARY_FORMAT,
  LIBRARY_VERSION,
  parseLibrary,
  serializeLibrary,
} from './libraryFile'
import { type Scene } from '@/scenes/sceneList'

function scene(over: Partial<Scene> & { id: string }): Scene {
  return {
    title: `Scene ${over.id}`,
    source: `<html>${over.id}</html>`,
    order: 0,
    archivedAt: null,
    ...over,
  }
}

/** Ids the fake generator hands out, in order. */
function idGen(): () => string {
  let n = 0
  return () => `new-${++n}`
}

describe('buildLibrary', () => {
  it('stamps the format, version and export time', () => {
    const library = buildLibrary([scene({ id: 'a' })], 1_700_000_000_000)

    expect(library.format).toBe(LIBRARY_FORMAT)
    expect(library.version).toBe(LIBRARY_VERSION)
    expect(library.exportedAt).toBe(1_700_000_000_000)
  })

  it('includes archived scenes — a backup covers the whole library', () => {
    const library = buildLibrary(
      [scene({ id: 'a' }), scene({ id: 'b', archivedAt: 123 })],
      0,
    )

    expect(library.scenes.map((s) => s.id)).toEqual(['a', 'b'])
    expect(library.scenes[1].archivedAt).toBe(123)
  })

  it('carries only the scene fields, not extras on the in-memory object', () => {
    const library = buildLibrary(
      [{ ...scene({ id: 'a' }), transient: true } as Scene],
      0,
    )

    expect(Object.keys(library.scenes[0]).sort()).toEqual([
      'archivedAt',
      'id',
      'order',
      'source',
      'title',
    ])
  })
})

describe('libraryFilename', () => {
  it('names the file after the export day', () => {
    expect(libraryFilename(Date.UTC(2026, 6, 24, 9, 30))).toBe(
      'boxcraft-library-2026-07-24.json',
    )
  })
})

describe('export → import round trip', () => {
  it('returns byte-identical sources and the same scenes', () => {
    const scenes = [
      scene({ id: 'a', title: 'Glow', source: '<html>\n  <b>a</b>\n</html>\n' }),
      scene({ id: 'b', order: 1, archivedAt: 42 }),
    ]

    const result = parseLibrary(serializeLibrary(buildLibrary(scenes, 99)))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.library.scenes).toEqual(scenes)
    expect(result.library.exportedAt).toBe(99)
    expect(result.skipped).toBe(0)
  })
})

describe('parseLibrary', () => {
  it('rejects text that is not JSON', () => {
    const result = parseLibrary('not json {')

    expect(result).toEqual({ ok: false, error: "That file isn't valid JSON." })
  })

  it('rejects JSON that is not a BoxCraft library', () => {
    const result = parseLibrary('{"hello":"world"}')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain("doesn't look like a BoxCraft library")
  })

  it('rejects an array at the top level', () => {
    expect(parseLibrary('[]').ok).toBe(false)
  })

  it('refuses a format version it does not understand', () => {
    const result = parseLibrary(
      JSON.stringify({ format: LIBRARY_FORMAT, version: 99, scenes: [] }),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('newer BoxCraft')
  })

  it('rejects a library with no readable scenes', () => {
    const result = parseLibrary(
      JSON.stringify({ format: LIBRARY_FORMAT, version: 1, scenes: [] }),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('no readable scenes')
  })

  it('skips junk entries but keeps the readable ones', () => {
    const result = parseLibrary(
      JSON.stringify({
        format: LIBRARY_FORMAT,
        version: 1,
        scenes: [
          null,
          { id: '', source: '<html/>' },
          { id: 'missing-source' },
          { id: 'good', title: 'Good', source: '<html>good</html>' },
        ],
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.skipped).toBe(3)
    expect(result.library.scenes.map((s) => s.id)).toEqual(['good'])
  })

  it('fills in fields older or hand-edited files may be missing', () => {
    const result = parseLibrary(
      JSON.stringify({
        format: LIBRARY_FORMAT,
        scenes: [
          { id: 'a', source: '<html>a</html>' },
          { id: 'b', source: '<html>b</html>', order: 'x', archivedAt: 'x' },
        ],
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.library.scenes).toEqual([
      { id: 'a', title: 'Untitled', source: '<html>a</html>', order: 0, archivedAt: null },
      { id: 'b', title: 'Untitled', source: '<html>b</html>', order: 1, archivedAt: null },
    ])
    expect(result.library.exportedAt).toBe(0)
  })
})

describe('importScenes — replace', () => {
  it('drops the current library and keeps only the incoming scenes', () => {
    const current = [scene({ id: 'old-1' }), scene({ id: 'old-2', order: 1 })]
    const incoming = [scene({ id: 'in-1', order: 7 })]

    const next = importScenes(current, incoming, {
      mode: 'replace',
      newId: idGen(),
    })

    expect(next.map((s) => s.id)).toEqual(['in-1'])
    expect(next[0].order).toBe(0)
  })

  it('reflows orders and keeps archived scenes archived', () => {
    const incoming = [
      scene({ id: 'a', order: 5 }),
      scene({ id: 'z', order: 900, archivedAt: 10 }),
      scene({ id: 'b', order: 9 }),
    ]

    const next = importScenes([], incoming, { mode: 'replace', newId: idGen() })

    expect(next.map((s) => [s.id, s.order, s.archivedAt])).toEqual([
      ['a', 0, null],
      ['b', 1, null],
      ['z', 900, 10],
    ])
  })

  it('re-ids scenes that repeat an id inside the same file', () => {
    const incoming = [scene({ id: 'dup' }), scene({ id: 'dup', order: 1 })]

    const next = importScenes([], incoming, { mode: 'replace', newId: idGen() })

    expect(next.map((s) => s.id)).toEqual(['dup', 'new-1'])
  })
})

describe('importScenes — merge', () => {
  it('appends the incoming active scenes after the current ones', () => {
    const current = [scene({ id: 'a' }), scene({ id: 'b', order: 1 })]
    const incoming = [scene({ id: 'c', order: 0 }), scene({ id: 'd', order: 1 })]

    const next = importScenes(current, incoming, {
      mode: 'merge',
      newId: idGen(),
    })

    expect(next.map((s) => [s.id, s.order])).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
      ['d', 3],
    ])
  })

  it('never overwrites an existing scene: colliding ids get fresh ones', () => {
    const current = [scene({ id: 'a', title: 'Mine' })]
    const incoming = [scene({ id: 'a', title: 'Theirs' })]

    const next = importScenes(current, incoming, {
      mode: 'merge',
      newId: idGen(),
    })

    expect(next).toHaveLength(2)
    expect(next[0]).toEqual({ ...current[0], order: 0 })
    expect(next[1].id).toBe('new-1')
    expect(next[1].title).toBe('Theirs')
  })

  it('keeps both libraries archived scenes at the end', () => {
    const current = [scene({ id: 'a' }), scene({ id: 'old-arch', archivedAt: 1 })]
    const incoming = [scene({ id: 'new-arch', archivedAt: 2 })]

    const next = importScenes(current, incoming, {
      mode: 'merge',
      newId: idGen(),
    })

    expect(next.map((s) => s.id)).toEqual(['a', 'old-arch', 'new-arch'])
  })

  it('importing a backup of the current library twice keeps everything', () => {
    const current = [scene({ id: 'a' })]
    const backup = buildLibrary(current, 0).scenes

    const once = importScenes(current, backup, {
      mode: 'merge',
      newId: idGen(),
    })
    const twice = importScenes(once, backup, { mode: 'merge', newId: idGen() })

    expect(once).toHaveLength(2)
    expect(twice).toHaveLength(3)
    expect(new Set(twice.map((s) => s.id)).size).toBe(3)
  })
})
