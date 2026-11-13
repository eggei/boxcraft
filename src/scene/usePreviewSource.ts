import { useEffect, useState } from "react";

/** How long typing has to pause before the stage re-renders the scene (ms). */
export const PREVIEW_DELAY = 250;

/**
 * The source the stage renders, trailing the editor's by `delay`. Every render
 * reloads the iframe — a fresh document, scripts and all — so re-rendering on
 * each keystroke is wasted work that the person can see as flicker. The editor
 * itself stays instant; only the preview waits for a pause.
 *
 * `showNow` skips the wait for one source. Tool edits (a new box, a script
 * hook) use it: they are one deliberate change, and the stage's hit-testing
 * handles should match the editor's again straight away.
 */
export function usePreviewSource(source: string, delay = PREVIEW_DELAY) {
  const [shown, showNow] = useState(source);

  useEffect(
    function catchUp() {
      if (shown === source) return;
      const timer = setTimeout(() => showNow(source), delay);
      return () => clearTimeout(timer);
    },
    [source, shown, delay],
  );

  return [shown, showNow] as const;
}
