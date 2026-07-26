import { Settings } from 'lucide-react'
import { WithTooltip } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { EditorSettings } from '@/settings/editorSettings'

interface EditorSettingsMenuProps {
  settings: EditorSettings
  onToggleAutoFormat: () => void
  onToggleEditorSide: () => void
}

/**
 * The gear at the top of the editor's corner stack: how this person likes to
 * edit, kept out of the way until asked for. Controlled — it owns no state and
 * reports every change to the pane, which persists it. Positioning belongs to
 * the pane, so the whole stack can be laid out as one column.
 */
export function EditorSettingsMenu({
  settings,
  onToggleAutoFormat,
  onToggleEditorSide,
}: EditorSettingsMenuProps) {
  return (
    <DropdownMenu>
      <WithTooltip side="left" tip="Editor settings — formatting and layout">
        <DropdownMenuTrigger
          aria-label="Editor settings"
          className="bg-popover shadow-raised text-muted-foreground hover:text-foreground flex size-9 items-center justify-center rounded-lg border transition-colors"
        >
          <Settings className="size-4" />
        </DropdownMenuTrigger>
      </WithTooltip>

      {/* Aligned to the trigger's right edge — the stack hugs the pane's
          corner, so an end-aligned menu is the only one that stays inside. */}
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Editor</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={settings.autoFormat}
          onCheckedChange={onToggleAutoFormat}
        >
          <span className="flex flex-col">
            Auto-format
            {/* Says *when*, because a formatter that fires at a moment you
                can't predict is the one people turn off. */}
            <span className="text-muted-foreground text-xs">
              Re-indent when the editor loses focus
            </span>
          </span>
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Layout</DropdownMenuLabel>
        {/* Not a checkbox: the two sides are equal choices, not a state that is
            on or off. The label names where the code is going, so the item
            reads as the move it performs rather than as where things stand. */}
        <DropdownMenuItem onSelect={onToggleEditorSide}>
          {settings.editorSide === 'right'
            ? 'Code on the left'
            : 'Code on the right'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
