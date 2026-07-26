import { fireEvent, render } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SOURCE } from '@/scenes/sceneList'
import { SceneEditor } from './SceneEditor'
import { formatSource } from './format'

/** DEFAULT_SOURCE with every line pushed flush left. */
const MESSY = DEFAULT_SOURCE.split('\n')
  .map((line) => line.trimStart())
  .join('\n')

function viewIn(container: HTMLElement): EditorView {
  const view = EditorView.findFromDOM(
    container.querySelector('.cm-editor') as HTMLElement,
  )
  if (!view) throw new Error('no editor mounted')
  return view
}

describe('SceneEditor auto-format', () => {
  it('formats an unformatted document as soon as it opens', () => {
    const onChange = vi.fn()

    render(<SceneEditor value={MESSY} onChange={onChange} autoFormat />)

    expect(onChange).toHaveBeenCalledWith(DEFAULT_SOURCE)
  })

  it('leaves the document alone when the setting is off', () => {
    const onChange = vi.fn()

    const { container } = render(
      <SceneEditor value={MESSY} onChange={onChange} autoFormat={false} />,
    )

    expect(viewIn(container).state.doc.toString()).toBe(MESSY)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('formats the moment the setting is switched on', () => {
    const onChange = vi.fn()
    const { container, rerender } = render(
      <SceneEditor value={MESSY} onChange={onChange} autoFormat={false} />,
    )

    rerender(<SceneEditor value={MESSY} onChange={onChange} autoFormat />)

    expect(viewIn(container).state.doc.toString()).toBe(DEFAULT_SOURCE)
  })

  it('formats what was typed once the editor loses focus', () => {
    const onChange = vi.fn()
    const { container } = render(
      <SceneEditor value={DEFAULT_SOURCE} onChange={onChange} autoFormat />,
    )
    const view = viewIn(container)
    // A new box typed in at the wrong indent, as a person would leave it.
    const at = DEFAULT_SOURCE.indexOf('<div class="canvas">')
    view.dispatch({ changes: { from: at, insert: '        <p>hi</p>\n' } })
    const typed = view.state.doc.toString()

    fireEvent.blur(view.contentDOM)

    expect(view.state.doc.toString()).toBe(formatSource(typed))
    expect(view.state.doc.toString()).not.toBe(typed)
    expect(onChange).toHaveBeenLastCalledWith(view.state.doc.toString())
  })

  it('does not format on blur when the setting is off', () => {
    const { container } = render(
      <SceneEditor value={MESSY} onChange={vi.fn()} autoFormat={false} />,
    )
    const view = viewIn(container)

    fireEvent.blur(view.contentDOM)

    expect(view.state.doc.toString()).toBe(MESSY)
  })
})
