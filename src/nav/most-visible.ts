/** Which scene id is most visible right now, from an IntersectionObserver callback. */
export function mostVisibleId(entries: IntersectionObserverEntry[]): string | undefined {
  let best: IntersectionObserverEntry | undefined
  for (const entry of entries) {
    if (entry.isIntersecting && (!best || entry.intersectionRatio > best.intersectionRatio)) {
      best = entry
    }
  }
  return (best?.target as HTMLElement | undefined)?.dataset.sceneId
}
