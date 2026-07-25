// Browser plumbing for library files: hand a string to the user as a download.
// Kept apart from libraryFile so the format logic stays DOM-free and testable.

export function downloadFile(
  filename: string,
  contents: string,
  type = 'application/json',
): void {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
