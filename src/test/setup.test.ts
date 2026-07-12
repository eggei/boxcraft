import { describe, it, expect } from 'vitest'

// Tracer bullet: confirms Vitest + jsdom environment run.
describe('test harness', () => {
  it('runs and has a DOM', () => {
    const el = document.createElement('div')
    el.textContent = 'ok'
    expect(el.textContent).toBe('ok')
  })
})
