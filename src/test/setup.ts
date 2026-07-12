import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})

// jsdom implements no layout, so DOM Range geometry methods are missing.
// CodeMirror 6's selection/cursor layers call them while measuring; stub them
// out (empty geometry) so the editor mounts and edits without crashing.
const emptyRect = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  toJSON() {},
} as DOMRect

if (typeof Range !== 'undefined') {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => emptyRect
}
