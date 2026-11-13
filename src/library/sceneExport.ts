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

/** Escape text for a double-quoted HTML attribute value or element text. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * The page a new tab opens: a script-free shell that shows the scene in a
 * full-window `sandbox="allow-scripts"` frame.
 *
 * Opening the scene's own document from a blob URL would not do: a blob URL
 * takes the origin of the page that made it, so the scene's scripts would run
 * as BoxCraft and could read the library in IndexedDB and localStorage — and a
 * scene can arrive from someone else's library file. The shell is same-origin
 * but runs nothing; the frame inside it, without `allow-same-origin`, gets an
 * opaque origin, so the scene still animates and runs its scripts with no way
 * back into the app.
 */
export function sceneViewerHtml(title: string, source: string): string {
  return [
    '<!doctype html>',
    '<html><head><meta charset="utf-8">',
    `<title>${escapeHtml(title || 'Scene')}</title>`,
    '<style>html,body{margin:0;height:100%}iframe{display:block;border:0;width:100%;height:100%}</style>',
    '</head><body>',
    `<iframe sandbox="allow-scripts" title="${escapeHtml(title || 'Scene')}" srcdoc="${escapeHtml(sceneHtml(source))}"></iframe>`,
    '</body></html>',
  ].join('\n')
}

/**
 * Open the scene on its own in a new tab, sandboxed (see sceneViewerHtml), from
 * a blob URL that is revoked once the tab has had time to load it.
 */
export function openSceneInNewTab(title: string, source: string): void {
  const viewer = new Blob([sceneViewerHtml(title, source)], { type: 'text/html' })
  const url = URL.createObjectURL(viewer)
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), OPEN_URL_LIFETIME_MS)
}
