import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SceneStage } from './SceneStage'

const SOURCE = '<!doctype html><html><body><div class="canvas"></div></body></html>'

function stageProps() {
  return {
    tool: 'select' as const,
    selectedHandle: null,
    onCreateBox: vi.fn(),
    onSelectBox: vi.fn(),
    onAttachJs: vi.fn(),
  }
}

describe('SceneStage', () => {
  it('renders the source into an isolated iframe', () => {
    // A bare canvas has no boxes, so the instrumented render equals the source.
    render(<SceneStage source={SOURCE} {...stageProps()} />)
    const iframe = screen.getByTitle('Scene preview')
    expect(iframe).toHaveAttribute('srcdoc', SOURCE)
  })

  it('shows the box-drop overlay only while the Box tool is active', () => {
    const { rerender } = render(
      <SceneStage source={SOURCE} {...stageProps()} tool="select" />,
    )
    expect(screen.queryByTestId('box-overlay')).not.toBeInTheDocument()

    rerender(<SceneStage source={SOURCE} {...stageProps()} tool="box" />)
    expect(screen.getByTestId('box-overlay')).toBeInTheDocument()
  })
})

describe('SceneStage key forwarding', () => {
  /** Render, let the iframe "load", and return a key-presser inside it. */
  function loadedStage() {
    render(<SceneStage source={SOURCE} {...stageProps()} />)
    const iframe = screen.getByTitle('Scene preview') as HTMLIFrameElement
    iframe.dispatchEvent(new Event('load'))
    const doc = iframe.contentDocument!
    const FrameKeyboardEvent = (doc.defaultView as Window & typeof globalThis).KeyboardEvent
    return {
      doc,
      press(target: EventTarget, init: KeyboardEventInit) {
        const event = new FrameKeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
        target.dispatchEvent(event)
        return event
      },
    }
  }

  it('replays a key pressed inside the stage on the parent window', () => {
    const seen: KeyboardEvent[] = []
    const listener = (event: KeyboardEvent) => seen.push(event)
    window.addEventListener('keydown', listener)
    const { doc, press } = loadedStage()

    press(doc.body, { key: 'b', code: 'KeyB', shiftKey: true })
    window.removeEventListener('keydown', listener)

    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ key: 'b', code: 'KeyB', shiftKey: true, ctrlKey: false })
  })

  it('claims the original when an app shortcut claims the replay', () => {
    const claim = (event: KeyboardEvent) => event.preventDefault()
    window.addEventListener('keydown', claim)
    const { doc, press } = loadedStage()

    const original = press(doc.body, { key: 'Escape' })
    window.removeEventListener('keydown', claim)

    expect(original.defaultPrevented).toBe(true)
  })

  it("keeps keys typed into the scene's own fields to the scene", () => {
    const listener = vi.fn()
    window.addEventListener('keydown', listener)
    const { doc, press } = loadedStage()
    const input = doc.createElement('input')
    doc.body.append(input)

    press(input, { key: 'n' })
    window.removeEventListener('keydown', listener)

    expect(listener).not.toHaveBeenCalled()
  })
})
