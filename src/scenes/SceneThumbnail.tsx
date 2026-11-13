import { CANVAS_SIZE } from './sceneList'

/**
 * A scene's artwork shrunk to a square of `size` px.
 *
 * Every scene draws on a CANVAS_SIZE canvas, so rendering the source in an
 * iframe of exactly that size and scaling the whole frame down fits the artwork
 * to the box with nothing cropped and no letterboxing. Live iframes are cheap
 * enough at this size; cached static snapshots are a later concern.
 *
 * The frame is sandboxed with no permissions at all, so the scene's scripts
 * never run. CSS animations still play, which is all a browse view needs, while
 * a scene that loops forever can't freeze the page and an imported one can't
 * reach the app: its title, localStorage or the IndexedDB library.
 */
export function SceneThumbnail({
  source,
  title,
  size,
}: {
  source: string
  title: string
  size: number
}) {
  return (
    <div
      className="bg-canvas relative shrink-0 overflow-hidden rounded-md border bg-white"
      style={{ width: size, height: size }}
    >
      <iframe
        title={`${title} snapshot`}
        srcDoc={source}
        sandbox=""
        tabIndex={-1}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        style={{
          transform: `scale(${size / CANVAS_SIZE})`,
          transformOrigin: 'top left',
        }}
        className="pointer-events-none absolute left-0 top-0 border-0"
      />
    </div>
  )
}
