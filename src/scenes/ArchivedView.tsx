import { ArchiveRestore } from 'lucide-react'
import { archivedScenes, type Scene } from './sceneList'

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
          className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
        >
          <span>{scene.title}</span>
          <button
            type="button"
            onClick={() => onUnarchive(scene.id)}
            className="hover:bg-muted flex items-center gap-1.5 rounded-md border px-2 py-1"
          >
            <ArchiveRestore className="size-4" />
            Unarchive
          </button>
        </li>
      ))}
    </ul>
  )
}
