import { useEffect, useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { WithTooltip } from '@/components/ui/tooltip'
import { activeScenes, type Scene } from '@/scenes/sceneList'
import {
  buildLibrary,
  libraryFilename,
  parseLibrary,
  serializeLibrary,
  type ImportMode,
  type LibraryFile,
} from './libraryFile'
import { downloadFile } from './transfer'

interface Pending {
  filename: string
  library: LibraryFile
  skipped: number
}

/**
 * Header controls for backing the library up and restoring it. Export is one
 * click; import picks a file, reports what is in it, and then asks whether to add
 * to the current library or replace it — replacing is destructive, so it never
 * happens as a side effect of picking a file.
 */
export function LibraryControls({
  scenes,
  onImport,
}: {
  scenes: Scene[]
  onImport: (incoming: Scene[], mode: ImportMode) => void | Promise<void>
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(
    function dismissToast() {
      if (!status) return
      const timer = setTimeout(() => setStatus(null), 4000)
      return () => clearTimeout(timer)
    },
    [status],
  )

  function handleExport() {
    const library = buildLibrary(scenes, Date.now())
    downloadFile(libraryFilename(library.exportedAt), serializeLibrary(library))
    setStatus(`Exported ${count(library.scenes.length, 'scene')}`)
  }

  async function handleFilePicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Clear it up front so re-picking the same file still fires a change event.
    event.target.value = ''
    if (!file) return

    setStatus(null)
    const result = parseLibrary(await file.text())
    if (!result.ok) {
      setPending(null)
      setError(result.error)
      return
    }
    setError(null)
    setPending({
      filename: file.name,
      library: result.library,
      skipped: result.skipped,
    })
  }

  async function confirmImport(mode: ImportMode) {
    if (!pending || busy) return
    const imported = pending.library.scenes.length
    setBusy(true)
    try {
      await onImport(pending.library.scenes, mode)
      setStatus(
        mode === 'replace'
          ? `Library replaced with ${count(imported, 'scene')}`
          : `Imported ${count(imported, 'scene')}`,
      )
      setPending(null)
    } finally {
      setBusy(false)
    }
  }

  function dismiss() {
    setPending(null)
    setError(null)
  }

  return (
    <>
      {/*
        The trigger is the wrapping span, not the button: a disabled button
        emits no pointer events, and "why is this greyed out?" is exactly when
        the hint is worth having.
      */}
      <WithTooltip
        tip={
          scenes.length === 0
            ? 'Nothing to export yet — the library is empty'
            : 'Download every scene as a JSON backup'
        }
      >
        <span className="inline-flex">
          <button
            type="button"
            onClick={handleExport}
            disabled={scenes.length === 0}
            aria-label="Export library"
            className="hover:bg-muted text-muted-foreground rounded-md border p-2 disabled:pointer-events-none disabled:opacity-50"
          >
            <Download className="size-4" />
          </button>
        </span>
      </WithTooltip>
      <WithTooltip tip="Restore scenes from a JSON backup">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          aria-label="Import library"
          className="hover:bg-muted text-muted-foreground rounded-md border p-2"
        >
          <Upload className="size-4" />
        </button>
      </WithTooltip>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        aria-label="Library file"
        className="hidden"
        onChange={handleFilePicked}
      />

      {(pending || error) && (
        <ImportDialog
          pending={pending}
          error={error}
          busy={busy}
          onConfirm={confirmImport}
          onDismiss={dismiss}
        />
      )}

      {status && <Toast>{status}</Toast>}
    </>
  )
}

function ImportDialog({
  pending,
  error,
  busy,
  onConfirm,
  onDismiss,
}: {
  pending: Pending | null
  error: string | null
  busy: boolean
  onConfirm: (mode: ImportMode) => void
  onDismiss: () => void
}) {
  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-library-title"
        className="bg-background w-full max-w-[420px] rounded-lg border p-5 shadow-lg"
        // The dialog owns the keyboard while it is up, so App's single-key
        // shortcuts (N for a new scene) can't fire behind it.
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Escape') onDismiss()
        }}
      >
        <h2 id="import-library-title" className="text-base font-semibold">
          Import library
        </h2>

        {error ? (
          <>
            <p className="text-muted-foreground mt-2 text-sm">{error}</p>
            <div className="mt-5 flex justify-end">
              <WithTooltip tip="Dismiss — nothing was imported">
                <button
                  type="button"
                  autoFocus
                  onClick={onDismiss}
                  className="hover:bg-muted rounded-md border px-3 py-1.5 text-sm"
                >
                  Close
                </button>
              </WithTooltip>
            </div>
          </>
        ) : (
          pending && (
            <>
              <p className="text-muted-foreground mt-2 text-sm">
                <span className="font-mono">{pending.filename}</span> —{' '}
                {summarize(pending)}
              </p>
              {pending.skipped > 0 && (
                <p className="text-muted-foreground mt-1 text-sm">
                  {count(pending.skipped, 'entry', 'entries')} couldn't be read
                  and will be skipped.
                </p>
              )}
              <p className="mt-3 text-sm">
                Add these scenes to your library, or replace everything you have
                now with them?
              </p>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <WithTooltip tip="Dismiss — nothing will be imported">
                  <button
                    type="button"
                    onClick={onDismiss}
                    disabled={busy}
                    className="hover:bg-muted rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </WithTooltip>
                <WithTooltip tip="Discard every scene you have now and keep only the imported ones">
                  <button
                    type="button"
                    onClick={() => onConfirm('replace')}
                    disabled={busy}
                    className="bg-destructive hover:bg-destructive/90 rounded-md px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    Replace library
                  </button>
                </WithTooltip>
                <WithTooltip tip="Keep your scenes and add the imported ones alongside them">
                  <button
                    type="button"
                    autoFocus
                    onClick={() => onConfirm('merge')}
                    disabled={busy}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    Add to library
                  </button>
                </WithTooltip>
              </div>
            </>
          )
        )}
      </div>
    </div>
  )
}

/**
 * Status line under the header — deliberately not at the bottom, where the
 * delete-undo toast lives, so the two can never land on top of each other.
 */
function Toast({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="bg-background fixed left-1/2 top-16 z-20 -translate-x-1/2 rounded-lg border px-4 py-2 text-sm shadow-md"
    >
      {children}
    </div>
  )
}

function summarize({ library }: Pending): string {
  const active = activeScenes(library.scenes).length
  const archived = library.scenes.length - active
  const parts = [count(active, 'scene')]
  if (archived > 0) parts.push(`${archived} archived`)
  if (library.exportedAt > 0) {
    parts.push(
      `exported ${new Date(library.exportedAt).toLocaleDateString(undefined, {
        dateStyle: 'medium',
      })}`,
    )
  }
  return parts.join(', ')
}

function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`
}
