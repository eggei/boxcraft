import { WithTooltip } from '@/components/ui/tooltip'
import type { Scene } from './sceneList'

/**
 * Raised when another tab saved a scene this tab still has unsaved edits to.
 * Autosave holds the scene back until the person picks a side, so the banner
 * stays up until they do; with several conflicts it settles them one at a time.
 */
export function SceneConflictBanner({
  scenes,
  conflicts,
  onResolve,
}: {
  scenes: Scene[]
  conflicts: string[]
  onResolve: (id: string, keep: 'mine' | 'theirs') => void
}) {
  const [id] = conflicts
  if (!id) return null
  const title = scenes.find((scene) => scene.id === id)?.title || 'Untitled'

  return (
    <div
      role="alert"
      className="bg-popover shadow-raised fixed top-16 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-lg border px-4 py-2 text-sm"
    >
      <span>
        This scene changed in another tab: <strong>{title}</strong>
      </span>
      <WithTooltip tip="Drop the edits made here and load the other tab's version">
        <button
          type="button"
          onClick={() => onResolve(id, 'theirs')}
          className="font-medium underline underline-offset-2"
        >
          Reload
        </button>
      </WithTooltip>
      <WithTooltip tip="Save the edits made here over the other tab's version">
        <button
          type="button"
          onClick={() => onResolve(id, 'mine')}
          className="font-medium underline underline-offset-2"
        >
          Keep mine
        </button>
      </WithTooltip>
    </div>
  )
}
