import { expect } from 'vitest'
import { waitFor } from '@testing-library/react'

/**
 * Drive a click on a box *inside the scene iframe*, the way a real user click
 * lands now that BoxCraft listens on the iframe's own document instead of a
 * capture overlay (DESIGN.md §2, "the one scene, live").
 *
 * jsdom fires the iframe `load` (so the workspace attaches its listener) but
 * does not parse `srcdoc` into `contentDocument`, so we inject a `[data-bc]`
 * element carrying the box's real handle — read from the instrumented `srcdoc`
 * — and dispatch a bubbling click on it. Wrapped in `waitFor` so it retries
 * until the load listener is in place.
 */
export async function clickBoxInScene(frame: HTMLIFrameElement): Promise<void> {
  await waitFor(() => expect(frame.getAttribute('srcdoc')).toContain('data-bc='))
  const handle = frame.getAttribute('srcdoc')!.match(/data-bc="([^"]+)"/)![1]

  await waitFor(() => {
    const doc = frame.contentDocument!
    let el = doc.querySelector(`[data-bc="${handle}"]`)
    if (!el) {
      el = doc.createElement('div')
      el.setAttribute('data-bc', handle)
      doc.body.appendChild(el)
    }
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

/** Click empty scene space (no box under the pointer) — clears selection. */
export function clickEmptyScene(frame: HTMLIFrameElement): void {
  frame.contentDocument!.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}
