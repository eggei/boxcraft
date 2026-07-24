// Headless scene-list domain module.
//
// Pure operations over an array of scenes: create, seed, add, duplicate,
// archive/unarchive, reorder, rename, and the active/archived projections.
// No I/O, no clock, no React — callers pass ids and timestamps in. The
// persistence layer is a dumb store of whatever these functions return.

export interface Scene {
  id: string
  title: string
  source: string
  /** Position among active scenes; contiguous integers from 0. */
  order: number
  /** Soft-delete / archive marker. `null` means active. */
  archivedAt: number | null
}

export const DEFAULT_SOURCE = `<!doctype html>
<html>
  <head>
    <style>
      body { margin: 0; display: grid; place-items: center; min-height: 100vh; }
      .canvas { position: relative; width: 400px; height: 400px; background: #fff; }
    </style>
  </head>
  <body>
    <div class="canvas"></div>
  </body>
</html>
`

export function createScene(opts: {
  id: string
  order: number
  title?: string
  source?: string
}): Scene {
  return {
    id: opts.id,
    title: opts.title ?? 'Untitled',
    source: opts.source ?? DEFAULT_SOURCE,
    order: opts.order,
    archivedAt: null,
  }
}

function exampleSource(css: string, body: string): string {
  return `<!doctype html>
<html>
  <head>
    <style>
      body { margin: 0; display: grid; place-items: center; min-height: 100vh; background: #f6f6f6; }
      .canvas { position: relative; width: 400px; height: 400px; background: #fff; }
${css}
    </style>
  </head>
  <body>
    <div class="canvas">
${body}
    </div>
  </body>
</html>
`
}

const EXAMPLES: Array<{ title: string; source: string }> = [
  {
    title: 'Glow button',
    source: exampleSource(
      `      .box-1 {
        position: absolute; left: 130px; top: 170px; width: 140px; height: 56px;
        border-radius: 12px; background: #6d28d9; box-shadow: 0 0 24px 4px #a78bfa;
      }`,
      `      <div class="box-1"></div>`,
    ),
  },
  {
    title: 'Gradient card',
    source: exampleSource(
      `      .box-1 {
        position: absolute; left: 100px; top: 100px; width: 200px; height: 200px;
        border-radius: 20px; background: linear-gradient(135deg, #f472b6, #60a5fa);
      }`,
      `      <div class="box-1"></div>`,
    ),
  },
  {
    title: 'Pulsing dot',
    source: exampleSource(
      `      .box-1 {
        position: absolute; left: 170px; top: 170px; width: 60px; height: 60px;
        border-radius: 50%; background: #10b981; animation: pulse 1.4s ease-in-out infinite;
      }
      @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.4); opacity: .6; } }`,
      `      <div class="box-1"></div>`,
    ),
  },
]

export function seedScenes(): Scene[] {
  return EXAMPLES.map((example, index) =>
    createScene({
      id: `seed-${index + 1}`,
      order: index,
      title: example.title,
      source: example.source,
    }),
  )
}

/** Active scenes, sorted by their order. */
export function activeScenes(scenes: Scene[]): Scene[] {
  return scenes
    .filter((s) => s.archivedAt === null)
    .sort((a, b) => a.order - b.order)
}

/** Reassign contiguous orders (0..n) to the given active scenes in array order. */
function reflow(active: Scene[]): Scene[] {
  return active.map((scene, index) =>
    scene.order === index ? scene : { ...scene, order: index },
  )
}

export function addScene(
  scenes: Scene[],
  opts: { id: string; title?: string; source?: string },
): { scenes: Scene[]; scene: Scene } {
  const nextOrder = activeScenes(scenes).length
  const scene = createScene({ ...opts, order: nextOrder })
  return { scenes: [...scenes, scene], scene }
}

export function duplicateScene(
  scenes: Scene[],
  id: string,
  newId: string,
): { scenes: Scene[]; scene: Scene | null } {
  const original = scenes.find((s) => s.id === id && s.archivedAt === null)
  if (!original) return { scenes, scene: null }

  const copy = createScene({
    id: newId,
    order: original.order, // provisional; reflow fixes it
    title: `${original.title} copy`,
    source: original.source,
  })

  const active = activeScenes(scenes)
  const insertAt = active.findIndex((s) => s.id === id) + 1
  const nextActive = reflow([
    ...active.slice(0, insertAt),
    copy,
    ...active.slice(insertAt),
  ])

  const archived = scenes.filter((s) => s.archivedAt !== null)
  return { scenes: [...nextActive, ...archived], scene: nextActive[insertAt] }
}

/** Archived scenes, most-recently-archived first. */
export function archivedScenes(scenes: Scene[]): Scene[] {
  return scenes
    .filter((s) => s.archivedAt !== null)
    .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0))
}

export function archiveScene(
  scenes: Scene[],
  id: string,
  now: number,
): Scene[] {
  const remaining = reflow(activeScenes(scenes).filter((s) => s.id !== id))
  const archived = scenes
    .filter((s) => s.archivedAt !== null || s.id === id)
    .map((s) => (s.id === id ? { ...s, archivedAt: now } : s))
  return [...remaining, ...archived]
}

export function unarchiveScene(scenes: Scene[], id: string): Scene[] {
  const target = scenes.find((s) => s.id === id)
  if (!target || target.archivedAt === null) return scenes

  const active = activeScenes(scenes)
  const restored = { ...target, archivedAt: null, order: active.length }
  const stillArchived = scenes.filter(
    (s) => s.archivedAt !== null && s.id !== id,
  )
  return [...active, restored, ...stillArchived]
}

export function reorderScenes(scenes: Scene[], orderedIds: string[]): Scene[] {
  const byId = new Map(scenes.map((s) => [s.id, s]))
  const reordered = reflow(
    orderedIds
      .map((id) => byId.get(id))
      .filter((s): s is Scene => s !== undefined && s.archivedAt === null),
  )
  const archived = scenes.filter((s) => s.archivedAt !== null)
  return [...reordered, ...archived]
}

export function renameScene(
  scenes: Scene[],
  id: string,
  title: string,
): Scene[] {
  return scenes.map((s) => (s.id === id ? { ...s, title } : s))
}
