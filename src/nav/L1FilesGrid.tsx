import { useState } from 'react'
import { motion } from 'framer-motion'
import { Copy, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSceneList } from '../scenes/SceneListContext'
import { useSceneActions } from '../scenes/SceneActionsContext'
import { useSceneSource } from '../persistence/use-scene-source'
import { ScenePreview } from '../scene/ScenePreview'
import { reorderIds } from '../scenes/reorder'

/**
 * L1 — files view (DESIGN.md §2): every scene as a static snapshot in a grid,
 * for scanning/organizing. Nothing here is live (see `ScenePreview`).
 * Reorder-by-drag drives the persisted order that L2's feed follows.
 */
export function L1FilesGrid({ onOpen }: { onOpen: (id: string) => void }) {
  const { scenes } = useSceneList()
  const actions = useSceneActions()
  const [draggingId, setDraggingId] = useState<string | null>(null)

  function handleDrop(targetId: string) {
    if (draggingId) {
      actions.reorder(reorderIds(scenes.map((s) => s.id), draggingId, targetId))
    }
    setDraggingId(null)
  }

  return (
    <div className="grid h-full w-full grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4 overflow-auto p-6">
      {scenes.map((scene) => (
        <FileCard
          key={scene.id}
          id={scene.id}
          title={scene.title}
          onOpen={() => onOpen(scene.id)}
          onRename={(title) => actions.renameScene(scene.id, title)}
          onDuplicate={() => actions.duplicateScene(scene.id)}
          onDelete={() => actions.softDeleteScene(scene.id)}
          onDragStart={() => setDraggingId(scene.id)}
          onDropOnto={() => handleDrop(scene.id)}
        />
      ))}
    </div>
  )
}

function FileCard({
  id,
  title,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  onDragStart,
  onDropOnto,
}: {
  id: string
  title: string
  onOpen: () => void
  onRename: (title: string) => void
  onDuplicate: () => void
  onDelete: () => void
  onDragStart: () => void
  onDropOnto: () => void
}) {
  const source = useSceneSource(id)
  const [editing, setEditing] = useState(false)

  return (
    <motion.div
      layoutId={`scene-${id}`}
      className="group relative flex flex-col gap-1.5"
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        onDropOnto()
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${title}`}
        className="aspect-square w-full overflow-hidden rounded-lg border border-border bg-muted"
      >
        <ScenePreview source={source} title={title} />
      </button>
      <div className="flex items-center justify-between gap-1">
        {editing ? (
          <input
            autoFocus
            defaultValue={title}
            className="w-full rounded border border-border bg-background px-1 text-sm"
            onBlur={(e) => {
              onRename(e.target.value || title)
              setEditing(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') setEditing(false)
            }}
          />
        ) : (
          <span className="truncate text-sm" onDoubleClick={() => setEditing(true)}>
            {title}
          </span>
        )}
        <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
          <Button variant="ghost" size="icon-xs" aria-label={`Duplicate ${title}`} onClick={onDuplicate}>
            <Copy />
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label={`Delete ${title}`} onClick={onDelete}>
            <Trash2 />
          </Button>
        </div>
      </div>
    </motion.div>
  )
}
