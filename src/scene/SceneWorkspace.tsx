import { useEffect, useRef, useState } from 'react'
import type { EditorView } from 'codemirror'
import { SceneEditor } from './SceneEditor'
import { SceneFrame } from './SceneFrame'
import { Toolbar } from './Toolbar'
import { BoxOverlay } from './BoxOverlay'
import { SelectOverlay } from './SelectOverlay'
import { SelectionOverlay } from './SelectionOverlay'
import { Button } from '@/components/ui/button'
import { insertBox, type BoxRect } from '../box/insert-box'
import { ensureRule } from '../box/ensure-rule'
import { instrument } from '../identity/instrument'
import { renameBox } from '../identity/rename'
import { renameHandle } from '../identity/handle-field'
import { locateRule, boxAtCursor } from '../identity/rules'
import { resolvedNamesFromFrame } from './resolved-names'
import type { Tool } from './tools'

const SHORTCUTS: Record<string, Tool> = { v: 'select', b: 'box' }

/**
 * The Phase-0 render loop, the Phase-1 Box tool, and the Phase-2 identity layer:
 * one scene, side by side, with a left-edge toolbar over the rendered scene.
 *
 * The HTML document is the single source of truth (DESIGN.md §5). The editor
 * writes it, React state holds it, and the iframe renders an *instrumented* copy
 * (transient `data-bc` handles) — the source itself stays clean. Identity flows
 * one way: the editor owns the handles, the workspace lifts them to instrument
 * the render and to hit-test clicks, chips resolve/error from what actually
 * rendered, and Rename is one atomic transaction that leaves the handle intact.
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
  const [handles, setHandles] = useState<Map<string, string>>(new Map())
  const [resolvedNames, setResolvedNames] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState<string | null>(null)
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
   * step) and the cursor lands *inside* the new rule ready to type (DESIGN.md §7).
   * Tool then reverts to Select (§6).
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

  // Read which handles actually rendered, so chips resolve/error correctly. Runs
  // on frame load and whenever the handle set changes (DESIGN.md §5).
  useEffect(syncResolvedNames, [handles, source])
  function syncResolvedNames() {
    setResolvedNames(resolvedNamesFromFrame(frameRef.current, handles))
  }

  /**
   * Select a box (or clear selection). On select we jump the editor to the box's
   * rule; if the rule was hand-deleted we re-create a minimal one so "style this
   * box" always has a target (DESIGN.md §7).
   */
  function selectBox(name: string | null) {
    setSelected(name)
    const view = viewRef.current
    if (!view || !name) return

    const current = view.state.doc.toString()
    const rule = locateRule(current, name)
    if (rule) {
      view.dispatch({ selection: { anchor: rule.from }, scrollIntoView: true })
      return
    }
    const ensured = ensureRule(current, name)
    if (ensured) {
      view.dispatch({
        changes: ensured.change,
        selection: { anchor: ensured.cursorOffset },
        scrollIntoView: true,
      })
    }
  }

  // Editor→scene highlight: the box whose rule contains the cursor (DESIGN.md §7).
  function handleCursor(offset: number) {
    setHighlighted(boxAtCursor(source, offset, new Set(handles.keys())))
  }

  /**
   * Rename the selected box everywhere at once (class + CSS selector) in a single
   * transaction — one `⌘Z` reverts it — carrying the rename annotation so the
   * handle's marker follows the new name without the handle changing (DESIGN.md §5).
   */
  function renameSelected(newName: string) {
    const view = viewRef.current
    if (!view || !selected) return
    const handle = handles.get(selected)
    const { changes } = renameBox(view.state.doc.toString(), selected, newName)
    if (!changes.length || !handle) return
    view.dispatch({ changes, annotations: renameHandle.of({ handle, name: newName }) })
    setSelected(newName)
  }

  function handleRenameSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next = String(new FormData(event.currentTarget).get('name') ?? '').trim()
    if (next && next !== selected) renameSelected(next)
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
          onHandlesChange={setHandles}
          onCursorChange={handleCursor}
          resolvedNames={resolvedNames}
        />
      </div>
      <div className="relative w-1/2">
        <Toolbar tool={tool} onToolChange={setTool} />
        <SceneFrame source={instrument(source, handles)} frameRef={frameRef} onLoad={syncResolvedNames} />
        <SelectionOverlay
          frame={frameRef.current}
          handles={handles}
          selected={selected}
          highlighted={highlighted}
        />
        {tool === 'select' && (
          <SelectOverlay frame={frameRef.current} handles={handles} onSelect={selectBox} />
        )}
        {tool === 'box' && <BoxOverlay frame={frameRef.current} onCreate={createBox} />}
        {selected && (
          <form
            data-testid="rename-form"
            onSubmit={handleRenameSubmit}
            className="absolute right-3 top-3 z-30 flex gap-1 rounded-lg border border-border bg-background/90 p-1 shadow-lg backdrop-blur"
          >
            <input
              key={selected}
              name="name"
              aria-label="Rename box"
              defaultValue={selected}
              className="h-8 w-32 rounded-md border border-input bg-transparent px-2 text-sm"
            />
            <Button type="submit" size="sm">
              Rename
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
