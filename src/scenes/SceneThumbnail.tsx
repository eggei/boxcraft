import { CANVAS_SIZE } from './sceneList'

/**
 * A scene's artwork shrunk to a square of `size` px.
 *
 * Every scene draws on a CANVAS_SIZE canvas, so rendering the source in an
 * iframe of exactly that size and scaling the whole frame down fits the artwork
 * to the box with nothing cropped and no letterboxing. Live iframes are cheap
 * enough at this size; cached static snapshots are a later concern.
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
