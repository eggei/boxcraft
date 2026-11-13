import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SceneStage } from './SceneStage'
import { BRIDGE_CHANNEL, stageDocument } from './stageBridge'
import { LOOP_GUARD } from './loopGuard'

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

const iframe = () => screen.getByTitle('Scene preview') as HTMLIFrameElement

/** Deliver a bridge message to the stage as if `source` had posted it. */
function post(data: Record<string, unknown>, source: unknown = iframe().contentWindow) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { channel: BRIDGE_CHANNEL, ...data },
        source: source as Window,
      }),
    )
  })
}

const rect = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
})

describe('SceneStage', () => {
  it('renders the bridged, instrumented source into a sandboxed iframe', () => {
    render(<SceneStage source={SOURCE} {...stageProps()} />)
    expect(iframe()).toHaveAttribute('srcdoc', stageDocument(SOURCE))
  })

  it('runs the scene in an opaque origin: scripts, but no same-origin access', () => {
    render(<SceneStage source={SOURCE} {...stageProps()} />)
    expect(iframe()).toHaveAttribute('sandbox', 'allow-scripts')
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

describe('SceneStage bridge', () => {
  afterEach(() => vi.restoreAllMocks())

  it('selects the clicked box with the Select tool, and attaches with the JS tool', () => {
    const props = stageProps()
    const { rerender } = render(<SceneStage source={SOURCE} {...props} />)

    post({ type: 'click', handle: 'bx_2' })
    expect(props.onSelectBox).toHaveBeenCalledWith('bx_2')

    rerender(<SceneStage source={SOURCE} {...props} tool="js" />)
    post({ type: 'click', handle: 'bx_1' })
    expect(props.onAttachJs).toHaveBeenCalledWith('bx_1')
    expect(props.onSelectBox).toHaveBeenCalledTimes(1)
  })

  it('ignores a click on no box', () => {
    const props = stageProps()
    render(<SceneStage source={SOURCE} {...props} />)
    post({ type: 'click', handle: null })
    expect(props.onSelectBox).not.toHaveBeenCalled()
  })

  it('ignores messages from any window but its own iframe', () => {
    const props = stageProps()
    render(<SceneStage source={SOURCE} {...props} />)

    post({ type: 'click', handle: 'bx_1' }, window)
    post({ type: 'click', handle: 'bx_1' }, null)

    expect(props.onSelectBox).not.toHaveBeenCalled()
  })

  it('outlines the selected box where the bridge says it is', () => {
    render(<SceneStage source={SOURCE} {...stageProps()} selectedHandle="bx_1" />)
    expect(screen.queryByTestId('selection-outline')).not.toBeInTheDocument()

    post({ type: 'layout', canvas: rect(0, 0, 400, 400), boxes: { bx_1: rect(10, 20, 30, 40) } })

    const outline = screen.getByTestId('selection-outline')
    expect(outline.style.left).toBe('10px')
    expect(outline.style.top).toBe('20px')
    expect(outline.style.width).toBe('30px')
    expect(outline.style.height).toBe('40px')
  })

  it('asks the scene to re-measure when the selection changes', () => {
    const { rerender } = render(<SceneStage source={SOURCE} {...stageProps()} />)
    const postMessage = vi.spyOn(iframe().contentWindow!, 'postMessage')

    rerender(<SceneStage source={SOURCE} {...stageProps()} selectedHandle="bx_1" />)

    expect(postMessage).toHaveBeenCalledWith({ channel: BRIDGE_CHANNEL, type: 'measure' }, '*')
  })

  it('replays a key pressed inside the stage on the parent window', () => {
    const seen: KeyboardEvent[] = []
    const listener = (event: KeyboardEvent) => seen.push(event)
    window.addEventListener('keydown', listener)
    render(<SceneStage source={SOURCE} {...stageProps()} />)

    post({ type: 'keydown', key: 'b', code: 'KeyB', shiftKey: true })
    window.removeEventListener('keydown', listener)

    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ key: 'b', code: 'KeyB', shiftKey: true, ctrlKey: false })
  })

  it('places a box from the canvas rect the bridge reported', () => {
    const props = stageProps()
    render(<SceneStage source={SOURCE} {...props} tool="box" />)
    vi.spyOn(iframe(), 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 50, 800, 600))
    post({ type: 'layout', canvas: rect(20, 30, 400, 400), boxes: {} })
    const overlay = screen.getByTestId('box-overlay')

    // Canvas starts at page (120, 80). A drag from (130, 90) to (180, 150).
    fireEvent.pointerDown(overlay, { clientX: 130, clientY: 90, pointerId: 1 })
    fireEvent.pointerMove(overlay, { clientX: 180, clientY: 150, pointerId: 1 })
    fireEvent.pointerUp(overlay, { clientX: 180, clientY: 150, pointerId: 1 })

    expect(props.onCreateBox).toHaveBeenCalledWith({
      kind: 'rect',
      left: 10,
      top: 10,
      width: 50,
      height: 60,
    })
  })

  it("doesn't start a marquee before the canvas has been measured", () => {
    const props = stageProps()
    render(<SceneStage source={SOURCE} {...props} tool="box" />)
    const overlay = screen.getByTestId('box-overlay')

    fireEvent.pointerDown(overlay, { clientX: 130, clientY: 90, pointerId: 1 })
    fireEvent.pointerUp(overlay, { clientX: 130, clientY: 90, pointerId: 1 })

    expect(props.onCreateBox).not.toHaveBeenCalled()
  })
})

describe('SceneStage scripts', () => {
  /** A scene with one box and a script after the canvas. */
  const withScript = (code: string) =>
    '<!doctype html><html><head></head><body><div class="canvas">' +
    '<div class="box-1"></div></div>' +
    `<script>${code}</script></body></html>`

  const GOOD = withScript('while (spin()) {}')
  const BROKEN = withScript('while (spin() {')

  it('renders a scene whose script parses, with its loops guarded', () => {
    render(<SceneStage source={GOOD} {...stageProps()} />)
    expect(iframe().getAttribute('srcdoc')).toContain(`while (spin()) {${LOOP_GUARD}();}`)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('keeps the last good render while a script has errors, and says so', () => {
    const { rerender } = render(<SceneStage source={GOOD} {...stageProps()} />)
    const good = iframe().getAttribute('srcdoc')

    rerender(<SceneStage source={BROKEN} {...stageProps()} />)
    expect(iframe().getAttribute('srcdoc')).toBe(good)
    expect(screen.getByRole('status')).toHaveTextContent('Script has errors')

    rerender(<SceneStage source={GOOD.replace('spin', 'turn')} {...stageProps()} />)
    expect(iframe().getAttribute('srcdoc')).toContain('turn()')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows a scene that is broken from the start with its scripts held back', () => {
    render(<SceneStage source={BROKEN} {...stageProps()} />)
    expect(iframe().getAttribute('srcdoc')).toContain('Content-Security-Policy')
    expect(screen.getByRole('status')).toHaveTextContent('Script has errors')
  })

  it('reads clicks on a stale render against the box it showed', () => {
    const props = stageProps()
    const { rerender } = render(<SceneStage source={GOOD} {...props} />)
    // A box added above box-1 while the script is broken: box-1 is bx_2 in
    // the source now, but still bx_1 in the render on screen.
    const shifted = BROKEN.replace('<div class="box-1">', '<div class="new"></div><div class="box-1">')
    rerender(<SceneStage source={shifted} {...props} />)

    post({ type: 'click', handle: 'bx_1' })
    expect(props.onSelectBox).toHaveBeenCalledWith('bx_2')
  })

  it('pauses and resumes scripts from the stage corner', () => {
    render(<SceneStage source={GOOD} {...stageProps()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Pause scripts' }))
    const paused = iframe().getAttribute('srcdoc')!
    expect(paused).toContain('Content-Security-Policy')
    expect(paused).not.toContain(LOOP_GUARD + '();')
    expect(screen.getByRole('button', { name: 'Resume scripts' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Resume scripts' }))
    expect(iframe().getAttribute('srcdoc')).not.toContain('Content-Security-Policy')
  })

  it('renders a broken script while paused, without the errors notice', () => {
    const { rerender } = render(<SceneStage source={GOOD} {...stageProps()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pause scripts' }))

    rerender(<SceneStage source={BROKEN} {...stageProps()} />)
    expect(iframe().getAttribute('srcdoc')).toContain('while (spin() {')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('says when a loop was stopped, until the next render', () => {
    const { rerender } = render(<SceneStage source={GOOD} {...stageProps()} />)

    post({ type: 'loop-stopped' })
    expect(screen.getByRole('status')).toHaveTextContent('loop ran too long')

    rerender(<SceneStage source={GOOD.replace('spin', 'turn')} {...stageProps()} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
