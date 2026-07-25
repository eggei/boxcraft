// The three navigation levels and the URL map they live behind.
//
// L1 (files) is furthest out, L3 (edit) is closest in. Every page has a real
// route, so navigation is a URL change — header links, clicking a tile or a
// card, Esc — and this module is the single place that spells those URLs. The
// helpers are pure so the header can decide what to show from a pathname alone.

export const LEVELS = ['files', 'feed', 'edit'] as const

export type Level = (typeof LEVELS)[number]

/** Every page the app can show. The archive sits outside the zoom levels. */
export type Page = Level | 'archived'

/** Route patterns, in the shape react-router matches on. */
export const ROUTES = {
  files: '/files',
  feed: '/feed',
  /** The feed, scrolled to (and tracking) one scene. */
  feedScene: '/feed/:sceneId',
  editScene: '/edit/:sceneId',
  archived: '/archived',
} as const

/** The feed, optionally focused on a scene. */
export function feedPath(sceneId?: string): string {
  return sceneId ? `/feed/${sceneId}` : ROUTES.feed
}

export function editPath(sceneId: string): string {
  return `/edit/${sceneId}`
}

/**
 * Which page a pathname shows. Unknown paths read as the feed — it is both the
 * landing page and where the redirect route sends them.
 */
export function pageForPath(pathname: string): Page {
  if (pathname === ROUTES.files) return 'files'
  if (pathname === ROUTES.archived) return 'archived'
  if (pathname.startsWith('/edit/')) return 'edit'
  return 'feed'
}
