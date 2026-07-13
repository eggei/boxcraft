import { useEffect, useLayoutEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { useSceneList } from '../scenes/SceneListContext'
import { useSceneActions } from '../scenes/SceneActionsContext'
import { useNav } from './NavContext'
import { useSceneSource } from '../persistence/use-scene-source'
import { useSceneSnapshot } from '../persistence/use-scene-snapshot'
import { SceneFrame } from '../scene/SceneFrame'
import { ScenePreview } from '../scene/ScenePreview'
import { captureSnapshot } from '../scene/capture-snapshot'
import { liveWindowIds } from './live-window'
import { mostVisibleId } from './most-visible'
import { SCENE_TRANSITION } from './scene-transition'

/** Live neighbors kept mounted on either side of the current scene (DESIGN.md §2). */
const LIVE_NEIGHBORS = 1

/** How often a live feed item recaptures its own preview snapshot (DESIGN.md §10). */
const SNAPSHOT_CAPTURE_INTERVAL_MS = 4000

/**
 * L2 — snap-feed (DESIGN.md §2): scroll-snap list, current scene ± neighbors
 * live, everything else a cheap static preview. Live here means rendered and
 * ready, not editable — no tools, no click-to-select (that's L3).
 */
export function L2SnapFeed({ onStartEditing }: { onStartEditing: (id: string) => void }) {
  const { scenes } = useSceneList()
  const { state, dispatch } = useNav()
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef(new Map<string, HTMLElement>())

  useEffect(defaultToFirstScene, [scenes, state.currentId])
  function defaultToFirstScene() {
    if (state.currentId === null && scenes.length > 0) {
      dispatch({ type: 'SCROLL_TO', id: scenes[0].id })
    }
  }

  const currentIdRef = useRef(state.currentId)
  currentIdRef.current = state.currentId
  useEffect(bindStartEditingShortcut, [onStartEditing])
  function bindStartEditingShortcut() {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && currentIdRef.current) {
        onStartEditing(currentIdRef.current)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }

  // The feed always mounts scrolled to the top — jump to the scene we're
  // meant to be centered on (e.g. from an L1 click) *before* paint, so the
  // IntersectionObserver below reports that scene, not whatever the top of
  // the list happens to be (DESIGN.md §2: "drops into the feed centered on it").
  const jumpedToInitial = useRef(false)
  useLayoutEffect(jumpToInitialScene)
  function jumpToInitialScene() {
    if (jumpedToInitial.current || !state.currentId) return
    const el = itemRefs.current.get(state.currentId)
    if (!el) return
    el.scrollIntoView?.({ block: 'center' })
    jumpedToInitial.current = true
  }

  useEffect(observeCenteredItem, [scenes])
  function observeCenteredItem() {
    if (typeof IntersectionObserver === 'undefined' || !containerRef.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        const id = mostVisibleId(entries)
        if (id) dispatch({ type: 'SCROLL_TO', id })
      },
      { root: containerRef.current, threshold: 0.6 },
    )
    itemRefs.current.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }

  const liveIds = liveWindowIds(
    scenes.map((s) => s.id),
    state.currentId,
    LIVE_NEIGHBORS,
    'L2',
  )

  return (
    <div ref={containerRef} className="h-full w-full snap-y snap-mandatory overflow-y-auto">
      {scenes.map((scene) => (
        <div
          key={scene.id}
          ref={(el) => {
            if (el) itemRefs.current.set(scene.id, el)
            else itemRefs.current.delete(scene.id)
          }}
          data-scene-id={scene.id}
          className="flex h-full w-full snap-center flex-col items-center justify-center gap-3"
        >
          <FeedItem id={scene.id} title={scene.title} live={liveIds.has(scene.id)} />
          <span className="text-sm text-muted-foreground">{scene.title}</span>
          {state.currentId === scene.id && (
            <Button onClick={() => onStartEditing(scene.id)}>Start Editing (⌘+Enter)</Button>
          )}
        </div>
      ))}
    </div>
  )
}

function FeedItem({ id, title, live }: { id: string; title: string; live: boolean }) {
  const source = useSceneSource(id)
  const snapshot = useSceneSnapshot(id)
  const { saveSnapshot } = useSceneActions()
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function capture() {
    const frame = frameRef.current
    if (!frame) return
    captureSnapshot(frame).then((dataUrl) => {
      if (dataUrl) saveSnapshot(id, dataUrl)
    })
  }

  function startCapturing() {
    capture()
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(capture, SNAPSHOT_CAPTURE_INTERVAL_MS)
  }

  // Stop recapturing the moment this item leaves the live window; unmounting
  // the frame doesn't clear the interval on its own since the ref just goes null.
  useEffect(() => {
    if (!live && timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [live])

  return (
    <motion.div
      layoutId={`scene-${id}`}
      transition={SCENE_TRANSITION}
      className="aspect-square w-full max-w-lg overflow-hidden rounded-xl border border-border bg-muted"
    >
      {live ? (
        <SceneFrame source={source ?? ''} frameRef={frameRef} onLoad={startCapturing} />
      ) : (
        <ScenePreview source={source} snapshot={snapshot} title={title} />
      )}
    </motion.div>
  )
}
