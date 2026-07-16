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
        className="pointer-events-none h-full w-full rounded-lg border bg-white"
      />
    )
  }

  return (
    <div
      aria-label={`${title} (preview)`}
      className="flex h-full w-full items-center justify-center rounded-lg border bg-white"
    >
      <div className="bg-muted h-[280px] w-[280px] rounded-md" />
    </div>
  )
}
