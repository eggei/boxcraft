import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SceneEditor } from './SceneEditor'

describe('SceneEditor', () => {
  it('mounts a CodeMirror editor showing the initial source', () => {
    const { container } = render(<SceneEditor value="<h1>hello</h1>" onChange={() => {}} />)

    const content = container.querySelector('.cm-content')
    expect(content).not.toBeNull()
    expect(content?.textContent).toContain('<h1>hello</h1>')
  })

  it('reports the new source via onChange when the user types', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { container } = render(<SceneEditor value="ab" onChange={onChange} />)
    const content = container.querySelector('.cm-content') as HTMLElement

    await user.click(content)
    await user.type(content, 'X')

    expect(onChange).toHaveBeenCalled()
    expect(onChange.mock.lastCall?.[0]).toContain('X')
  })
})
