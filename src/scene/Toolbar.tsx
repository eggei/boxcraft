import { MousePointer2, Square, Code2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Tool } from './tools'

/**
 * The left-edge floating toolbar (Excalidraw-style, DESIGN.md §6). Presentational
 * and controlled: it renders the tools and reflects the active one, but the
 * workspace owns tool state and keyboard shortcuts.
 */
export function Toolbar({
  tool,
  onToolChange,
}: {
  tool: Tool
  onToolChange: (tool: Tool) => void
}) {
  return (
    <div
      role="toolbar"
      aria-label="Canvas tools"
      className="absolute left-3 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-1 rounded-xl border border-border bg-background/90 p-1 shadow-lg backdrop-blur"
    >
      <ToolButton
        label="Select (V)"
        active={tool === 'select'}
        onClick={() => onToolChange('select')}
      >
        <MousePointer2 />
      </ToolButton>
      <ToolButton label="Box (B)" active={tool === 'box'} onClick={() => onToolChange('box')}>
        <Square />
      </ToolButton>
      <ToolButton label="Attach JS (J)" active={tool === 'js'} onClick={() => onToolChange('js')}>
        <Code2 />
      </ToolButton>
    </div>
  )
}

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string
  active: boolean
  disabled?: boolean
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(active && 'bg-muted text-foreground')}
    >
      {children}
    </Button>
  )
}
