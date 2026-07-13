import { describe, it, expect } from 'vitest'
import { deriveVarName } from './var-name'

describe('deriveVarName', () => {
  it('derives a camel-ish JS identifier from a box name (box-1 → box1)', () => {
    expect(deriveVarName('box-1')).toBe('box1')
  })

  it('drops characters that are not valid in a JS identifier', () => {
    // A box renamed to something with punctuation still yields a usable var.
    expect(deriveVarName('my.box!')).toBe('mybox')
  })

  it('prefixes an underscore when the result would start with a digit', () => {
    // A leading digit is illegal to start an identifier, so guard it.
    expect(deriveVarName('1-thing')).toBe('_1thing')
  })
})
