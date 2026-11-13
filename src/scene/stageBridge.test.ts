import { describe, expect, it } from 'vitest'
import { DEFAULT_SOURCE } from '@/scenes/sceneList'
import { BRIDGE_ATTR, createBox, instrument, serialize } from './document'
import {
  BRIDGE_CHANNEL,
  bridgeScript,
  installBridge,
  isBridgeMessage,
  layoutOf,
  stageDocument,
  withBridge,
  type BridgeMessage,
} from './stageBridge'

const WITH_BOX = createBox(DEFAULT_SOURCE, { kind: 'point', x: 10, y: 20 }).source

/**
 * A stand-in for the scene's window: its own document, its own event target,
 * and a parent that records what is posted to it. jsdom doesn't run scripts in
 * a srcdoc iframe, so the bridge is exercised by calling it directly.
 */
function fakeScene(html: string, install = installBridge) {
  const doc = document.implementation.createHTMLDocument('scene')
  doc.body.innerHTML = html
  const posted: Record<string, unknown>[] = []
  const host = { postMessage: (message: Record<string, unknown>) => posted.push(message) }
  const win = Object.assign(new EventTarget(), { document: doc, parent: host })
  install(win as unknown as Window, BRIDGE_CHANNEL)
  return { win, doc, host, posted }
}

/** A message event as the browser would deliver it, from `source`. */
function messageFrom(source: unknown, data: unknown) {
  const event = new Event('message')
  Object.defineProperty(event, 'source', { value: source })
  Object.defineProperty(event, 'data', { value: data })
  return event
}

function stubRect(el: Element, left: number, top: number, width: number, height: number) {
  el.getBoundingClientRect = () => new DOMRect(left, top, width, height)
}

describe('stageDocument', () => {
  it('adds the bridge and the handles to the render copy', () => {
    const rendered = stageDocument(WITH_BOX)
    expect(rendered).toContain(`<script ${BRIDGE_ATTR}>`)
    expect(rendered).toContain('data-bc="bx_1"')
  })

  it('puts the bridge ahead of every scene script, straight after <head>', () => {
    const source = DEFAULT_SOURCE.replace('</body>', '<script>boom()</script></body>')
    const rendered = stageDocument(source)
    const headAt = rendered.indexOf('<head>')
    expect(rendered.indexOf(`<script ${BRIDGE_ATTR}>`)).toBe(headAt + '<head>'.length)
    expect(rendered.indexOf(`<script ${BRIDGE_ATTR}>`)).toBeLessThan(
      rendered.indexOf('<script>boom()'),
    )
  })

  it('still finds a place without a <head>', () => {
    expect(withBridge('<body><p>hi</p></body>')).toMatch(
      new RegExp(`^<body><script ${BRIDGE_ATTR}>`),
    )
    expect(withBridge('<p>hi</p>')).toMatch(new RegExp(`^<script ${BRIDGE_ATTR}>`))
  })

  it('is stripped again by serialize, so it can never reach a stored or exported scene', () => {
    expect(serialize(stageDocument(WITH_BOX))).toBe(WITH_BOX)
    expect(serialize(stageDocument(DEFAULT_SOURCE))).toBe(DEFAULT_SOURCE)
  })

  it('never touches the source it was given', () => {
    const before = WITH_BOX
    stageDocument(before)
    expect(before).not.toContain(BRIDGE_ATTR)
    expect(instrument(before)).not.toContain(BRIDGE_ATTR)
  })
})

describe('installBridge', () => {
  const html = '<div class="canvas"><div data-bc="bx_1"><span>inner</span></div></div>'

  it('reports ready and the layout once the scene has loaded', () => {
    const { win, doc, posted } = fakeScene(html)
    stubRect(doc.querySelector('.canvas')!, 50, 60, 400, 300)
    stubRect(doc.querySelector('[data-bc]')!, 70, 80, 100, 40)

    win.dispatchEvent(new Event('load'))

    expect(posted).toEqual([
      { channel: BRIDGE_CHANNEL, type: 'ready' },
      {
        channel: BRIDGE_CHANNEL,
        type: 'layout',
        canvas: { left: 50, top: 60, width: 400, height: 300 },
        boxes: { bx_1: { left: 70, top: 80, width: 100, height: 40 } },
      },
    ])
  })

  it('re-measures when the editor asks, and only the editor', () => {
    const { win, host, posted } = fakeScene(html)

    win.dispatchEvent(messageFrom(win, { channel: BRIDGE_CHANNEL, type: 'measure' }))
    expect(posted).toHaveLength(0)

    win.dispatchEvent(messageFrom(host, { channel: BRIDGE_CHANNEL, type: 'measure' }))
    expect(posted).toHaveLength(1)
    expect(posted[0]).toMatchObject({ type: 'layout' })
  })

  it('re-measures on resize', () => {
    const { win, posted } = fakeScene(html)
    win.dispatchEvent(new Event('resize'))
    expect(posted[0]).toMatchObject({ type: 'layout' })
  })

  it('reports a click by the handle of the box it landed in', () => {
    const { doc, posted } = fakeScene(html)
    doc.querySelector('span')!.click()
    doc.querySelector('.canvas')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(posted).toEqual([
      { channel: BRIDGE_CHANNEL, type: 'click', handle: 'bx_1' },
      { channel: BRIDGE_CHANNEL, type: 'click', handle: null },
    ])
  })

  it("posts key presses out, except those typed into the scene's own fields", () => {
    const { doc, posted } = fakeScene(html + '<input>')
    doc.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }),
    )
    doc
      .querySelector('input')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }))

    expect(posted).toEqual([
      {
        channel: BRIDGE_CHANNEL,
        type: 'keydown',
        key: 'Escape',
        code: 'Escape',
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        repeat: false,
      },
    ])
  })

  it('works from its shipped source text — it is self-contained', () => {
    const script = bridgeScript()
    const body = script.slice(script.indexOf('>') + 1, script.lastIndexOf('</script>'))
    const fromText = (win: Window) => new Function('window', body)(win)
    const { win, posted } = fakeScene(html, fromText)

    win.dispatchEvent(new Event('load'))

    expect(posted.map((m) => m.type)).toEqual(['ready', 'layout'])
  })
})

describe('bridge messages', () => {
  it('recognizes only messages on the bridge channel', () => {
    expect(isBridgeMessage({ channel: BRIDGE_CHANNEL, type: 'ready' })).toBe(true)
    expect(isBridgeMessage({ channel: 'other', type: 'ready' })).toBe(false)
    expect(isBridgeMessage('ready')).toBe(false)
    expect(isBridgeMessage(null)).toBe(false)
  })

  it('drops a malformed layout rather than trusting it', () => {
    const layout = (extra: object) =>
      ({ channel: BRIDGE_CHANNEL, type: 'layout', ...extra }) as unknown as BridgeMessage
    const rect = { left: 1, top: 2, width: 3, height: 4 }

    expect(layoutOf(layout({ canvas: rect, boxes: { bx_1: rect, bx_2: 'nope' } }))).toEqual({
      canvas: rect,
      boxes: { bx_1: rect },
    })
    expect(layoutOf(layout({ canvas: null, boxes: {} }))).toEqual({ canvas: null, boxes: {} })
    expect(layoutOf(layout({ canvas: { left: 'x' }, boxes: {} }))).toBeNull()
    expect(layoutOf(layout({ canvas: rect }))).toBeNull()
  })
})
