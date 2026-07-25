import { ArchiveRestore } from 'lucide-react'
import { archivedScenes, type Scene } from './sceneList'
import { SceneThumbnail } from './SceneThumbnail'

/** Side of the snapshot shown next to each archived scene, in px. */
const THUMBNAIL_SIZE = 100

export function ArchivedView({
  scenes,
  onUnarchive,
}: {
  scenes: Scene[]
  onUnarchive: (id: string) => void
}) {
  const archived = archivedScenes(scenes)

  if (archived.length === 0) {
    return (
      <p className="text-muted-foreground p-8 text-sm">
        No archived scenes.
      </p>
    )
  }

  return (
    <ul className="mx-auto flex max-w-[640px] flex-col gap-2 p-6">
      {archived.map((scene) => (
        <li
          key={scene.id}
          data-testid="archived-item"
          className="flex items-center gap-3 rounded-md border p-3 text-sm"
        >
          <SceneThumbnail
            source={scene.source}
            title={scene.title}
            size={THUMBNAIL_SIZE}
          />
          <span className="flex-1 truncate">{scene.title}</span>
          <button
            type="button"
            onClick={() => onUnarchive(scene.id)}
            className="hover:bg-muted flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1"
          >
            <ArchiveRestore className="size-4" />
            Unarchive
          </button>
        </li>
      ))}
    </ul>
  )
}
