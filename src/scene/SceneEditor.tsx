import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { html } from '@codemirror/lang-html'

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
}: {
  value: string
  onChange: (source: string) => void
  /**
   * Handed the live `EditorView` once mounted, so the workspace can drive it
   * imperatively (Phase 1: auto-scroll/focus/cursor after a box insert; Phase 2:
   * range-marker handles and Rename). DESIGN.md §5 anticipates this access.
   */
  onReady?: (view: EditorView) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  // Mount once; external value sync is handled by the effect below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(mountEditor, [])
  function mountEditor() {
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          html(),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString())
            }
          }),
        ],
      }),
      parent: host.current!,
    })
    viewRef.current = view
    onReadyRef.current?.(view)
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

  return <div data-testid="scene-editor" ref={host} />
}
