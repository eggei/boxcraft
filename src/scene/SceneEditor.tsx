import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { html } from '@codemirror/lang-html'
import { basicSetup } from 'codemirror'
import { createBox, type BoxPlacement } from './document'

export interface SceneEditorHandle {
  /** Insert a box at `placement` and land the cursor inside its new rule. */
  createBox: (placement: BoxPlacement) => void
}

interface SceneEditorProps {
  value: string
  onChange: (source: string) => void
}

/**
 * CodeMirror 6 adapter over the scene source. The domain module owns what the
 * source becomes and where the cursor lands; this component only translates
 * that into CodeMirror transactions and reports edits back up.
 */
export const SceneEditor = forwardRef<SceneEditorHandle, SceneEditorProps>(
  function SceneEditor({ value, onChange }, ref) {
    const hostRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<EditorView | null>(null)
    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange

    useEffect(function mount() {
      const view = new EditorView({
        parent: hostRef.current as HTMLElement,
        state: EditorState.create({
          doc: value,
          extensions: [
            basicSetup,
            html(),
            EditorView.lineWrapping,
            EditorView.updateListener.of(function report(update) {
              if (update.docChanged) {
                onChangeRef.current(update.state.doc.toString())
              }
            }),
          ],
        }),
      })
      viewRef.current = view
      return function unmount() {
        view.destroy()
        viewRef.current = null
      }
      // Mount once; external `value` changes are handled by the sync effect.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Reflect external source changes (restore-from-persistence) into the doc,
    // without disturbing the cursor while the user is typing (value === doc).
    useEffect(function syncExternalValue() {
      const view = viewRef.current
      if (!view) return
      const current = view.state.doc.toString()
      if (value !== current) {
        view.dispatch({
          changes: { from: 0, to: current.length, insert: value },
        })
      }
    }, [value])

    useImperativeHandle(ref, function handle() {
      return {
        createBox(placement) {
          const view = viewRef.current
          if (!view) return
          const source = view.state.doc.toString()
          const result = createBox(source, placement)
          view.dispatch({
            changes: { from: 0, to: source.length, insert: result.source },
            selection: { anchor: result.cursor },
            scrollIntoView: true,
          })
          view.focus()
          onChangeRef.current(result.source)
        },
      }
    })

    return <div ref={hostRef} className="h-full overflow-auto text-sm" />
  },
)
