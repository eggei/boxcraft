import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PalettePicker } from './PalettePicker'
import { SWATCH_TOKENS } from './palette'

function renderPicker(overrides: Partial<Parameters<typeof PalettePicker>[0]>) {
  const onSelect = vi.fn()
  const { container } = render(
    <PalettePicker
      palette="paper"
      theme="light"
      onSelect={onSelect}
      {...overrides}
    />,
  )
  return { onSelect, container }
}

describe('PalettePicker', () => {
  it('shows the active palette in the trigger, closed to start', () => {
    renderPicker({ palette: 'graphite' })

    expect(
      screen.getByRole('button', { name: 'Color palette: Graphite' }),
    ).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('lists every palette when opened, marking the active one', async () => {
    const user = userEvent.setup()
    renderPicker({ palette: 'paper' })

    await user.click(screen.getByRole('button', { name: /Color palette/ }))

    const options = screen.getAllByRole('menuitemradio')
    expect(options.map((option) => option.textContent)).toEqual([
      'Paper',
      'Graphite',
    ])
    expect(options[0]).toHaveAttribute('aria-checked', 'true')
    expect(options[1]).toHaveAttribute('aria-checked', 'false')
  })

  it('previews each option in its own palette and the current theme', async () => {
    const user = userEvent.setup()
    renderPicker({ palette: 'paper', theme: 'dark' })

    await user.click(screen.getByRole('button', { name: /Color palette/ }))

    // The swatch strips scope the palette tokens locally; that attribute pair is
    // the entire mechanism by which a preview shows foreign colours.
    const strips = screen
      .getAllByRole('menuitemradio')
      .map((option) => option.querySelector('[data-palette]'))
    expect(strips.map((strip) => strip?.getAttribute('data-palette'))).toEqual([
      'paper',
      'graphite',
    ])
    for (const strip of strips) {
      expect(strip).toHaveAttribute('data-theme', 'dark')
      expect(strip?.children).toHaveLength(SWATCH_TOKENS.length)
    }
  })

  it('reports the chosen palette and closes', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderPicker({ palette: 'paper' })

    await user.click(screen.getByRole('button', { name: /Color palette/ }))
    await user.click(screen.getByRole('menuitemradio', { name: 'Graphite' }))

    expect(onSelect).toHaveBeenCalledWith('graphite')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes on an outside click without choosing anything', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderPicker({})

    await user.click(screen.getByRole('button', { name: /Color palette/ }))
    await user.click(document.body)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('closes on Escape and hands focus back to the trigger', async () => {
    const user = userEvent.setup()
    renderPicker({})

    const trigger = screen.getByRole('button', { name: /Color palette/ })
    await user.click(trigger)
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('opens onto the current choice and walks the list with the arrow keys', async () => {
    const user = userEvent.setup()
    renderPicker({ palette: 'paper' })

    await user.click(screen.getByRole('button', { name: /Color palette/ }))
    const [paper, graphite] = screen.getAllByRole('menuitemradio')
    expect(paper).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(graphite).toHaveFocus()

    // Both ends wrap, so the list is never a dead end.
    await user.keyboard('{ArrowDown}')
    expect(paper).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(graphite).toHaveFocus()
  })
})
