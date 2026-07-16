import { useEffect } from 'react'
import { Braces, MousePointer2, Square } from 'lucide-react'

export type Tool = 'select' | 'box' | 'js'

interface ToolbarProps {
  tool: Tool
  onToolChange: (tool: Tool) => void
}

const TOOLS: { id: Tool; label: string; key: string; Icon: typeof Square }[] = [
  { id: 'select', label: 'Select', key: 'V', Icon: MousePointer2 },
  { id: 'box', label: 'Box', key: 'B', Icon: Square },
  { id: 'js', label: 'Attach JS', key: 'J', Icon: Braces },
]

/**
 * Left-edge vertical floating toolbar (Excalidraw fashion). Controlled: it owns
 * no tool state, just renders the active tool and reports changes. `V`/`B`
 * switch tools unless the user is typing into a field.
 */
export function Toolbar({ tool, onToolChange }: ToolbarProps) {
  useEffect(
    function bindShortcuts() {
      function onKeyDown(event: KeyboardEvent) {
        if (event.metaKey || event.ctrlKey || event.altKey) return
        const target = event.target as HTMLElement | null
        if (
          target &&
          (target.isContentEditable ||
            ['INPUT', 'TEXTAREA'].includes(target.tagName))
        ) {
          return
        }
        const key = event.key.toLowerCase()
        if (key === 'v') onToolChange('select')
        else if (key === 'b') onToolChange('box')
        else if (key === 'j') onToolChange('js')
      }
      window.addEventListener('keydown', onKeyDown)
      return function unbind() {
        window.removeEventListener('keydown', onKeyDown)
      }
    },
    [onToolChange],
  )

  return (
    <div className="bg-background absolute top-1/2 left-3 z-10 flex -translate-y-1/2 flex-col gap-1 rounded-lg border p-1 shadow-md">
      {TOOLS.map(({ id, label, key, Icon }) => (
        <button
          key={id}
          type="button"
          aria-label={label}
          aria-pressed={tool === id}
          title={`${label} (${key})`}
          onClick={() => onToolChange(id)}
          className={
            'flex size-9 items-center justify-center rounded-md transition-colors ' +
            (tool === id
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-muted text-foreground')
          }
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  )
}
