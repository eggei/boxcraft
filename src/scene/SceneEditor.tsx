import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'
import { EditorState, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { html } from '@codemirror/lang-html'
import { basicSetup } from 'codemirror'
import {
  attachJs,
  boxAtOffset,
  createBox,
  detachJs,
  ensureRule,
  listBoxes,
  rename,
  resolveTokens,
  ruleRangeOf,
  type BoxPlacement,
  type TokenRange,
} from './document'

export interface SceneEditorHandle {
  /** Insert a box at `placement` and land the cursor inside its new rule. */
  createBox: (placement: BoxPlacement) => void
  /** Select a box: ensure it has a rule, scroll to it, land the cursor inside. */
  selectBox: (handle: string) => void
  /** Rename a box everywhere in one undo step. */
  renameBox: (handle: string, newName: string) => void
  /** Attach JS to a box (or jump to its line) and land the cursor to code. */
  attachJs: (handle: string) => void
  /** Detach a box's JS wiring in one undo step. */
  detachJs: (handle: string) => void
}

interface SceneEditorProps {
  value: string
  onChange: (source: string) => void
  /** Fires with the box whose rule the cursor is in (null when outside any). */
  onCursorBox?: (handle: string | null) => void
}

/** Chip / error decorations over managed identity tokens, computed from source. */
function chipDecorations(source: string): DecorationSet {
  const ranges: (TokenRange & { resolved: boolean })[] = []
  for (const token of resolveTokens(source)) {
    for (const r of token.ranges) ranges.push({ ...r, resolved: token.resolved })
  }
  ranges.sort((a, b) => a.from - b.from)

  const builder = new RangeSetBuilder<Decoration>()
  for (const r of ranges) {
    builder.add(
      r.from,
      r.to,
      Decoration.mark({ class: r.resolved ? 'bc-chip' : 'bc-error' }),
    )
  }
  return builder.finish()
}

const chipPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = chipDecorations(view.state.doc.toString())
    }
    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.decorations = chipDecorations(update.state.doc.toString())
      }
    }
  },
  { decorations: (v) => v.decorations },
)

// The selected box's rule gets a background highlight, set imperatively.
const setSelectedRule = StateEffect.define<TokenRange | null>()
const selectedRuleField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none
  },
  update(deco, tr) {
    deco = deco.map(tr.changes)
    for (const effect of tr.effects) {
      if (effect.is(setSelectedRule)) {
        deco = effect.value
          ? Decoration.set(
              Decoration.mark({ class: 'bc-selected-rule' }).range(
                effect.value.from,
                effect.value.to,
              ),
            )
          : Decoration.none
      }
    }
    return deco
  },
  provide: (f) => EditorView.decorations.from(f),
})

/**
 * CodeMirror 6 adapter over the scene source. The domain module owns what the
 * source becomes, where the cursor lands, and which tokens are managed; this
 * component only translates that into transactions, decorations, and sync
 * callbacks. It holds no parallel model.
 */
export const SceneEditor = forwardRef<SceneEditorHandle, SceneEditorProps>(
  function SceneEditor({ value, onChange, onCursorBox }, ref) {
    const hostRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<EditorView | null>(null)
    const onChangeRef = useRef(onChange)
    const onCursorBoxRef = useRef(onCursorBox)
    onChangeRef.current = onChange
    onCursorBoxRef.current = onCursorBox

    useEffect(function mount() {
      const syncSelection = EditorView.updateListener.of(function report(update) {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString())
        }
        if (update.docChanged || update.selectionSet) {
          const head = update.state.selection.main.head
          onCursorBoxRef.current?.(boxAtOffset(update.state.doc.toString(), head))
        }
      })

      const extensions: Extension[] = [
        basicSetup,
        html(),
        EditorView.lineWrapping,
        chipPlugin,
        selectedRuleField,
        syncSelection,
      ]

      const view = new EditorView({
        parent: hostRef.current as HTMLElement,
        state: EditorState.create({ doc: value, extensions }),
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

        selectBox(handleId) {
          const view = viewRef.current
          if (!view) return
          const source = view.state.doc.toString()
          const result = ensureRule(source, handleId)
          const box = listBoxes(result.source).find((b) => b.handle === handleId)
          const range = box ? ruleRangeOf(result.source, box.className) : null

          view.dispatch({
            changes: result.created
              ? { from: 0, to: source.length, insert: result.source }
              : undefined,
            selection: { anchor: result.cursor },
            scrollIntoView: true,
            effects: setSelectedRule.of(range),
          })
          view.focus()
          if (result.created) onChangeRef.current(result.source)
        },

        renameBox(handleId, newName) {
          const view = viewRef.current
          if (!view) return
          const source = view.state.doc.toString()
          const { source: next } = rename(source, handleId, newName)
          if (next === source) return
          // A single transaction — one ⌘Z reverts the whole rename.
          view.dispatch({
            changes: { from: 0, to: source.length, insert: next },
          })
          onChangeRef.current(next)
        },

        attachJs(handleId) {
          const view = viewRef.current
          if (!view) return
          const source = view.state.doc.toString()
          const result = attachJs(source, handleId)
          view.dispatch({
            // Re-attach returns the same source — just jump to the line.
            changes:
              result.source === source
                ? undefined
                : { from: 0, to: source.length, insert: result.source },
            selection: { anchor: result.cursor },
            scrollIntoView: true,
          })
          view.focus()
          if (result.source !== source) onChangeRef.current(result.source)
        },

        detachJs(handleId) {
          const view = viewRef.current
          if (!view) return
          const source = view.state.doc.toString()
          const { source: next } = detachJs(source, handleId)
          if (next === source) return
          view.dispatch({
            changes: { from: 0, to: source.length, insert: next },
          })
          onChangeRef.current(next)
        },
      }
    })

    return <div ref={hostRef} className="h-full overflow-auto text-sm" />
  },
)
