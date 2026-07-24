import { useCallback, useEffect, useRef, useState } from 'react'
import { LayoutGroup, motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { useScenes } from '@/scenes/useScenes'
import { SceneFeed } from '@/scenes/SceneFeed'
import { FilesView } from '@/scenes/FilesView'
import { ArchivedView } from '@/scenes/ArchivedView'
import { SceneEditorPane } from '@/scene/SceneEditorPane'
import { activeScenes } from '@/scenes/sceneList'
import { zoom, type Level } from '@/scenes/navigation'

const ZOOM_COOLDOWN_MS = 350

function App() {
  const {
    scenes,
    status,
    addScene,
    duplicateScene,
    archiveScene,
    unarchiveScene,
    renameScene,
    reorderScenes,
    updateSource,
  } = useScenes()

  const [level, setLevel] = useState<Level>('feed')
  const [index, setIndex] = useState(0)
  const [showArchived, setShowArchived] = useState(false)
  const [undoId, setUndoId] = useState<string | null>(null)
  const lastZoom = useRef(0)

  const active = activeScenes(scenes)
  const focusedIndex = Math.min(index, Math.max(0, active.length - 1))
  const focused = active[focusedIndex]

  const startEditing = useCallback(() => {
    if (active.length > 0) setLevel('edit')
  }, [active.length])

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

  useEffect(
    function dismissToast() {
      if (!undoId) return
      const timer = setTimeout(() => setUndoId(null), 6000)
      return () => clearTimeout(timer)
    },
    [undoId],
  )

  // Keyboard: N = new scene, ⌘/Ctrl+Enter = Start Editing, Esc = exit editing.
  useEffect(
    function keyboardShortcuts() {
      function onKeyDown(event: KeyboardEvent) {
        const target = event.target as HTMLElement | null
        const inField =
          target?.tagName === 'INPUT' ||
          target?.tagName === 'TEXTAREA' ||
          target?.isContentEditable

        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault()
          startEditing()
          return
        }
        if (event.key === 'Escape' && level === 'edit') {
          setLevel('feed')
          return
        }
        if (event.metaKey || event.ctrlKey || event.altKey || inField) return
        if (event.key === 'n' || event.key === 'N') {
          event.preventDefault()
          addScene()
          setShowArchived(false)
          setLevel('feed')
        }
      }
      window.addEventListener('keydown', onKeyDown)
      return () => window.removeEventListener('keydown', onKeyDown)
    },
    [addScene, startEditing, level],
  )

  // ⌘/Ctrl + scroll changes zoom level (scroll up = out toward files, down =
  // in toward editing). Plain scroll is left alone so it stays within a level.
  useEffect(function zoomGesture() {
    function onWheel(event: WheelEvent) {
      if (!(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      const now = Date.now()
      if (now - lastZoom.current < ZOOM_COOLDOWN_MS) return
      lastZoom.current = now
      setLevel((current) => zoom(current, event.deltaY > 0 ? 'in' : 'out'))
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  function openFromFiles(i: number) {
    setIndex(i)
    setLevel('feed')
  }

  return (
    <div className="flex h-svh flex-col">
      <header className="flex items-center gap-2 border-b px-4 py-2">
        <h1 className="text-lg font-semibold tracking-tight">BoxCraft</h1>
        {level === 'edit' && focused && (
          <input
            aria-label="Scene title"
            className="border-input focus-visible:ring-ring ml-2 rounded-md border bg-transparent px-2 py-1 text-sm outline-none focus-visible:ring-[3px]"
            value={focused.title}
            onChange={(event) => renameScene(focused.id, event.target.value)}
          />
        )}
        <div className="flex-1" />

        {!showArchived && level !== 'files' && (
          <HeaderButton onClick={() => setLevel('files')}>Files</HeaderButton>
        )}
        {!showArchived && level === 'files' && (
          <HeaderButton onClick={() => setLevel('feed')}>Feed</HeaderButton>
        )}
        {!showArchived && level === 'feed' && (
          <HeaderButton onClick={startEditing}>
            Start Editing (⌘+Enter)
          </HeaderButton>
        )}
        {!showArchived && level === 'edit' && (
          <HeaderButton onClick={() => setLevel('feed')}>
            Exit (Esc)
          </HeaderButton>
        )}

        {level !== 'edit' && (
          <HeaderButton onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'Back to feed' : 'Archived'}
          </HeaderButton>
        )}
        {!showArchived && level !== 'edit' && (
          <button
            type="button"
            onClick={() => {
              addScene()
              setLevel('feed')
            }}
            className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm"
          >
            <Plus className="size-4" />
            New
          </button>
        )}
      </header>

      <main className="min-h-0 flex-1">
        {status === 'loading' ? (
          <p className="text-muted-foreground p-8 text-sm">Loading…</p>
        ) : showArchived ? (
          <ArchivedView scenes={scenes} onUnarchive={unarchiveScene} />
        ) : (
          <LayoutGroup>
            <motion.div
              key={level}
              className="h-full"
              initial={{ opacity: 0, scale: level === 'files' ? 1.04 : 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
            >
              {level === 'files' && (
                <FilesView
                  scenes={scenes}
                  onOpen={openFromFiles}
                  onReorder={reorderScenes}
                />
              )}
              {level === 'feed' && (
                <SceneFeed
                  scenes={scenes}
                  focusIndex={focusedIndex}
                  onRename={renameScene}
                  onDuplicate={duplicateScene}
                  onArchive={archiveScene}
                  onDelete={handleDelete}
                  onCurrentIndexChange={setIndex}
                />
              )}
              {level === 'edit' && focused && (
                <SceneEditorPane
                  key={focused.id}
                  source={focused.source}
                  onChange={(source) => updateSource(focused.id, source)}
                />
              )}
            </motion.div>
          </LayoutGroup>
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

function HeaderButton({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:bg-muted rounded-md border px-3 py-1.5 text-sm"
    >
      {children}
    </button>
  )
}

export default App
