import { describe, expect, it } from 'vitest'
import { guardLoops, guardScripts, LOOP_GUARD } from './loopGuard'

const G = `${LOOP_GUARD}();`

/** The guarded code, failing the test if the script didn't parse. */
function guarded(code: string): string {
  const result = guardLoops(code)
  if (!result.ok) throw new Error(`expected ${JSON.stringify(code)} to parse`)
  return result.code
}

/**
 * Run guarded code with a guard that counts calls and stops after `limit`, so
 * a test can show the guard really sits inside each loop body — and that the
 * code's meaning is otherwise unchanged.
 */
function run(code: string, limit = 1000) {
  let calls = 0
  const guard = () => {
    if (++calls > limit) throw new Error('stopped')
  }
  const result = new Function(LOOP_GUARD, guarded(code))(guard)
  return { result, calls }
}

describe('guardLoops', () => {
  it('guards the top of a braced body, for each kind of loop', () => {
    expect(guarded('while (a) { b() }')).toBe(`while (a) {${G} b() }`)
    expect(guarded('for (let i = 0; i < 3; i++) { b() }')).toBe(
      `for (let i = 0; i < 3; i++) {${G} b() }`,
    )
    expect(guarded('for (const k in o) {}')).toBe(`for (const k in o) {${G}}`)
    expect(guarded('for (const v of list) {}')).toBe(`for (const v of list) {${G}}`)
    expect(guarded('do { b() } while (a)')).toBe(`do {${G} b() } while (a)`)
  })

  it('wraps a body without braces', () => {
    expect(guarded('while (a) b();')).toBe(`while (a) {${G}b();}`)
    expect(guarded('for (;;) break;')).toBe(`for (;;) {${G}break;}`)
    expect(guarded('do b(); while (a);')).toBe(`do {${G}b();} while (a);`)
  })

  it('guards nested loops, braced or not', () => {
    expect(guarded('while (a) { for (;;) { b() } }')).toBe(
      `while (a) {${G} for (;;) {${G} b() } }`,
    )
    expect(guarded('while (a) while (b) c();')).toBe(`while (a) {${G}while (b) {${G}c();}}`)
  })

  it('leaves "while" and "for" in strings, templates, comments and names alone', () => {
    const code = [
      'const s = "while (true) {}";',
      "const t = `for (;;) ${'do'}`;",
      '// while (true) {}',
      '/* for (;;) {} */',
      'const whileLoop = forEach;',
    ].join('\n')
    expect(guarded(code)).toBe(code)
  })

  it('skips a comment between a loop and its body', () => {
    expect(guarded('while (a) /* go */ { b() }')).toBe(`while (a) /* go */ {${G} b() }`)
    expect(guarded('do /* go */ b(); while (a)')).toBe(`do /* go */ {${G}b();} while (a)`)
  })

  it('keeps loops back to back apart', () => {
    expect(guarded('while(a)b();while(c)d();')).toBe(`while(a){${G}b();}while(c){${G}d();}`)
  })

  it('leaves code with no loops untouched', () => {
    const code = 'const box = document.getElementById("box-1");\nbox.onclick = () => go();'
    expect(guarded(code)).toBe(code)
  })

  it('reports a script that does not parse', () => {
    expect(guardLoops('while (true {').ok).toBe(false)
    expect(guardLoops('const = 1').ok).toBe(false)
    expect(guardLoops('for (;;) {').ok).toBe(false)
  })

  it('keeps the meaning of the code — labels, break and continue included', () => {
    expect(
      run(`
        let total = 0
        outer: for (let i = 0; i < 3; i++)
          for (let j = 0; j < 3; j++) {
            if (j === 2) continue outer
            total += 1
          }
        let k = 0
        do k++; while (k < 4)
        while (k < 10) if (++k === 7) break
        return [total, k]
      `).result,
    ).toEqual([6, 7])
  })

  it('calls the guard on every iteration — an endless loop is stopped', () => {
    expect(() => run('while (true) {}', 50)).toThrow('stopped')
    expect(() => run('for (;;);', 50)).toThrow('stopped')
    expect(() => run('do ; while (true)', 50)).toThrow('stopped')
    expect(run('for (let i = 0; i < 5; i++) {}').calls).toBe(5)
    expect(run('for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++);').calls).toBe(3 + 6)
  })
})

describe('guardScripts', () => {
  const page = (scripts: string) => `<html><body><div class="canvas"></div>${scripts}</body></html>`

  it('guards every inline script', () => {
    const out = guardScripts(page('<script>while (a) {}</script><script>for (;;) {}</script>'))
    expect(out).toEqual({
      ok: true,
      html: page(`<script>while (a) {${G}}</script><script>for (;;) {${G}}</script>`),
    })
  })

  it('guards module and explicitly typed scripts', () => {
    const html = page(
      '<script type="module">while (a) {}</script><script type="text/javascript">while (b) {}</script>',
    )
    const out = guardScripts(html)
    expect(out.ok && out.html).toBe(
      page(
        `<script type="module">while (a) {${G}}</script><script type="text/javascript">while (b) {${G}}</script>`,
      ),
    )
  })

  it('leaves external scripts and non-JavaScript blocks alone', () => {
    const html = page(
      '<script src="lib.js"></script><script type="application/json">{"while": 1}</script><script type="text/template">for x</script>',
    )
    expect(guardScripts(html)).toEqual({ ok: true, html })
  })

  it('fails the whole document when any script does not parse', () => {
    expect(guardScripts(page('<script>while (a) {}</script><script>if (</script>')).ok).toBe(
      false,
    )
  })

  it('passes a document with no scripts straight through', () => {
    expect(guardScripts(page(''))).toEqual({ ok: true, html: page('') })
  })
})
