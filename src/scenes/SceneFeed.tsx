import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Copy, Archive, Trash2 } from 'lucide-react'
import { activeScenes, CANVAS_SIZE, type Scene } from './sceneList'
import { ScenePreview } from './ScenePreview'

/** How many neighbors on each side of the current scene stay live. */
const WINDOW = 1

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
  const cardRefs = useRef<Array<HTMLElement | null>>([])
  const scrollerRef = useRef<HTMLDivElement>(null)

  // Jump to the requested card on mount (e.g. after clicking an L1 tile). Each
  // card is exactly one viewport tall, so scroll by index — robust against any
  // transform on an ancestor (the level-change animation) skewing geometry.
  useEffect(function scrollToFocus() {
    const scroller = scrollerRef.current
    if (scroller) scroller.scrollTop = focusIndex * scroller.clientHeight
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

  // Track which card is centered so we can window the live iframes around it.
  useEffect(
    function trackCurrent() {
      const nodes = cardRefs.current.filter((n): n is HTMLElement => !!n)
      if (nodes.length === 0 || typeof IntersectionObserver === 'undefined') {
        return
      }
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
              const index = Number(
                (entry.target as HTMLElement).dataset.index,
              )
              setCurrentIndex(index)
            }
          }
        },
        { threshold: [0.5] },
      )
      nodes.forEach((node) => observer.observe(node))
      return () => observer.disconnect()
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
    <div
      ref={scrollerRef}
      className="h-full snap-y snap-mandatory overflow-y-auto"
    >
      {active.map((scene, index) => (
        <section
          key={scene.id}
          data-index={index}
          data-testid="scene-card"
          ref={(node) => {
            cardRefs.current[index] = node
          }}
          className="flex h-full snap-start flex-col items-center justify-center gap-3 p-6"
        >
          {/* The row tracks the artwork's width so both read as one card. */}
          <div
            className="flex w-full items-center gap-2"
            style={{ maxWidth: CANVAS_SIZE }}
          >
            <input
              aria-label={`Title of ${scene.title}`}
              className="border-input focus-visible:ring-ring flex-1 rounded-md border bg-transparent px-2 py-1 text-sm outline-none focus-visible:ring-[3px]"
              value={scene.title}
              onChange={(event) => onRename(scene.id, event.target.value)}
            />
            <IconButton label="Duplicate" onClick={() => onDuplicate(scene.id)}>
              <Copy className="size-4" />
            </IconButton>
            <IconButton label="Archive" onClick={() => onArchive(scene.id)}>
              <Archive className="size-4" />
            </IconButton>
            <IconButton label="Delete" onClick={() => onDelete(scene.id)}>
              <Trash2 className="size-4" />
            </IconButton>
          </div>
          {/* A scene is its 400×400 canvas: fixed size, centered in the
              viewport, rather than stretched to whatever height is going. */}
          <motion.button
            type="button"
            layoutId={`scene-${scene.id}`}
            aria-label={`Edit ${scene.title}`}
            onClick={() => onOpen?.(scene.id)}
            style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}
            className="focus-visible:ring-ring max-w-full shrink-0 cursor-pointer rounded-lg outline-none focus-visible:ring-2"
          >
            <ScenePreview
              source={scene.source}
              title={scene.title}
              live={Math.abs(index - currentIndex) <= WINDOW}
            />
          </motion.button>
        </section>
      ))}
    </div>
  )
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="hover:bg-muted text-muted-foreground rounded-md border p-2"
    >
      {children}
    </button>
  )
}
