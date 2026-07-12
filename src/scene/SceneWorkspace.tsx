import { useEffect, useRef, useState } from 'react'
import type { EditorView } from 'codemirror'
import { SceneEditor } from './SceneEditor'
import { SceneFrame } from './SceneFrame'
import { Toolbar } from './Toolbar'
import { BoxOverlay } from './BoxOverlay'
import { insertBox, type BoxRect } from '../box/insert-box'
import type { Tool } from './tools'

const SHORTCUTS: Record<string, Tool> = { v: 'select', b: 'box' }

/**
 * The Phase-0 render loop plus the Phase-1 Box tool: one scene, side by side,
 * with a left-edge toolbar over the rendered scene.
 *
 * The HTML document is the single source of truth (DESIGN.md §5). The editor
 * writes it, React state holds it, and the iframe is a pure render of it — so
 * the scene can never drift from the code, because it *is* the code, rendered.
 * The Box tool is just another writer: a gesture becomes a text insertion the
 * same render loop then displays.
 */
export function SceneWorkspace({
  initialSource,
  onSourceChange,
}: {
  initialSource: string
  onSourceChange?: (source: string) => void
}) {
  const [source, setSource] = useState(initialSource)
  const [tool, setTool] = useState<Tool>('select')
  const viewRef = useRef<EditorView | null>(null)
  const frameRef = useRef<HTMLIFrameElement | null>(null)

  function handleChange(next: string) {
    setSource(next)
    onSourceChange?.(next)
  }

  useEffect(bindToolShortcuts, [])
  function bindToolShortcuts() {
    document.addEventListener('keydown', handleToolShortcut)
    return () => document.removeEventListener('keydown', handleToolShortcut)
  }

  // Single-key tool shortcuts (DESIGN.md §6): `V` Select, `B` Box. Ignored while
  // typing in the editor or any input, and when a modifier is held, so they
  // never steal keystrokes meant for the code.
  function handleToolShortcut(event: KeyboardEvent) {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const target = event.target
    if (
      target instanceof HTMLElement &&
      target.closest('.cm-editor, input, textarea, [contenteditable]')
    ) {
      return
    }
    const next = SHORTCUTS[event.key.toLowerCase()]
    if (!next) return
    event.preventDefault()
    setTool(next)
  }

  /**
   * Turn a completed gesture into a box. The insertion is applied as a single
   * editor transaction so it flows through the same onChange loop (one undo
   * step) and the cursor lands *inside* the new rule ready to type — the
   * "instant CSS" moment (DESIGN.md §7). Tool then reverts to Select (§6).
   */
  function createBox(rect: BoxRect) {
    const view = viewRef.current
    if (view) {
      const current = view.state.doc.toString()
      const { source: next, cursorOffset } = insertBox(current, rect)
      view.dispatch({
        changes: { from: 0, to: current.length, insert: next },
        selection: { anchor: cursorOffset },
        scrollIntoView: true,
      })
      view.focus()
    } else {
      handleChange(insertBox(source, rect).source)
    }
    setTool('select')
  }

  return (
    <div className="flex h-full">
      <div className="w-1/2 overflow-auto border-r border-border">
        <SceneEditor
          value={source}
          onChange={handleChange}
          onReady={(view) => {
            viewRef.current = view
          }}
        />
      </div>
      <div className="relative w-1/2">
        <Toolbar tool={tool} onToolChange={setTool} />
        <SceneFrame source={source} frameRef={frameRef} />
        {tool === 'box' && <BoxOverlay frame={frameRef.current} onCreate={createBox} />}
      </div>
    </div>
  )
}
