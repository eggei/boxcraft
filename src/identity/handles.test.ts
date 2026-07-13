import { describe, it, expect } from 'vitest'
import { createHandleMinter } from './handles'

describe('createHandleMinter', () => {
  it('mints distinct opaque handles on each call', () => {
    const mint = createHandleMinter()

    const a = mint()
    const b = mint()

    expect(a).toMatch(/^bx_/)
    expect(b).toMatch(/^bx_/)
    expect(a).not.toBe(b)
  })
})
