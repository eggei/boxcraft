import { useCallback, useEffect, useState } from 'react'
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useMatch,
  useNavigate,
} from 'react-router-dom'
import { LayoutGroup, motion } from 'framer-motion'
import { Moon, Plus, Sun } from 'lucide-react'
import { useScenes } from '@/scenes/useScenes'
import { SceneFeed } from '@/scenes/SceneFeed'
import { FilesView } from '@/scenes/FilesView'
import { ArchivedView } from '@/scenes/ArchivedView'
import { SceneEditorPane } from '@/scene/SceneEditorPane'
import { activeScenes, type Scene } from '@/scenes/sceneList'
import { editPath, feedPath, pageForPath, ROUTES } from '@/scenes/navigation'
import { useTheme } from '@/theme/useTheme'
import { WithTooltip } from '@/components/ui/tooltip'
import { LibraryControls } from '@/library/LibraryControls'
import { type ImportMode } from '@/library/libraryFile'

/**
 * The shell: header chrome plus the routed pages. Where the app is — files,
 * feed, a scene in the editor, the archive — lives in the URL rather than in
 * component state, so every page is linkable, reloadable and back-button aware.
 */
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
    importLibrary,
  } = useScenes()

  const { theme, toggle: toggleTheme } = useTheme()

  const navigate = useNavigate()
  const { pathname } = useLocation()
  const page = pageForPath(pathname)
  const feedMatch = useMatch(ROUTES.feedScene)
  const editMatch = useMatch(ROUTES.editScene)

  const active = activeScenes(scenes)
  /** The scene the editor is on, if the URL names one that still exists. */
  const editing = active.find((scene) => scene.id === editMatch?.params.sceneId)
  /** The feed's centered scene: from the URL, else the first card. */
  const feedSceneId = feedMatch?.params.sceneId ?? active[0]?.id
  const [undoId, setUndoId] = useUndoToast()

  const startEditing = useCallback(() => {
    if (feedSceneId) navigate(editPath(feedSceneId))
  }, [feedSceneId, navigate])

  // A new scene lands in the editor directly — a blank card in the feed has
  // nothing to show.
  const handleNewScene = useCallback(() => {
    navigate(editPath(addScene()))
  }, [addScene, navigate])

  // Soft-delete = archive + an undo toast (no confirm dialog).
  const handleDelete = useCallback(
    (id: string) => {
      archiveScene(id)
      setUndoId(id)
    },
    [archiveScene, setUndoId],
  )

  // An import can move or drop whatever was focused, so land on the feed's
  // first scene rather than trying to keep a position that may no longer exist.
  const handleImport = useCallback(
    async (incoming: Scene[], mode: ImportMode) => {
      await importLibrary(incoming, mode)
      setUndoId(null)
      navigate(feedPath())
    },
    [importLibrary, navigate, setUndoId],
  )

  const handleUndo = useCallback(() => {
    if (undoId) unarchiveScene(undoId)
    setUndoId(null)
  }, [undoId, setUndoId, unarchiveScene])

  // Scrolling the feed rewrites the URL in place: a reload or a shared link
  // comes back to the same card, without an entry per card in the history.
  const handleCurrentScene = useCallback(
    (sceneId: string) => {
      if (sceneId !== feedMatch?.params.sceneId) {
        navigate(feedPath(sceneId), { replace: true })
      }
    },
    [feedMatch?.params.sceneId, navigate],
  )

  const openForEditing = useCallback(
    (sceneId: string) => navigate(editPath(sceneId)),
    [navigate],
  )

  const openFromFiles = useCallback(
    (sceneId: string) => navigate(feedPath(sceneId)),
    [navigate],
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
        if (event.key === 'Escape' && page === 'edit') {
          navigate(feedPath(editing?.id))
          return
        }
        if (event.metaKey || event.ctrlKey || event.altKey || inField) return
        if (event.key === 'n' || event.key === 'N') {
          event.preventDefault()
          handleNewScene()
        }
      }
      window.addEventListener('keydown', onKeyDown)
      return () => window.removeEventListener('keydown', onKeyDown)
    },
    [handleNewScene, startEditing, navigate, page, editing?.id],
  )

  const feed = (
    <SceneFeed
      scenes={scenes}
      focusSceneId={feedSceneId}
      onRename={renameScene}
      onDuplicate={duplicateScene}
      onArchive={archiveScene}
      onDelete={handleDelete}
      onCurrentSceneChange={handleCurrentScene}
      onOpen={openForEditing}
    />
  )

  return (
    <div className="flex h-svh flex-col">
      <header className="flex items-center gap-2 border-b px-4 py-2">
        <Logo />
        <h1 className="text-lg font-semibold tracking-tight">BoxCraft</h1>
        {editing && (
          <input
            aria-label="Scene title"
            className="border-input focus-visible:ring-ring ml-2 rounded-md border bg-transparent px-2 py-1 text-sm outline-none focus-visible:ring-[3px]"
            value={editing.title}
            onChange={(event) => renameScene(editing.id, event.target.value)}
          />
        )}
        <div className="flex-1" />

        <WithTooltip
          tip={
            theme === 'dark'
              ? 'Switch to the light theme'
              : 'Switch to the dark theme'
          }
        >
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={
              theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
            }
            className="hover:bg-muted text-muted-foreground rounded-md border p-2"
          >
            {theme === 'dark' ? (
              <Sun className="size-4" />
            ) : (
              <Moon className="size-4" />
            )}
          </button>
        </WithTooltip>

        {page !== 'edit' && (
          <LibraryControls scenes={scenes} onImport={handleImport} />
        )}

        {page === 'feed' && (
          <HeaderLink to={ROUTES.files} tip="Browse every scene as a grid">
            Files
          </HeaderLink>
        )}
        {page === 'files' && (
          <HeaderLink
            to={feedPath(feedSceneId)}
            tip="Back to the scrolling feed"
          >
            Feed
          </HeaderLink>
        )}
        {page === 'feed' && feedSceneId && (
          <HeaderLink
            to={editPath(feedSceneId)}
            tip="Open the centered scene in the editor"
          >
            Start Editing (⌘+Enter)
          </HeaderLink>
        )}
        {page === 'edit' && (
          <HeaderLink
            to={feedPath(editing?.id)}
            tip="Leave the editor and go back to this scene in the feed"
          >
            Exit (Esc)
          </HeaderLink>
        )}

        {page === 'archived' ? (
          <HeaderLink to={feedPath()} tip="Back to the scrolling feed">
            Back to feed
          </HeaderLink>
        ) : (
          page !== 'edit' && (
            <HeaderLink
              to={ROUTES.archived}
              tip="Scenes you've archived — restore them from here"
            >
              Archived
            </HeaderLink>
          )
        )}
        {page !== 'edit' && page !== 'archived' && (
          <WithTooltip tip="Start a blank scene and open it in the editor (N)">
            <button
              type="button"
              onClick={handleNewScene}
              className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm"
            >
              <Plus className="size-4" />
              New
            </button>
          </WithTooltip>
        )}
      </header>

      <main className="min-h-0 flex-1">
        {status === 'loading' ? (
          <p className="text-muted-foreground p-8 text-sm">Loading…</p>
        ) : (
          <LayoutGroup>
            <motion.div
              key={page}
              className="h-full"
              initial={{ opacity: 0, scale: page === 'files' ? 1.04 : 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
            >
              <Routes>
                <Route path="/" element={<Navigate to={feedPath()} replace />} />
                <Route
                  path={ROUTES.files}
                  element={
                    <FilesView
                      scenes={scenes}
                      onOpen={openFromFiles}
                      onReorder={reorderScenes}
                    />
                  }
                />
                <Route path={ROUTES.feed} element={feed} />
                <Route path={ROUTES.feedScene} element={feed} />
                <Route
                  path={ROUTES.editScene}
                  element={
                    editing ? (
                      <SceneEditorPane
                        key={editing.id}
                        source={editing.source}
                        onChange={(source) => updateSource(editing.id, source)}
                      />
                    ) : (
                      // The URL names a scene that was archived or never existed.
                      <Navigate to={feedPath()} replace />
                    )
                  }
                />
                <Route
                  path={ROUTES.archived}
                  element={
                    <ArchivedView scenes={scenes} onUnarchive={unarchiveScene} />
                  }
                />
                <Route path="*" element={<Navigate to={feedPath()} replace />} />
              </Routes>
            </motion.div>
          </LayoutGroup>
        )}
      </main>

      {undoId && (
        <div
          role="status"
          className="bg-popover shadow-raised fixed bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-lg border px-4 py-2 text-sm"
        >
          <span>Scene deleted</span>
          <WithTooltip tip="Put the deleted scene back in the feed">
            <button
              type="button"
              onClick={handleUndo}
              className="font-medium underline underline-offset-2"
            >
              Undo
            </button>
          </WithTooltip>
        </div>
      )}
    </div>
  )
}

/** The id awaiting an undo, cleared automatically after a few seconds. */
function useUndoToast() {
  const [undoId, setUndoId] = useState<string | null>(null)

  useEffect(
    function dismissToast() {
      if (!undoId) return
      const timer = setTimeout(() => setUndoId(null), 6000)
      return () => clearTimeout(timer)
    },
    [undoId],
  )

  return [undoId, setUndoId] as const
}

/**
 * The mark sits on a solid box, so it ships as two cuts: `logo-dark.png` is the
 * dark-boxed artwork, which is the one that reads on a light page, and
 * `logo-light.png` is the light-boxed cut for a dark page. Both are in the
 * markup and CSS picks one — swapping a `src` on toggle would flash the first
 * time each file is fetched. `logo-light.png` is also the favicon (index.html).
 */
function Logo() {
  return (
    <>
      <img src="/logo-dark.png" alt="" className="size-7 dark:hidden" />
      <img src="/logo-light.png" alt="" className="hidden size-7 dark:block" />
    </>
  )
}

function HeaderLink({
  to,
  tip,
  children,
}: {
  to: string
  /** What the destination is — the link text alone is only a name. */
  tip: string
  children: React.ReactNode
}) {
  return (
    <WithTooltip tip={tip}>
      <Link
        to={to}
        className="hover:bg-muted rounded-md border px-3 py-1.5 text-sm"
      >
        {children}
      </Link>
    </WithTooltip>
  )
}

export default App
