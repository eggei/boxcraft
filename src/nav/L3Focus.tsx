import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Scene } from '../persistence/scene-store'
import { useSceneStore } from '../persistence/SceneStoreContext'
import { createAutosave, type Autosave } from '../persistence/autosave'
import { useNav } from './NavContext'
import { SceneWorkspace } from '../scene/SceneWorkspace'

/**
 * L3 — editing (DESIGN.md §2): the one scene, live, with the editor + tools.
 * Every other scene is elsewhere in the tree (L1/L2 unmount when the shell
 * switches levels) — so "every other iframe freezes to static" falls out of
 * the shell only ever mounting one level at a time, not extra bookkeeping here.
 */
export function L3Focus({ id }: { id: string }) {
  const store = useSceneStore()
  const { dispatch } = useNav()
  const [scene, setScene] = useState<Scene | null>(null)
  const sceneRef = useRef<Scene | null>(null)
  const autosaveRef = useRef<Autosave<string> | null>(null)

  useEffect(loadScene, [store, id])
  function loadScene() {
    let cancelled = false
    setScene(null)
    store.get(id).then((loaded) => {
      if (cancelled || !loaded) return
      sceneRef.current = loaded
      setScene(loaded)
    })
    return () => {
      cancelled = true
    }
  }

  // One debounced, failure-retrying autosave per (store, id) — coalesces
  // rapid keystroke saves into a single write, and flushes any pending edit
  // before the scene is torn down (id change or unmount) so switching scenes
  // mid-edit can never drop the last keystrokes (Phase 5 — autosave hardening).
  useEffect(setUpAutosave, [store, id])
  function setUpAutosave() {
    const autosave = createAutosave<string>(
      (source) => store.put({ ...(sceneRef.current as Scene), source }),
      { onError: (error) => console.error('BoxCraft: autosave failed', error) },
    )
    autosaveRef.current = autosave
    return () => {
      autosave.flush()
      autosaveRef.current = null
    }
  }

  useEffect(bindExitShortcut, [dispatch])
  function bindExitShortcut() {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') dispatch({ type: 'EXIT_EDITING' })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }

  if (!scene) return <div className="p-4 text-muted-foreground">Loading…</div>

  return (
    <motion.div layoutId={`scene-${id}`} className="flex h-full w-full flex-col">
      <div className="flex items-center gap-2 border-b border-border p-2 text-sm">
        <Button variant="ghost" size="icon-sm" aria-label="Back to feed" onClick={() => dispatch({ type: 'EXIT_EDITING' })}>
          <ArrowLeft />
        </Button>
        <span className="text-muted-foreground">{scene.title}</span>
      </div>
      <div className="min-h-0 flex-1">
        <SceneWorkspace
          initialSource={scene.source}
          onSourceChange={(source) => {
            if (sceneRef.current) autosaveRef.current?.schedule(source)
          }}
        />
      </div>
    </motion.div>
  )
}
