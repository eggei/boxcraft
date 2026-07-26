import * as React from 'react'

/**
 * The gate in front of an action that can't be taken back. Rendering it *is*
 * asking: the caller holds the pending action in state and only performs it from
 * `onConfirm`, so nothing has happened yet while this is on screen.
 */
export function ConfirmDialog({
  title,
  confirmLabel,
  onConfirm,
  onCancel,
  children,
}: {
  title: string
  /** Names the action, not the dialog: “Delete scene”, not “OK”. */
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  /** What is about to happen, and why it can't be undone. */
  children: React.ReactNode
}) {
  const titleId = React.useId()

  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-background w-full max-w-[420px] rounded-lg border p-5 shadow-lg"
        // The dialog owns the keyboard while it is up, so App's single-key
        // shortcuts (N for a new scene) can't fire behind it.
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Escape') onCancel()
        }}
      >
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
        <div className="text-muted-foreground mt-2 space-y-2 text-sm">
          {children}
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {/*
            Cancel takes the focus, not the destructive button: an Enter pressed
            out of habit on a dialog the user hasn't read yet should back out.
          */}
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            className="hover:bg-muted rounded-md border px-3 py-1.5 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="bg-destructive hover:bg-destructive/90 rounded-md px-3 py-1.5 text-sm text-white"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
