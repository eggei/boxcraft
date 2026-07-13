/**
 * Coalesces rapid `schedule()` calls (e.g. one per keystroke) into a single
 * debounced write, serializes saves so writes can never race/interleave, and
 * retries on failure without losing the pending value (Phase 5 — autosave
 * hardening).
 */
export interface AutosaveOptions {
  /** Debounce window before an idle schedule() triggers a save. */
  delayMs?: number
  /** Backoff before retrying a failed save. */
  retryDelayMs?: number
  onError?: (error: unknown) => void
}

export interface Autosave<T> {
  /** Record the latest value to save; resets the debounce timer. */
  schedule(value: T): void
  /** Force an immediate save of any pending value; resolves once it lands. */
  flush(): Promise<void>
  /** Cancel any pending debounce/retry timer (does not cancel an in-flight save). */
  dispose(): void
}

export function createAutosave<T>(
  save: (value: T) => Promise<void>,
  { delayMs = 400, retryDelayMs = 1000, onError }: AutosaveOptions = {},
): Autosave<T> {
  let latest: T
  let dirty = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let inFlight: Promise<void> | null = null

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function runSave(): Promise<void> {
    clearTimer()
    if (inFlight) return inFlight
    const value = latest
    dirty = false
    inFlight = save(value)
      .then(() => {
        inFlight = null
        if (dirty) return runSave()
      })
      .catch((error) => {
        inFlight = null
        dirty = true
        onError?.(error)
        timer = setTimeout(runSave, retryDelayMs)
      })
    return inFlight
  }

  return {
    schedule(value) {
      latest = value
      dirty = true
      clearTimer()
      timer = setTimeout(runSave, delayMs)
    },
    flush() {
      if (!dirty && !inFlight) return Promise.resolve()
      return runSave()
    },
    dispose() {
      clearTimer()
    },
  }
}
