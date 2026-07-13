import { hitTestBox } from './hit-test'

/**
 * A transparent click-capture layer over the rendered scene, mounted while the
 * Select tool is active. A click is hit-tested through the instrumented render
 * to the managed box under the pointer and reported (DESIGN.md §6); a click that
 * misses every box clears the selection. Boxes are never dragged or resized —
 * selection exists for Rename / jump-to-code only.
 */
export function SelectOverlay({
  frame,
  handles,
  onSelect,
}: {
  frame: HTMLIFrameElement | null
  handles: Map<string, string>
  onSelect: (name: string | null) => void
}) {
  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    onSelect(hitTestBox(frame, event.clientX, event.clientY, handles))
  }

  return (
    <div
      data-testid="select-overlay"
      className="absolute inset-0 z-10 cursor-default"
      onClick={handleClick}
    />
  )
}
