import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SceneConflictBanner } from './SceneConflictBanner'
import { seedScenes } from './sceneList'

describe('SceneConflictBanner', () => {
  it('renders nothing without a conflict', () => {
    const { container } = render(
      <SceneConflictBanner scenes={seedScenes()} conflicts={[]} onResolve={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('names the scene and settles it either way', async () => {
    const user = userEvent.setup()
    const onResolve = vi.fn()
    render(
      <SceneConflictBanner scenes={seedScenes()} conflicts={['seed-1']} onResolve={onResolve} />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'This scene changed in another tab: Glow button',
    )

    await user.click(screen.getByRole('button', { name: 'Reload' }))
    expect(onResolve).toHaveBeenLastCalledWith('seed-1', 'theirs')

    await user.click(screen.getByRole('button', { name: 'Keep mine' }))
    expect(onResolve).toHaveBeenLastCalledWith('seed-1', 'mine')
  })
})
