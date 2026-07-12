import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SceneWorkspace } from './SceneWorkspace'

describe('SceneWorkspace (edit → render loop)', () => {
  it('renders the initial source in the iframe', () => {
    render(<SceneWorkspace initialSource="<h1>start</h1>" />)
    expect(screen.getByTitle('scene')).toHaveAttribute('srcdoc', '<h1>start</h1>')
  })

  it('live re-renders the iframe as the source is edited', async () => {
    const user = userEvent.setup()
    render(<SceneWorkspace initialSource="<h1>x</h1>" />)
    const content = document.querySelector('.cm-content') as HTMLElement

    await user.click(content)
    await user.type(content, 'Z')

    // The iframe is a pure render of the edited source, so the new character
    // and the original markup both appear in what it renders.
    const srcdoc = screen.getByTitle('scene').getAttribute('srcdoc') ?? ''
    expect(srcdoc).toContain('Z')
    expect(srcdoc).toContain('<h1>x</h1>')
  })

  it('notifies onSourceChange with the latest source as it is edited', async () => {
    const user = userEvent.setup()
    const onSourceChange = vi.fn()
    render(<SceneWorkspace initialSource="ab" onSourceChange={onSourceChange} />)
    const content = document.querySelector('.cm-content') as HTMLElement

    await user.click(content)
    await user.type(content, 'X')

    expect(onSourceChange).toHaveBeenCalled()
    expect(onSourceChange.mock.lastCall?.[0]).toContain('X')
  })
})
