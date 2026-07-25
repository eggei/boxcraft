import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

/**
 * CodeMirror styling for the scene source, expressed entirely in the app's CSS
 * custom properties (chrome from the shadcn tokens, syntax from the `--cm-*`
 * ones in index.css). Because the values are `var()` references resolved at
 * paint time, the editor follows the palette and theme attributes on <html> on
 * its own — no reconfiguration and no props threaded down to the editor.
 */
const chrome = EditorView.theme({
  '&': {
    backgroundColor: 'var(--background)',
    color: 'var(--foreground)',
  },
  '.cm-content': {
    caretColor: 'var(--foreground)',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--foreground)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    {
      backgroundColor: 'color-mix(in oklch, var(--primary) 22%, transparent)',
    },
  '.cm-gutters': {
    backgroundColor: 'var(--background)',
    color: 'var(--muted-foreground)',
    borderRight: '1px solid var(--border)',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in oklch, var(--foreground) 4%, transparent)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'color-mix(in oklch, var(--foreground) 6%, transparent)',
    color: 'var(--foreground)',
  },
  '.cm-selectionMatch': {
    backgroundColor: 'color-mix(in oklch, var(--primary) 16%, transparent)',
  },
  '.cm-matchingBracket, .cm-nonmatchingBracket': {
    backgroundColor: 'color-mix(in oklch, var(--primary) 20%, transparent)',
    outline: 'none',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--muted)',
    color: 'var(--muted-foreground)',
    border: 'none',
  },
  '.cm-panels, .cm-tooltip': {
    backgroundColor: 'var(--popover)',
    color: 'var(--popover-foreground)',
    border: '1px solid var(--border)',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    // The palette's accent tint, not `--accent` — that one is the full-strength
    // brand colour and would swamp the highlighted row.
    backgroundColor: 'var(--accent-weak)',
    color: 'var(--foreground)',
  },
})

// `basicSetup` installs the stock highlighter as a fallback only, so defining
// one here replaces it outright in both themes.
const highlight = HighlightStyle.define([
  { tag: t.comment, color: 'var(--cm-comment)', fontStyle: 'italic' },
  { tag: [t.keyword, t.modifier, t.moduleKeyword], color: 'var(--cm-keyword)' },
  { tag: [t.tagName, t.standard(t.tagName)], color: 'var(--cm-tag)' },
  { tag: [t.attributeName, t.propertyName], color: 'var(--cm-attribute)' },
  { tag: [t.string, t.attributeValue, t.special(t.string)], color: 'var(--cm-string)' },
  { tag: [t.number, t.bool, t.null, t.unit], color: 'var(--cm-number)' },
  { tag: [t.typeName, t.className, t.namespace], color: 'var(--cm-type)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--cm-function)' },
  { tag: [t.variableName, t.definition(t.variableName)], color: 'var(--cm-variable)' },
  { tag: [t.operator, t.punctuation, t.bracket, t.meta], color: 'var(--cm-punctuation)' },
  { tag: t.invalid, color: 'var(--destructive)' },
])

export const editorTheme: Extension = [chrome, syntaxHighlighting(highlight)]
