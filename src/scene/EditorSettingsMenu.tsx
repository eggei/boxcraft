import { Settings } from 'lucide-react'
import { WithTooltip } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
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
 * The floating gear in the corner of the code pane: how this person likes to
 * edit, kept out of the way until asked for. Controlled — it owns no state and
 * reports every tick to the pane, which persists it.
 */
export function EditorSettingsMenu({
  settings,
  onToggleAutoFormat,
  onToggleEditorSide,
}: EditorSettingsMenuProps) {
  return (
    <div className="absolute top-3 right-3 z-10">
      <DropdownMenu>
        <WithTooltip tip="Editor settings — formatting and layout">
          <DropdownMenuTrigger
            aria-label="Editor settings"
            className="bg-popover shadow-raised text-muted-foreground hover:text-foreground flex size-9 items-center justify-center rounded-lg border transition-colors"
          >
            <Settings className="size-4" />
          </DropdownMenuTrigger>
        </WithTooltip>

        {/* Aligned to the trigger's right edge — the gear hugs the pane's
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
          <DropdownMenuCheckboxItem
            checked={settings.editorSide === 'right'}
            onCheckedChange={onToggleEditorSide}
          >
            <span className="flex flex-col">
              Code on the right
              <span className="text-muted-foreground text-xs">
                Swap the code and the scene
              </span>
            </span>
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
