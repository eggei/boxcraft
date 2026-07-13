/**
 * Pure drag-reorder math: move `draggedId` to sit immediately before
 * `targetId` in the list, driving the persisted L1 order (DESIGN.md §9).
 */
export function reorderIds(ids: string[], draggedId: string, targetId: string): string[] {
  if (draggedId === targetId) return ids
  const without = ids.filter((id) => id !== draggedId)
  const targetIndex = without.indexOf(targetId)
  return [...without.slice(0, targetIndex), draggedId, ...without.slice(targetIndex)]
}
