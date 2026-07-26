import { useEffect } from 'react'
import { Braces, MousePointer2, Square } from 'lucide-react'
import { WithTooltip } from '@/components/ui/tooltip'

export type Tool = 'select' | 'box' | 'js'

interface ToolbarProps {
  tool: Tool
  onToolChange: (tool: Tool) => void
}

const TOOLS: {
  id: Tool
  label: string
  key: string
  /** What the tool does once it is picked, for the hover hint. */
  tip: string
  Icon: typeof Square
}[] = [
  {
    id: 'select',
    label: 'Select',
    key: 'V',
    tip: 'Pick a box on the stage to select it',
    Icon: MousePointer2,
  },
  {
    id: 'box',
    label: 'Box',
    key: 'B',
    tip: 'Drag on the stage to draw a new box',
    Icon: Square,
  },
  {
    id: 'js',
    label: 'Attach JS',
    key: 'J',
    tip: 'Click a box to give it a script hook',
    Icon: Braces,
  },
]

/**
 * The vertical floating tool palette (Excalidraw fashion). Controlled: it owns
 * no tool state, just renders the active tool and reports changes. `V`/`B`/`J`
 * switch tools unless the user is typing into a field. Where it sits is the
 * pane's business — it renders a panel, not a position.
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
    <div className="bg-popover shadow-raised flex flex-col gap-1 rounded-lg border p-1">
      {TOOLS.map(({ id, label, key, tip, Icon }) => (
        // Side "left": the palette hugs the pane's right edge, so a tip
        // anywhere else would hang off it or cover the stage it describes.
        <WithTooltip key={id} side="left" tip={`${tip} (${key})`}>
          <button
            type="button"
            aria-label={label}
            aria-pressed={tool === id}
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
        </WithTooltip>
      ))}
    </div>
  )
}
