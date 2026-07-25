// Headless source-formatting module.
//
// Formatting here means *re-indentation*, computed by the same HTML/CSS/JS
// grammar CodeMirror already uses to indent as you type — so a formatted
// document is exactly what the editor would have produced had every line been
// typed in the right place. Nothing is reflowed and no token is rewritten: a
// format never changes what the scene renders, only its leading whitespace.
// That is deliberate — the source is the single source of truth (see DESIGN §5)
// and a formatter that moved code around could disturb managed identity tokens.

import { EditorState, type ChangeSet, type Extension } from '@codemirror/state'
import { ensureSyntaxTree, indentRange, indentUnit } from '@codemirror/language'
import { html } from '@codemirror/lang-html'

/** Two spaces — matches the seeded scenes and CodeMirror's own default. */
export const INDENT_UNIT = '  '

/**
 * The indent unit, as an extension. The live editor installs it too, so typing
 * and formatting can never disagree about what one level of nesting looks like.
 */
export const indentConfig: Extension = indentUnit.of(INDENT_UNIT)

/** How long the parser may run before we indent against a partial tree. */
const PARSE_BUDGET_MS = 500

/**
 * The whitespace-only edit that brings every line to its grammatical
 * indentation. Returned as changes rather than a new string so the caller can
 * dispatch them as one transaction — the cursor, the selection and the
 * decorations all map through, and a single undo puts the old shape back.
 */
export function indentAllChanges(state: EditorState): ChangeSet {
  // Indentation is syntax-driven, and a view only parses what it has shown.
  // Without this the tail of a long document would indent against nothing.
  ensureSyntaxTree(state, state.doc.length, PARSE_BUDGET_MS)
  return indentRange(state, 0, state.doc.length)
}

/**
 * `indentAllChanges` over a bare string, for callers that hold source rather
 * than an editor (and for tests). Builds a throwaway state with the same
 * language and indent unit the editor uses, so both paths agree.
 */
export function formatSource(source: string): string {
  const state = EditorState.create({
    doc: source,
    extensions: [html(), indentConfig],
  })
  return state.update({ changes: indentAllChanges(state) }).state.doc.toString()
}

/** Whether `source` is already at its formatted shape — nothing to dispatch. */
export function isFormatted(source: string): boolean {
  return formatSource(source) === source
}
