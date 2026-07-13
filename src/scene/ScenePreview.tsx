/**
 * A cheap static preview of a scene — the "frozen" half of the L1/L2
 * windowing rule and what every other iframe downgrades to on entering L3
 * (DESIGN.md §2). Prefers a cached `snapshot` (a real captured image,
 * DESIGN.md §10 — see `captureSnapshot`); falls back to a sandboxed iframe
 * (scripts/forms/popups disabled, so it's cheap and never runs the craft's JS)
 * for a scene that hasn't been captured yet.
 */
export function ScenePreview({
  source,
  snapshot,
  title,
}: {
  source?: string
  snapshot?: string
  title: string
}) {
  if (snapshot) {
    return <img src={snapshot} alt={`${title} preview`} className="h-full w-full object-cover" />
  }
  if (source === undefined) {
    return <div className="h-full w-full animate-pulse bg-muted" />
  }
  return (
    <iframe
      title={`${title} preview`}
      srcDoc={source}
      sandbox=""
      tabIndex={-1}
      aria-hidden="true"
      className="h-full w-full border-0 pointer-events-none select-none"
    />
  )
}
