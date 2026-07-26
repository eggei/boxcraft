import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SOURCE } from '@/scenes/sceneList'
import { EDITOR_SETTINGS_KEY } from '@/settings/editorSettings'
import { SceneEditorPane } from './SceneEditorPane'

/** DEFAULT_SOURCE with every line pushed flush left. */
const MESSY = DEFAULT_SOURCE.split('\n')
  .map((line) => line.trimStart())
  .join('\n')

/** Manual formatting has to work with the automatic kind switched off. */
function withAutoFormatOff() {
  localStorage.setItem(
    EDITOR_SETTINGS_KEY,
    JSON.stringify({ autoFormat: false, editorSide: 'left' }),
  )
}

describe('SceneEditorPane formatting', () => {
  beforeEach(() => localStorage.clear())

  it('formats the source when the Format button is pressed', async () => {
    withAutoFormatOff()
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<SceneEditorPane source={MESSY} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Format source' }))

    expect(onChange).toHaveBeenCalledWith(DEFAULT_SOURCE)
  })

  it('formats on ⌥F, matched by physical key since Option+F types "ƒ"', () => {
    withAutoFormatOff()
    const onChange = vi.fn()
    render(<SceneEditorPane source={MESSY} onChange={onChange} />)

    fireEvent.keyDown(window, { key: 'ƒ', code: 'KeyF', altKey: true })

    expect(onChange).toHaveBeenCalledWith(DEFAULT_SOURCE)
  })

  it('leaves the source alone for a plain F', () => {
    withAutoFormatOff()
    const onChange = vi.fn()
    render(<SceneEditorPane source={MESSY} onChange={onChange} />)

    fireEvent.keyDown(window, { key: 'f', code: 'KeyF' })

    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('SceneEditorPane controls', () => {
  beforeEach(() => localStorage.clear())

  it('gathers settings, tools and format into one stack', () => {
    render(<SceneEditorPane source={DEFAULT_SOURCE} onChange={vi.fn()} />)

    for (const name of ['Editor settings', 'Select', 'Box', 'Attach JS', 'Format source']) {
      expect(screen.getByRole('button', { name })).toBeVisible()
    }
  })
})
