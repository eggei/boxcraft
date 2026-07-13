import { locateNameTokens, type NameToken } from './name-tokens'

/** A managed token decorated in the editor, tagged by whether it resolves. */
export interface ChipMark extends NameToken {
  /** True when the box's handle resolves to a live rendered element (a chip);
   *  false when it doesn't (error-colored) (DESIGN.md §5). */
  resolved: boolean
}

/**
 * Compute chip decorations for a source. `managedNames` is the set of names the
 * app tracks (from the handle markers); `resolvedNames` is the subset that
 * currently resolves to a live element in the instrumented render. Every managed
 * token (class + selector) becomes a chip when its box resolves and an error
 * mark when it doesn't. Driven purely by the handle↔element correspondence the
 * app controls — not by matching arbitrary selectors — so user-invented classes
 * are never chipped or falsely errored (DESIGN.md §5).
 */
export function computeChips(
  source: string,
  managedNames: Set<string>,
  resolvedNames: Set<string>,
): ChipMark[] {
  return locateNameTokens(source, managedNames).map((token) => ({
    ...token,
    resolved: resolvedNames.has(token.name),
  }))
}
