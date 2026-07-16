import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useScenes } from '@/scenes/useScenes'
import { SceneFeed } from '@/scenes/SceneFeed'
import { ArchivedView } from '@/scenes/ArchivedView'

type View = 'feed' | 'archived'

function App() {
  const {
    scenes,
    status,
    addScene,
    duplicateScene,
    archiveScene,
    unarchiveScene,
    renameScene,
  } = useScenes()
  const [view, setView] = useState<View>('feed')
  const [undoId, setUndoId] = useState<string | null>(null)

  // Soft-delete = archive + an undo toast (no confirm dialog).
  const handleDelete = useCallback(
    (id: string) => {
      archiveScene(id)
      setUndoId(id)
    },
    [archiveScene],
  )

  const handleUndo = useCallback(() => {
    if (undoId) unarchiveScene(undoId)
    setUndoId(null)
  }, [undoId, unarchiveScene])

  // Auto-dismiss the undo toast.
  useEffect(
    function dismissToast() {
      if (!undoId) return
      const timer = setTimeout(() => setUndoId(null), 6000)
      return () => clearTimeout(timer)
    },
    [undoId],
  )

  // Keyboard shortcut: "N" adds a new scene (ignored while typing).
  useEffect(function newSceneShortcut() {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) {
        return
      }
      if (event.key === 'n' || event.key === 'N') {
        event.preventDefault()
        addScene()
        setView('feed')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [addScene])

  return (
    <div className="flex h-svh flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-2">
        <h1 className="text-lg font-semibold tracking-tight">BoxCraft</h1>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setView(view === 'feed' ? 'archived' : 'feed')}
          className="hover:bg-muted rounded-md border px-3 py-1.5 text-sm"
        >
          {view === 'feed' ? 'Archived' : 'Back to feed'}
        </button>
        <button
          type="button"
          onClick={() => {
            addScene()
            setView('feed')
          }}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm"
        >
          <Plus className="size-4" />
          New
        </button>
      </header>

      <main className="min-h-0 flex-1">
        {status === 'loading' ? (
          <p className="text-muted-foreground p-8 text-sm">Loading…</p>
        ) : view === 'archived' ? (
          <ArchivedView scenes={scenes} onUnarchive={unarchiveScene} />
        ) : (
          <SceneFeed
            scenes={scenes}
            onRename={renameScene}
            onDuplicate={duplicateScene}
            onArchive={archiveScene}
            onDelete={handleDelete}
          />
        )}
      </main>

      {undoId && (
        <div
          role="status"
          className="bg-background fixed bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-lg border px-4 py-2 text-sm shadow-md"
        >
          <span>Scene deleted</span>
          <button
            type="button"
            onClick={handleUndo}
            className="font-medium underline underline-offset-2"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  )
}

export default App
