// The library file: the whole scene collection as one portable JSON document.
//
// Pure module — build a library from scenes, parse an untrusted file back into
// scenes, and fold incoming scenes into an existing library. No I/O, no clock,
// no React: callers pass the export timestamp and fresh ids in.

import { activeScenes, archivedScenes, type Scene } from '@/scenes/sceneList'

export const LIBRARY_FORMAT = 'boxcraft-library'

/** Bump when the shape changes; parsing accepts anything up to this. */
export const LIBRARY_VERSION = 1

export interface LibraryFile {
  format: typeof LIBRARY_FORMAT
  version: number
  /** Epoch ms the export was taken. */
  exportedAt: number
  /** Every scene, active and archived, in export order. */
  scenes: Scene[]
}

/** `merge` appends the incoming scenes; `replace` swaps the library wholesale. */
export type ImportMode = 'merge' | 'replace'

export type ParseResult =
  | { ok: true; library: LibraryFile; /** Unreadable entries dropped. */ skipped: number }
  | { ok: false; error: string }

export function buildLibrary(scenes: Scene[], exportedAt: number): LibraryFile {
  return {
    format: LIBRARY_FORMAT,
    version: LIBRARY_VERSION,
    exportedAt,
    // Spelled out rather than spread so a future in-memory-only field on Scene
    // can't leak into the file format by accident.
    scenes: scenes.map(({ id, title, source, order, archivedAt }) => ({
      id,
      title,
      source,
      order,
      archivedAt,
    })),
  }
}

export function serializeLibrary(library: LibraryFile): string {
  return `${JSON.stringify(library, null, 2)}\n`
}

export function libraryFilename(exportedAt: number): string {
  const day = new Date(exportedAt).toISOString().slice(0, 10)
  return `boxcraft-library-${day}.json`
}

/**
 * Read a picked file's text into a library. Everything about the input is
 * untrusted: bad JSON, a foreign format, a newer format version, and individual
 * junk entries are all reported rather than thrown.
 */
export function parseLibrary(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: "That file isn't valid JSON." }
  }

  if (
    !isRecord(raw) ||
    raw.format !== LIBRARY_FORMAT ||
    !Array.isArray(raw.scenes)
  ) {
    return {
      ok: false,
      error: "That doesn't look like a BoxCraft library export.",
    }
  }

  const version = typeof raw.version === 'number' ? raw.version : 0
  if (version > LIBRARY_VERSION) {
    return {
      ok: false,
      error: `That library was exported by a newer BoxCraft (format v${version}); this one reads up to v${LIBRARY_VERSION}.`,
    }
  }

  const scenes: Scene[] = []
  let skipped = 0
  for (const entry of raw.scenes) {
    const scene = toScene(entry, scenes.length)
    if (scene) scenes.push(scene)
    else skipped += 1
  }

  if (scenes.length === 0) {
    return { ok: false, error: 'That library file contains no readable scenes.' }
  }

  return {
    ok: true,
    skipped,
    library: {
      format: LIBRARY_FORMAT,
      version,
      exportedAt: typeof raw.exportedAt === 'number' ? raw.exportedAt : 0,
      scenes,
    },
  }
}

/**
 * The library after an import. `merge` keeps the current scenes and appends the
 * incoming active ones after them; `replace` drops the current library entirely.
 * Either way, ids that would collide get a fresh one from `newId` — an import
 * never overwrites a scene that is already there.
 */
export function importScenes(
  current: Scene[],
  incoming: Scene[],
  opts: { mode: ImportMode; newId: () => string },
): Scene[] {
  if (opts.mode === 'replace') {
    const scenes = withFreshIds(incoming, opts.newId, new Set())
    return reflow(activeScenes(scenes), archivedScenes(scenes))
  }

  const taken = new Set(current.map((scene) => scene.id))
  const added = withFreshIds(incoming, opts.newId, taken)
  return reflow(
    [...activeScenes(current), ...activeScenes(added)],
    [...archivedScenes(current), ...archivedScenes(added)],
  )
}

/** Contiguous orders (0..n) over the active scenes, in the given array order. */
function reflow(active: Scene[], archived: Scene[]): Scene[] {
  return [
    ...active.map((scene, index) =>
      scene.order === index ? scene : { ...scene, order: index },
    ),
    ...archived,
  ]
}

/** Re-id any scene whose id is already `taken` (or repeated within the batch). */
function withFreshIds(
  scenes: Scene[],
  newId: () => string,
  taken: Set<string>,
): Scene[] {
  return scenes.map((scene) => {
    if (!taken.has(scene.id)) {
      taken.add(scene.id)
      return scene
    }
    // Keep going until the id is actually unused: a generator that repeats
    // itself would otherwise collapse two scenes into one stored record.
    let id = newId()
    for (let attempt = 1; taken.has(id); attempt += 1) {
      id = `${newId()}-${attempt}`
    }
    taken.add(id)
    return { ...scene, id }
  })
}

function toScene(value: unknown, fallbackOrder: number): Scene | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || value.id === '') return null
  if (typeof value.source !== 'string') return null

  return {
    id: value.id,
    title: typeof value.title === 'string' ? value.title : 'Untitled',
    source: value.source,
    order: typeof value.order === 'number' ? value.order : fallbackOrder,
    archivedAt: typeof value.archivedAt === 'number' ? value.archivedAt : null,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
