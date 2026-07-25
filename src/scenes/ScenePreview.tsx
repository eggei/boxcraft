/**
 * Renders a scene either as a live iframe (windowed: current ± N neighbors) or
 * as a cheap static preview. Keeping the live set small is what keeps the feed
 * fast no matter how many scenes exist. Real snapshot thumbnails are a Phase 5
 * concern; the static preview here is a lightweight non-iframe placeholder.
 */
export function ScenePreview({
  source,
  title,
  live,
}: {
  source: string
  title: string
  live: boolean
}) {
  if (live) {
    return (
      <iframe
        title={title}
        srcDoc={source}
        className="bg-canvas pointer-events-none h-full w-full rounded-lg border"
      />
    )
  }

  return (
    <div
      aria-label={`${title} (preview)`}
      className="bg-canvas flex h-full w-full items-center justify-center rounded-lg border"
    >
      <div className="bg-muted h-[280px] w-[280px] rounded-md" />
    </div>
  )
}
