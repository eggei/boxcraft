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
  })

  it('reflects an auto-format setting that is off', async () => {
    const { user } = renderMenu({ autoFormat: false, editorSide: 'left' })

    await openMenu(user)

    expect(
      screen.getByRole('menuitemcheckbox', { name: /Auto-format/ }),
    ).toHaveAttribute('aria-checked', 'false')
  })

  it('names the side the code will move to, not the side it is on', async () => {
    const { user } = renderMenu({ autoFormat: true, editorSide: 'left' })

    await openMenu(user)

    expect(screen.getByRole('menuitem', { name: 'Code on the right' })).toBeVisible()
    expect(screen.queryByRole('menuitem', { name: 'Code on the left' })).toBeNull()
  })

  it('offers the way back once the code is on the right', async () => {
    const { user } = renderMenu({ autoFormat: true, editorSide: 'right' })

    await openMenu(user)

    expect(screen.getByRole('menuitem', { name: 'Code on the left' })).toBeVisible()
  })

  it('reports the swap when the layout item is chosen', async () => {
    const { user, onToggleEditorSide } = renderMenu()

    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: 'Code on the right' }))

    expect(onToggleEditorSide).toHaveBeenCalledTimes(1)
  })

  it('stays open when auto-format is ticked, so more can be changed', async () => {
    const { user, onToggleAutoFormat } = renderMenu()

    await openMenu(user)
    await user.click(screen.getByRole('menuitemcheckbox', { name: /Auto-format/ }))

    expect(onToggleAutoFormat).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('menuitem', { name: 'Code on the right' })).toBeVisible()
  })
})
