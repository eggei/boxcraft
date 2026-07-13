/** Default title for a newly created scene (DESIGN.md §9: "Scene 1"…). */
export function nextSceneTitle(existingTitles: string[]): string {
  const numbers = existingTitles
    .map((t) => /^Scene (\d+)$/.exec(t)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number)
  const next = numbers.length === 0 ? 1 : Math.max(...numbers) + 1
  return `Scene ${next}`
}

/** Default title for a fork of `title` (DESIGN.md §9 duplicate). */
export function duplicateTitle(title: string): string {
  const match = /^(.*) copy(?: (\d+))?$/.exec(title)
  if (!match) return `${title} copy`
  const [, base, n] = match
  return `${base} copy ${n ? Number(n) + 1 : 2}`
}
