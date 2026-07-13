import { locateNameTokens } from './name-tokens'

/** A single text replacement, as CodeMirror consumes it in a transaction. */
export interface Change {
  from: number
  to: number
  insert: string
}

export interface RenameResult {
  /** All replacements, to be dispatched as one transaction (one undo step). */
  changes: Change[]
  /** The source with the rename applied (for preview/verification). */
  source: string
}

/**
 * Rename a managed box everywhere it appears: the CSS `.box-N` selector, the
 * HTML `class`, and — when JS is attached — the HTML `id` and the
 * `getElementById('…')` string argument (DESIGN.md §5, §8). Every occurrence is
 * located via the managed name tokens and replaced in one change-set, so the
 * editor applies it as a single atomic transaction that a single `⌘Z` reverts.
 * The handle/marker is untouched (rename is purely cosmetic to the app), and the
 * auto-derived JS variable name is user-owned so it is deliberately left alone.
 */
export function renameBox(source: string, oldName: string, newName: string): RenameResult {
  const changes: Change[] = locateNameTokens(source, new Set([oldName])).map((t) => ({
    from: t.from,
    to: t.to,
    insert: newName,
  }))

  let out = source
  for (const c of [...changes].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, c.from) + c.insert + out.slice(c.to)
  }
  return { changes, source: out }
}
