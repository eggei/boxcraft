/**
 * How a feed card shows its scene:
 * - `live`: the centered card. The scene runs, scripts and all.
 * - `still`: the immediate neighbors, the tips peeking in at the top and bottom
 *   of the screen. The artwork renders with scripts off, so CSS still draws and
 *   animates but nothing the scene computes in JS shows up.
 * - `placeholder`: every card further out. Nobody can see it, so it gets no
 *   frame at all.
 */
export type PreviewMode = 'live' | 'still' | 'placeholder'

/**
 * Renders a scene as a live iframe, a script-free still, or a cheap stand-in,
 * depending on how close its card is to the center of the feed. Only one frame
 * ever runs scripts and at most two more render around it, which is what keeps
 * the feed fast no matter how many scenes exist.
 *
 * The live frame may run the scene's scripts (a scene is code, and some draw
 * with it), but `allow-scripts` without `allow-same-origin` gives it an opaque
 * origin: no reach into the app's page, localStorage or IndexedDB library. A
 * still's empty sandbox grants nothing, so a neighbor can't loop or burn CPU
 * just by being near the center.
 *
 * A still or placeholder card carries a shadow the live one doesn't need: a tip
 * is dimmed to read as far away, and on the light theme the canvas is barely
 * off the page color, so its own edge is what tells you another scene is there.
 */
export function ScenePreview({
  source,
  title,
  mode,
}: {
  source: string
  title: string
  mode: PreviewMode
}) {
  if (mode === 'live') {
    return (
      <iframe
        title={title}
        srcDoc={source}
        sandbox="allow-scripts"
        className="bg-canvas pointer-events-none h-full w-full rounded-lg border"
      />
    )
  }

  return (
    <div
      aria-label={`${title} (preview)`}
      className="bg-canvas shadow-raised flex h-full w-full items-center justify-center overflow-hidden rounded-lg border"
    >
      {mode === 'still' ? (
        // The card is the scene's canvas size, like the live frame, so the
        // artwork fits it unscaled.
        <iframe
          title={`${title} (still)`}
          srcDoc={source}
          sandbox=""
          tabIndex={-1}
          className="pointer-events-none h-full w-full border-0"
        />
      ) : (
        <div className="bg-muted h-[280px] w-[280px] rounded-md" />
      )}
    </div>
  )
}
