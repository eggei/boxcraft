import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Copy, Archive, Trash2 } from 'lucide-react'
import { WithTooltip } from '@/components/ui/tooltip'
import { activeScenes, CANVAS_SIZE, type Scene } from './sceneList'
import { ScenePreview } from './ScenePreview'

/**
 * Air between one scene's canvas and the next. It holds the centered card's
 * toolbar, and it is what leaves the neighbours reading as thin tips at the top
 * and bottom of the screen rather than as half-cards.
 */
const SCENE_GAP = 64

/**
 * Distance between two cards' resting positions. Card 0 rests at scroll offset
 * 0 (the end spacers centre it), so a card's snap position is its index times
 * this — no measuring needed to scroll to one, or to tell which is centered.
 */
export const SCENE_PITCH = CANVAS_SIZE + SCENE_GAP

/**
 * A tip is smaller and fainter than the centered card: further away. How much
 * fainter is a theme question — a scene's canvas is light whatever the page is —
 * so it lives with the palette in index.css.
 */
const TIP_SCALE = 0.88
const TIP_OPACITY = 'var(--tip-opacity)'

export function SceneFeed({
  scenes,
  focusSceneId,
  onRename,
  onDuplicate,
  onArchive,
  onDelete,
  onCurrentSceneChange,
  onOpen,
}: {
  scenes: Scene[]
  /** When set, the feed scrolls this scene's card into view on mount. */
  focusSceneId?: string
  onRename: (id: string, title: string) => void
  onDuplicate: (id: string) => void
  onArchive: (id: string) => void
  /** Asks for a delete; the owner confirms it before anything is removed. */
  onDelete: (id: string) => void
  onCurrentSceneChange?: (sceneId: string) => void
  /** Clicking a card's render opens that scene for editing. */
  onOpen?: (sceneId: string) => void
}) {
  const active = activeScenes(scenes)
  const focusIndex = Math.max(
    0,
    active.findIndex((scene) => scene.id === focusSceneId),
  )
  const [currentIndex, setCurrentIndex] = useState(focusIndex)
  const scrollerRef = useRef<HTMLDivElement>(null)

  // Jump to the requested card on mount (e.g. after clicking an L1 tile).
  // Cards sit at a fixed pitch, so this is arithmetic rather than geometry —
  // robust against any transform on an ancestor (the level-change animation)
  // skewing what a measurement would say.
  useEffect(function scrollToFocus() {
    const scroller = scrollerRef.current
    if (scroller) scroller.scrollTop = focusIndex * SCENE_PITCH
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Report the centered card so the owner can put it in the URL and Start
  // Editing on the right scene.
  const currentScene = active[Math.min(currentIndex, active.length - 1)]
  useEffect(
    function reportCurrent() {
      if (currentScene) onCurrentSceneChange?.(currentScene.id)
    },
    [currentScene, onCurrentSceneChange],
  )

  // Which card is centered, read straight off the scroll offset: the nearest
  // snap position wins. Visibility can't answer this now that the neighbours
  // are on screen too — being seen no longer means being centered.
  useEffect(
    function trackCurrent() {
      const scroller = scrollerRef.current
      if (!scroller) return
      function onScroll() {
        const nearest = Math.round((scroller?.scrollTop ?? 0) / SCENE_PITCH)
        // Same index means no re-render, so this stays cheap during a scroll.
        setCurrentIndex(Math.min(Math.max(nearest, 0), active.length - 1))
      }
      scroller.addEventListener('scroll', onScroll, { passive: true })
      return () => scroller.removeEventListener('scroll', onScroll)
    },
    [active.length],
  )

  if (active.length === 0) {
    return (
      <p className="text-muted-foreground p-8 text-sm">
        No scenes yet. Press <kbd>N</kbd> or “+ New” to start one.
      </p>
    )
  }

  return (
    <div className="relative h-full overflow-hidden">
      <div
        ref={scrollerRef}
        className="h-full snap-y snap-mandatory overflow-y-auto"
      >
        {/* Empty space at each end so the first and last cards can sit in the
            middle of the screen like every other one. */}
        <EndSpacer />
        {active.map((scene, index) => {
          const isCurrent = index === currentIndex
          return (
            <section
              key={scene.id}
              data-testid="scene-card"
              style={{
                // A scene is its canvas: a fixed square. The slot is exactly
                // the artwork, so what shows at the top and bottom of the
                // screen is the neighbouring artwork itself.
                height: CANVAS_SIZE,
                maxWidth: CANVAS_SIZE,
                marginBottom: index === active.length - 1 ? 0 : SCENE_GAP,
                // Only a tip is transformed: a scaled ancestor would skew the
                // shared-layout animation, which runs off the centered card.
                transform: isCurrent ? undefined : `scale(${TIP_SCALE})`,
                opacity: isCurrent ? 1 : TIP_OPACITY,
              }}
              className="relative mx-auto w-full snap-center transition-[transform,opacity] duration-300 ease-out"
            >
              {/* The toolbar sits in the gap above its artwork, and only the
                  centered card's is shown — a tip is a sliver of a scene, not
                  something to act on. */}
              <div
                className={`absolute inset-x-0 bottom-full mb-3 flex items-center gap-2 transition-opacity duration-200 ${
                  isCurrent ? '' : 'pointer-events-none opacity-0'
                }`}
              >
                <input
                  aria-label={`Title of ${scene.title}`}
                  className="border-input focus-visible:ring-ring flex-1 rounded-md border bg-transparent px-2 py-1 text-sm outline-none focus-visible:ring-[3px]"
                  value={scene.title}
                  onChange={(event) => onRename(scene.id, event.target.value)}
                />
                <IconButton
                  label="Duplicate"
                  tip="Make a copy of this scene"
                  onClick={() => onDuplicate(scene.id)}
                >
                  <Copy className="size-4" />
                </IconButton>
                <IconButton
                  label="Archive"
                  tip="Move this scene out of the feed and into the archive"
                  onClick={() => onArchive(scene.id)}
                >
                  <Archive className="size-4" />
                </IconButton>
                <IconButton
                  label="Delete"
                  tip="Delete this scene for good — you'll be asked to confirm first"
                  onClick={() => onDelete(scene.id)}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
              <motion.button
                type="button"
                layoutId={`scene-${scene.id}`}
                aria-label={`Edit ${scene.title}`}
                onClick={() => onOpen?.(scene.id)}
                style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}
                className="focus-visible:ring-ring max-w-full shrink-0 cursor-pointer rounded-lg outline-none focus-visible:ring-2"
              >
                {/* Only the centered scene runs. A tip is a static stand-in, so
                    scrolling never spins up an iframe for a neighbour. */}
                <ScenePreview
                  source={scene.source}
                  title={scene.title}
                  live={isCurrent}
                />
              </motion.button>
            </section>
          )
        })}
        <EndSpacer />
      </div>
      {/* The tips dissolve into the page at the top and bottom edges rather than
          ending on a hard line, so the stack reads as rolling past. */}
      <div
        aria-hidden
        data-testid="feed-vignette"
        className="pointer-events-none absolute inset-0"
        style={{
          background: [
            'linear-gradient(to bottom',
            'var(--background) 0%',
            'color-mix(in oklab, var(--background), transparent) 4%',
            'transparent 11%',
            'transparent 89%',
            'color-mix(in oklab, var(--background), transparent) 96%',
            'var(--background) 100%)',
          ].join(', '),
        }}
      />
    </div>
  )
}

/**
 * Half the scroller minus half a card: the empty space an end card needs to
 * reach the middle of the screen. A percentage height resolves against the
 * scroller, so this tracks the window without measuring it.
 */
function EndSpacer() {
  return (
    <div aria-hidden style={{ height: `calc(50% - ${CANVAS_SIZE / 2}px)` }} />
  )
}

function IconButton({
  label,
  tip,
  onClick,
  children,
}: {
  /** Accessible name — the button is an icon on its own. */
  label: string
  /** What the action does, for the hover hint. */
  tip: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <WithTooltip tip={tip}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className="hover:bg-muted text-muted-foreground rounded-md border p-2"
      >
        {children}
      </button>
    </WithTooltip>
  )
}
