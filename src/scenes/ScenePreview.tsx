/**
 * Renders a scene either as a live iframe — only the feed's centered card gets
 * one — or as a cheap static stand-in. Keeping the live set to one is what keeps
 * the feed fast no matter how many scenes exist, and a tip peeking in at the
 * edge of the screen has nothing to gain from running. Real snapshot thumbnails
 * are a Phase 5 concern; the static preview here is a non-iframe placeholder.
 *
 * The static card carries a shadow the live one doesn't need: a tip is dimmed to
 * read as far away, and on the light theme the canvas is barely off the page
 * colour, so its own edge is what tells you another scene is there.
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
      className="bg-canvas shadow-raised flex h-full w-full items-center justify-center rounded-lg border"
    >
      <div className="bg-muted h-[280px] w-[280px] rounded-md" />
    </div>
  )
}
