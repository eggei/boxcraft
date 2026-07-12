import type { Ref } from 'react'

/**
 * Renders a scene's HTML source in a genuinely isolated <iframe> (DESIGN.md §3).
 *
 * `srcdoc` gives the source its own document and browsing context: the user's
 * HTML/CSS/JS run in a real separate document, and any `console.log` inside a
 * `<script>` reaches the real devtools console — no in-app emulation. Changing
 * `source` reloads the frame, so the render is a pure function of the source.
 *
 * `frameRef` exposes the element so the Box tool can read the rendered `.canvas`
 * rect for canvas-relative coordinate mapping (DESIGN.md §7).
 */
export function SceneFrame({
  source,
  frameRef,
}: {
  source: string
  frameRef?: Ref<HTMLIFrameElement>
}) {
  return <iframe ref={frameRef} title="scene" srcDoc={source} className="h-full w-full border-0" />
}
