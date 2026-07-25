import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import {
  PALETTES,
  SWATCH_TOKENS,
  paletteLabel,
  type Palette,
} from '@/theme/palette'
import { type Theme } from '@/theme/theme'

/**
 * A strip of swatches showing what a palette actually looks like. The trick is
 * that the strip sets `data-palette`/`data-theme` on itself: the token blocks
 * in index.css are attribute-scoped rather than `:root`-scoped, and custom
 * properties inherit, so the boxes below resolve to *that* palette's colours
 * even though the surrounding app is on another one. No colour values are
 * duplicated in JS.
 *
 * The theme is passed in so the preview shows the variant the user would
 * actually get — previewing light swatches while sitting in dark mode would be
 * a lie.
 */
function PaletteSwatches({
  palette,
  theme,
}: {
  palette: Palette
  theme: Theme
}) {
  return (
    <span
      data-palette={palette}
      data-theme={theme}
      aria-hidden="true"
      className="flex shrink-0 items-center gap-px rounded border p-px"
      style={{ borderColor: 'var(--line)', background: 'var(--bg)' }}
    >
      {SWATCH_TOKENS.map(function swatch(token) {
        return (
          <span
            key={token}
            className="size-3 rounded-[2px]"
            style={{ background: `var(${token})` }}
          />
        )
      })}
    </span>
  )
}

/**
 * Palette picker: a swatch-strip button that opens a small menu of palettes,
 * each previewed by its own swatches so the choice is visible before it is
 * made. Deliberately hand-rolled rather than pulled from a menu library — it is
 * one button and a list, and this keeps the header dependency-free.
 */
export function PalettePicker({
  palette,
  theme,
  onSelect,
}: {
  palette: Palette
  theme: Theme
  onSelect: (palette: Palette) => void
}) {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  useEffect(
    function dismissMenu() {
      if (!open) return

      function onPointerDown(event: PointerEvent) {
        const target = event.target as Node | null
        if (target && !container.current?.contains(target)) setOpen(false)
      }

      // Stop the Escape here: the app-level handler would otherwise also read
      // it as "exit the editor", and closing the menu is the nearer intent.
      function onKeyDown(event: KeyboardEvent) {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        setOpen(false)
        trigger.current?.focus()
      }

      document.addEventListener('pointerdown', onPointerDown)
      document.addEventListener('keydown', onKeyDown)
      return function stopListening() {
        document.removeEventListener('pointerdown', onPointerDown)
        document.removeEventListener('keydown', onKeyDown)
      }
    },
    [open],
  )

  // A `role="menu"` is expected to take the keyboard: open onto the current
  // choice, then walk it with the arrow keys.
  useEffect(
    function focusActiveOption() {
      if (!open) return
      menu.current
        ?.querySelector<HTMLElement>('[aria-checked="true"]')
        ?.focus()
    },
    [open],
  )

  function moveFocus(from: HTMLElement, delta: number) {
    const options = Array.from(
      menu.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ??
        [],
    )
    const next = options.indexOf(from) + delta
    options.at(next % options.length)?.focus()
  }

  function onMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const delta =
      event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (delta === 0) return
    event.preventDefault()
    moveFocus(event.target as HTMLElement, delta)
  }

  return (
    <div ref={container} className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Color palette: ${paletteLabel(palette)}`}
        title={`Color palette: ${paletteLabel(palette)}`}
        className="hover:bg-muted flex items-center rounded-md border p-1.5"
      >
        <PaletteSwatches palette={palette} theme={theme} />
      </button>

      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label="Color palette"
          onKeyDown={onMenuKeyDown}
          className="bg-panel-raised shadow-panel absolute right-0 top-full z-30 mt-1 w-48 rounded-lg border p-1"
        >
          {PALETTES.map(function paletteOption(option) {
            const active = option.id === palette
            return (
              <button
                key={option.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  onSelect(option.id)
                  setOpen(false)
                }}
                className="hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
              >
                <PaletteSwatches palette={option.id} theme={theme} />
                <span className="flex-1">{option.label}</span>
                {active && <Check className="size-4 shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
