/**
 * Derive a JavaScript variable name from a box's public name (`box-1` → `box1`).
 * Auto-derived on attach but then **user-owned**: it never follows a rename
 * (only the `getElementById` selector string does — DESIGN.md §8).
 */
export function deriveVarName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_$]/g, '')
  return /^[0-9]/.test(cleaned) || cleaned === '' ? `_${cleaned}` : cleaned
}
