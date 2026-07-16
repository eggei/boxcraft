import { useState } from 'react'
import { motion } from 'framer-motion'
import { activeScenes, type Scene } from './sceneList'

/**
 * L1 — the files grid: a static snapshot per active scene. Drag a tile onto
 * another to reorder (that order drives the L2 feed). Clicking a tile drops
 * into the feed centered on it. Snapshots are small live iframes for now;
 * cached static thumbnails are a Phase 5 concern.
 */
export function FilesView({
  scenes,
  onOpen,
  onReorder,
}: {
  scenes: Scene[]
  onOpen: (index: number) => void
  onReorder: (orderedIds: string[]) => void
}) {
  const active = activeScenes(scenes)
  const [dragId, setDragId] = useState<string | null>(null)

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return
    const ids = active.map((s) => s.id)
    const from = ids.indexOf(dragId)
    const to = ids.indexOf(targetId)
    const [moved] = ids.splice(from, 1)
    ids.splice(to, 0, moved)
    onReorder(ids)
    setDragId(null)
  }

  return (
    <div className="grid h-full grid-cols-[repeat(auto-fill,240px)] content-start justify-center gap-6 overflow-y-auto p-6">
      {active.map((scene, index) => (
        <motion.button
          key={scene.id}
          type="button"
          layoutId={`scene-${scene.id}`}
          data-testid="files-tile"
          draggable
          onDragStart={() => setDragId(scene.id)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => handleDrop(scene.id)}
          onClick={() => onOpen(index)}
          className="hover:ring-ring flex w-[240px] flex-col gap-2 rounded-lg text-left hover:ring-2"
        >
          <div className="relative h-[240px] w-[240px] overflow-hidden rounded-lg border bg-white">
            {/* A big iframe scaled down so the whole 400×400-in-100vh scene fits. */}
            <iframe
              title={`${scene.title} snapshot`}
              srcDoc={scene.source}
              tabIndex={-1}
              width={960}
              height={960}
              style={{ transform: 'scale(0.25)', transformOrigin: 'top left' }}
              className="pointer-events-none absolute left-0 top-0 border-0"
            />
          </div>
          <span className="truncate px-1 text-sm">{scene.title}</span>
        </motion.button>
      ))}
    </div>
  )
}
