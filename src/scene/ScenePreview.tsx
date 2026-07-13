/**
 * A cheap static preview of a scene: a sandboxed iframe (scripts/forms/popups
 * disabled) so it costs almost nothing and never runs the craft's JS or
 * fires its listeners — the "frozen" half of the L1/L2 windowing rule and
 * what every other iframe downgrades to on entering L3 (DESIGN.md §2).
 *
 * Phase-4 placeholder: renders the live document sandboxed rather than a
 * real screenshot. The seam for Phase-5's real snapshot generation is this
 * component's `source` prop — swapping to an `<img src={snapshotUrl}>` here
 * requires no change in any caller (L1 grid, L2 non-live feed items, L3 freeze).
 */
export function ScenePreview({ source, title }: { source?: string; title: string }) {
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
