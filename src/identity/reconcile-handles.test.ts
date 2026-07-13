import { describe, it, expect } from 'vitest'
import { createHandleMinter, reconcileHandles } from './handles'

// box-1 sits first and box-2 is appended *after* it, so box-1's opening-tag
// offset is identical in both docs — mirroring how CodeMirror maps a stable
// marker through an edit elsewhere. The pure reconcile can then be exercised
// without a live editor.
const ONE = `<div class="canvas">
  <div class="box-1"></div>
</div>`
const TWO = `<div class="canvas">
  <div class="box-1"></div>
  <div class="box-2"></div>
</div>`

describe('reconcileHandles', () => {
  it('keeps a persisting box handle and mints a fresh one for a new box', () => {
    const mint = createHandleMinter()
    const before = reconcileHandles([], ONE, mint)
    const box1Handle = before[0].handle

    const after = reconcileHandles(before, TWO, mint)

    expect(after.map((m) => m.name)).toEqual(['box-1', 'box-2'])
    expect(after[0].handle).toBe(box1Handle)
    expect(after[1].handle).not.toBe(box1Handle)
  })

  it('drops the handle of a box whose div was removed', () => {
    const mint = createHandleMinter()
    const before = reconcileHandles([], TWO, mint)

    const after = reconcileHandles(before, ONE, mint)

    expect(after.map((m) => m.name)).toEqual(['box-1'])
    expect(after[0].handle).toBe(before[0].handle)
  })

  it('keeps a handle whose box was renamed out of the box-N namespace', () => {
    const mint = createHandleMinter()
    const before = reconcileHandles([], ONE, mint)
    // Simulate a rename: the marker still carries the new name, and the div's
    // opening tag is unchanged (rename edits only the class token, not `<div`).
    const renamedMarkers = before.map((m) => ({ ...m, name: 'hero' }))
    const renamedSource = ONE.replace('box-1', 'hero')

    const after = reconcileHandles(renamedMarkers, renamedSource, mint)

    // Same handle survives; it is not re-minted or dropped, and no phantom
    // box-N box is discovered.
    expect(after).toHaveLength(1)
    expect(after[0].handle).toBe(before[0].handle)
    expect(after[0].name).toBe('hero')
  })
})
