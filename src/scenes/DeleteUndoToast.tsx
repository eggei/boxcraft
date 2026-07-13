import { Button } from '@/components/ui/button'
import { useSceneActions } from './SceneActionsContext'

/** Soft-delete's undo toast (DESIGN.md §9) — no confirm dialog, just a way back. */
export function DeleteUndoToast() {
  const { pendingDelete, undoDelete } = useSceneActions()
  if (!pendingDelete) return null

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-background px-4 py-2 text-sm shadow-lg"
    >
      <span>Deleted "{pendingDelete.scene.title}"</span>
      <Button variant="ghost" size="sm" onClick={undoDelete}>
        Undo
      </Button>
    </div>
  )
}
