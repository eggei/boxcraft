import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { html } from '@codemirror/lang-html'
import { createHandleField, handleByName } from '../identity/handle-field'
import { createChipDecorations, setResolvedNames } from '../identity/chip-decorations'

/**
 * CodeMirror 6 editor bound to a scene's HTML source.
 *
 * The document IS the source of truth (DESIGN.md §5): every edit is reported
 * via `onChange`, and the parent feeds the current value back through `value`.
 * External value changes (e.g. loading a different scene) replace the document;
 * echoes of the user's own edits are ignored so typing is never clobbered.
 */
export function SceneEditor({
  value,
  onChange,
  onReady,
  onHandlesChange,
  onCursorChange,
  resolvedNames,
}: {
  value: string
  onChange: (source: string) => void
  /**
   * Handed the live `EditorView` once mounted, so the workspace can drive it
   * imperatively (Phase 1: auto-scroll/focus/cursor after a box insert; Phase 2:
   * range-marker handles and Rename). DESIGN.md §5 anticipates this access.
   */
  onReady?: (view: EditorView) => void
  /**
   * Reports the live `box-name → handle` map whenever it changes. The editor
   * owns the handle field (DESIGN.md §5); the workspace lifts this map to
   * instrument the render, without the handles ever entering the document.
   */
  onHandlesChange?: (handles: Map<string, string>) => void
  /**
   * Reports the primary cursor offset whenever it moves. Drives the scene→editor
   * highlight (cursor in a box's rule → that box highlights, DESIGN.md §7).
   */
  onCursorChange?: (offset: number) => void
  /**
   * The box names that currently resolve to a live element in the render.
   * Drives chip vs. error coloring of managed tokens (DESIGN.md §5). Derived
   * from the iframe by the workspace and pushed in as editor state.
   */
  resolvedNames?: Set<string>
}) {
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  const onHandlesChangeRef = useRef(onHandlesChange)
  onHandlesChangeRef.current = onHandlesChange
  const onCursorChangeRef = useRef(onCursorChange)
  onCursorChangeRef.current = onCursorChange

  // Mount once; external value sync is handled by the effect below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(mountEditor, [])
  function mountEditor() {
    const handleField = createHandleField()
    const chips = createChipDecorations(handleField)
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          html(),
          handleField,
          chips.extension,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString())
              onHandlesChangeRef.current?.(handleByName(update.state.field(handleField)))
            }
            if (update.docChanged || update.selectionSet) {
              onCursorChangeRef.current?.(update.state.selection.main.head)
            }
          }),
        ],
      }),
      parent: host.current!,
    })
    viewRef.current = view
    onReadyRef.current?.(view)
    onHandlesChangeRef.current?.(handleByName(view.state.field(handleField)))
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }

  useEffect(syncExternalValue, [value])
  function syncExternalValue() {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (value !== current) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
    }
  }

  useEffect(syncResolvedNames, [resolvedNames])
  function syncResolvedNames() {
    const view = viewRef.current
    if (!view || !resolvedNames) return
    view.dispatch({ effects: setResolvedNames.of(resolvedNames) })
  }

  return <div data-testid="scene-editor" ref={host} />
}
