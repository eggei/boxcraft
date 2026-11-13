// Cross-tab change notices for the scene store. IndexedDB is shared by every
// tab on the origin but nothing tells a tab when another one writes to it; this
// is that signal. A notice only names what changed — receivers re-read the
// records themselves, so the store stays the single source of truth.

export const SCENES_CHANNEL = 'boxcraft-scenes'

export interface SceneChange {
  /**
   * `save` and `delete` name the records they touched; `replace` swapped the
   * whole store (an import), so receivers re-read all of it.
   */
  type: 'save' | 'delete' | 'replace'
  ids: string[]
}

export interface SceneChannel {
  post(change: SceneChange): void
  close(): void
}

function isSceneChange(data: unknown): data is SceneChange {
  if (typeof data !== 'object' || data === null) return false
  const { type, ids } = data as Partial<SceneChange>
  return (
    (type === 'save' || type === 'delete' || type === 'replace') &&
    Array.isArray(ids) &&
    ids.every((id) => typeof id === 'string')
  )
}

/**
 * Listen for other tabs' changes and get a way to announce this tab's. Where
 * BroadcastChannel does not exist the channel is inert: tabs simply don't hear
 * about each other, as before.
 */
export function openSceneChannel(
  onChange: (change: SceneChange) => void,
): SceneChannel {
  if (typeof BroadcastChannel === 'undefined') {
    return { post() {}, close() {} }
  }
  const channel = new BroadcastChannel(SCENES_CHANNEL)
  let open = true
  channel.onmessage = (event: MessageEvent) => {
    if (isSceneChange(event.data)) onChange(event.data)
  }
  return {
    post(change) {
      // A save can finish after the hook that issued it unmounted.
      if (open) channel.postMessage(change)
    },
    close() {
      open = false
      channel.close()
    },
  }
}
