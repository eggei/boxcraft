import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { WithTooltip } from './tooltip'

describe('WithTooltip', () => {
  it('reveals the hint once the button is hovered', async () => {
    const user = userEvent.setup()
    render(
      <WithTooltip tip="Make a copy of this scene">
        <button type="button" aria-label="Duplicate" />
      </WithTooltip>,
    )

    const button = screen.getByRole('button', { name: 'Duplicate' })
    expect(screen.queryByText('Make a copy of this scene')).toBeNull()

    await user.hover(button)
    expect(
      (await screen.findAllByText('Make a copy of this scene')).length,
    ).toBeGreaterThan(0)
  })

  it('describes the button rather than renaming it', async () => {
    const user = userEvent.setup()
    render(
      <WithTooltip tip="Move this scene into the archive">
        <button type="button" aria-label="Archive" />
      </WithTooltip>,
    )

    // The tip is a description: the button answers to its own label either way,
    // so a test (or a screen reader) still finds it by the name it always had.
    const button = screen.getByRole('button', { name: 'Archive' })
    await user.hover(button)
    await screen.findAllByText('Move this scene into the archive')

    expect(screen.getByRole('button', { name: 'Archive' })).toBe(button)
    expect(button).toHaveAccessibleDescription(
      'Move this scene into the archive',
    )
  })
})
