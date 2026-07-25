import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_EDITOR_SETTINGS, type EditorSettings } from '@/settings/editorSettings'
import { EditorSettingsMenu } from './EditorSettingsMenu'

function renderMenu(settings: EditorSettings = DEFAULT_EDITOR_SETTINGS) {
  const onToggleAutoFormat = vi.fn()
  const onToggleEditorSide = vi.fn()
  render(
    <EditorSettingsMenu
      settings={settings}
      onToggleAutoFormat={onToggleAutoFormat}
      onToggleEditorSide={onToggleEditorSide}
    />,
  )
  return { onToggleAutoFormat, onToggleEditorSide, user: userEvent.setup() }
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Editor settings' }))
}

describe('EditorSettingsMenu', () => {
  it('opens from the gear and shows auto-format ticked by default', async () => {
    const { user } = renderMenu()

    await openMenu(user)

    expect(
      screen.getByRole('menuitemcheckbox', { name: /Auto-format/ }),
    ).toHaveAttribute('aria-checked', 'true')
    expect(
      screen.getByRole('menuitemcheckbox', { name: /Code on the right/ }),
    ).toHaveAttribute('aria-checked', 'false')
  })

  it('reflects settings that are not the defaults', async () => {
    const { user } = renderMenu({ autoFormat: false, editorSide: 'right' })

    await openMenu(user)

    expect(
      screen.getByRole('menuitemcheckbox', { name: /Auto-format/ }),
    ).toHaveAttribute('aria-checked', 'false')
    expect(
      screen.getByRole('menuitemcheckbox', { name: /Code on the right/ }),
    ).toHaveAttribute('aria-checked', 'true')
  })

  it('reports each tick and stays open so both can be changed at once', async () => {
    const { user, onToggleAutoFormat, onToggleEditorSide } = renderMenu()

    await openMenu(user)
    await user.click(screen.getByRole('menuitemcheckbox', { name: /Auto-format/ }))
    await user.click(
      screen.getByRole('menuitemcheckbox', { name: /Code on the right/ }),
    )

    expect(onToggleAutoFormat).toHaveBeenCalledTimes(1)
    expect(onToggleEditorSide).toHaveBeenCalledTimes(1)
  })
})
