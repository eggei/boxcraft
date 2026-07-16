import { useEffect, useRef, useState } from 'react'
import { Copy, Archive, Trash2 } from 'lucide-react'
import { activeScenes, type Scene } from './sceneList'
import { ScenePreview } from './ScenePreview'

/** How many neighbors on each side of the current scene stay live. */
const WINDOW = 1

export function SceneFeed({
  scenes,
  onRename,
  onDuplicate,
  onArchive,
  onDelete,
}: {
  scenes: Scene[]
  onRename: (id: string, title: string) => void
  onDuplicate: (id: string) => void
  onArchive: (id: string) => void
  onDelete: (id: string) => void
}) {
  const active = activeScenes(scenes)
  const [currentIndex, setCurrentIndex] = useState(0)
  const cardRefs = useRef<Array<HTMLElement | null>>([])

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
    <div className="h-full snap-y snap-mandatory overflow-y-auto">
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
          <div className="flex w-full max-w-[520px] items-center gap-2">
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
          <div className="aspect-square w-full max-w-[520px] flex-1">
            <ScenePreview
              source={scene.source}
              title={scene.title}
              live={Math.abs(index - currentIndex) <= WINDOW}
            />
          </div>
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
