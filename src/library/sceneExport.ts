// Getting one scene out of BoxCraft. A scene's source is already a complete
// HTML document, so exporting it needs no format of its own: the file you
// download, the text you copy and the page a new tab opens are all the same
// clean document, with nothing BoxCraft-specific left in it.

import { serialize } from '@/scene/document'
import { downloadFile } from './transfer'

/** What a scene with no usable title is saved as. */
const FALLBACK_SLUG = 'scene'

/** Long enough to stay recognizable, short enough for any file system. */
const MAX_SLUG_LENGTH = 60

/**
 * How long a new tab's blob URL stays valid. The tab only needs it to load the
 * page once; after that the document lives on in the tab without it.
 */
const OPEN_URL_LIFETIME_MS = 60_000

/**
 * A title as a file-name-safe slug: lowercase ASCII letters and digits joined
 * by single dashes. Accents are folded to their base letters ("Café" →
 * "cafe"); anything else that isn't a letter or digit becomes a separator.
 */
export function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/^-+|-+$/g, '')
  return slug || FALLBACK_SLUG
}

/** The file a scene downloads as, e.g. `neon-ring.html`. */
export function sceneFilename(title: string): string {
  return `${slugify(title)}.html`
}

/**
 * The export-ready document. The stored source is already clean, but the
 * render-only instrumentation is stripped anyway, so an export can never carry
 * it out even if a caller hands over the copy the stage was given.
 */
export function sceneHtml(source: string): string {
  return serialize(source)
}

/** The document as an HTML blob, ready for a download or a blob URL. */
export function sceneBlob(source: string): Blob {
  return new Blob([sceneHtml(source)], { type: 'text/html' })
}

/** Save the scene as a standalone `.html` file. */
export function downloadScene(title: string, source: string): void {
  downloadFile(sceneFilename(title), sceneHtml(source), 'text/html')
}

/** Put the scene's HTML on the clipboard. Rejects if the browser refuses. */
export function copySceneHtml(source: string): Promise<void> {
  return navigator.clipboard.writeText(sceneHtml(source))
}

/**
 * Open the scene on its own in a new tab, from a blob URL that is revoked once
 * the tab has had time to load it.
 */
export function openSceneInNewTab(source: string): void {
  const url = URL.createObjectURL(sceneBlob(source))
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), OPEN_URL_LIFETIME_MS)
}
