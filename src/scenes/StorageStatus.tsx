import { WithTooltip } from '@/components/ui/tooltip'
import { buildLibrary, libraryFilename, serializeLibrary } from '@/library/libraryFile'
import { downloadFile } from '@/library/transfer'
import { cn } from '@/lib/utils'
import type { Scene } from './sceneList'
import type { SaveState } from './useScenes'

function exportLibrary(scenes: Scene[]) {
  const library = buildLibrary(scenes, Date.now())
  downloadFile(libraryFilename(library.exportedAt), serializeLibrary(library))
}

/**
 * Shown in place of the library when IndexedDB can't be opened at all. Nothing
 * typed here would survive a reload, so the page says that up front; if any
 * scenes did reach memory, the library export is the one way to keep them.
 */
export function StorageUnavailable({ scenes }: { scenes: Scene[] }) {
  return (
    <div role="alert" className="mx-auto flex max-w-lg flex-col gap-3 p-8 text-sm">
      <p className="text-base font-medium">
        Storage is unavailable — your scenes can't be saved in this browser
      </p>
      <p className="text-muted-foreground">
        BoxCraft keeps your library in this browser's storage, which is blocked or
        failing here. Private browsing and blocked site data are the usual causes;
        try a regular window, or allow site data for this page, and reload.
      </p>
      {scenes.length > 0 && (
        <div>
          <WithTooltip tip="Download the scenes still in memory as a library file">
            <button
              type="button"
              onClick={() => exportLibrary(scenes)}
              className="hover:bg-muted rounded-md border px-3 py-1.5"
            >
              Export library
            </button>
          </WithTooltip>
        </div>
      )}
    </div>
  )
}

const SAVE_LABELS: Record<SaveState, string> = {
  saved: 'Saved',
  saving: 'Saving…',
  error: 'Save failed',
}

const SAVE_TIPS: Record<SaveState, string> = {
  saved: 'Every change is stored in this browser',
  saving: 'Storing your latest changes in this browser',
  error:
    "Your latest changes couldn't be stored in this browser. Export the library to keep a copy.",
}

/**
 * A quiet header readout of autosave; it only asks for attention on failure.
 * It is a live region but not role="status" — that role belongs to the toasts.
 */
export function SaveIndicator({ state }: { state: SaveState }) {
  return (
    <WithTooltip tip={SAVE_TIPS[state]}>
      <span
        aria-live="polite"
        tabIndex={0}
        className={cn(
          'rounded-md px-2 py-1 text-xs',
          state === 'error' ? 'text-destructive font-medium' : 'text-muted-foreground',
        )}
      >
        {SAVE_LABELS[state]}
      </span>
    </WithTooltip>
  )
}
