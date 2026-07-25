import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { gapUnderPointer, withMovedInto } from './dragOrder'
import { activeScenes, type Scene } from './sceneList'
import { SceneThumbnail } from './SceneThumbnail'

/** Side of a grid tile's snapshot, in px. */
const TILE_SIZE = 240

/** A drag in flight: what is being moved, and which gap it would land in. */
interface Drag {
  id: string
  /** Insertion index among the tiles that are staying put. */
  insertAt: number
}

/**
 * L1 — the files grid: a static snapshot per active scene. Drag a tile into the
 * gap between two others to reorder (that order drives the L2 feed). Clicking a
 * tile drops into the feed centered on it. Snapshots are small live iframes for
 * now; cached static thumbnails are a Phase 5 concern.
 *
 * While a drag is in flight the grid renders the *prospective* order rather
 * than the stored one: the dragged tile occupies the gap it would land in,
 * highlighted behind a dashed outline, and its neighbours slide aside to open
 * that gap. Framer's layout animation does the sliding, so the drop is a no-op
 * visually — what you were shown is exactly what gets committed.
 */
export function FilesView({
  scenes,
  onOpen,
  onReorder,
}: {
  scenes: Scene[]
  onOpen: (sceneId: string) => void
  onReorder: (orderedIds: string[]) => void
}) {
  const active = activeScenes(scenes)
  const [drag, setDrag] = useState<Drag | null>(null)
  const reducedMotion = useReducedMotion()

  const dragged = drag ? active.find((s) => s.id === drag.id) : undefined
  // The tiles that hold still during the drag, and the order on screen now.
  const others = dragged ? active.filter((s) => s !== dragged) : active
  const preview =
    drag && dragged ? withMovedInto(others, dragged, drag.insertAt) : active

  function handleDragStart(event: React.DragEvent, scene: Scene) {
    event.dataTransfer.effectAllowed = 'move'
    // Firefox will not start a drag whose data transfer is empty.
    event.dataTransfer.setData('text/plain', scene.id)
    setDrag({ id: scene.id, insertAt: active.indexOf(scene) })
  }

  function handleDragOver(event: React.DragEvent, scene: Scene) {
    // Both halves of this: allowing the drop, and tracking the gap under the
    // pointer. Without preventDefault the browser rejects the drop outright.
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (!drag || scene.id === drag.id) return

    const insertAt = gapUnderPointer(
      others.findIndex((s) => s.id === scene.id),
      event.clientX,
      event.currentTarget.getBoundingClientRect(),
    )
    if (insertAt !== drag.insertAt) setDrag({ ...drag, insertAt })
  }

  function handleDrop() {
    if (!drag) return
    setDrag(null)
    onReorder(preview.map((s) => s.id))
  }

  // Neighbours glide out of the way on Motion's default layout spring, the
  // same one that carries a tile into the feed — unless the reader asked for
  // less motion, in which case the grid just snaps.
  const transition = reducedMotion ? { layout: { duration: 0 } } : undefined

  return (
    <div
      className="grid h-full grid-cols-[repeat(auto-fill,240px)] content-start justify-center gap-6 overflow-y-auto p-6"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      {preview.map((scene) => {
        const isDropSlot = drag?.id === scene.id
        return (
          <motion.button
            key={scene.id}
            type="button"
            layoutId={`scene-${scene.id}`}
            layout
            transition={transition}
            data-testid="files-tile"
            data-drop-slot={isDropSlot || undefined}
            draggable
            // Motion types `onDragStart` for its own pan gesture, but on a
            // `draggable` element it forwards the listener to the DOM node, so
            // what actually arrives here is a native drag event.
            onDragStart={(event) =>
              handleDragStart(event as unknown as React.DragEvent, scene)
            }
            onDragEnd={() => setDrag(null)}
            onDragOver={(event) => handleDragOver(event, scene)}
            onClick={() => onOpen(scene.id)}
            className="hover:ring-ring flex w-[240px] flex-col gap-2 rounded-lg text-left hover:ring-2"
          >
            <div className="relative">
              <div className={isDropSlot ? 'opacity-35' : undefined}>
                <SceneThumbnail
                  source={scene.source}
                  title={scene.title}
                  size={TILE_SIZE}
                />
              </div>
              {isDropSlot && (
                <motion.span
                  aria-hidden
                  initial={reducedMotion ? false : { opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="border-primary bg-primary/15 pointer-events-none absolute inset-0 rounded-md border-2 border-dashed"
                />
              )}
            </div>
            <span
              className={`truncate px-1 text-sm ${isDropSlot ? 'text-primary' : ''}`}
            >
              {scene.title}
            </span>
          </motion.button>
        )
      })}
    </div>
  )
}
