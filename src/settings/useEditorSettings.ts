import { useCallback, useState } from 'react'
import {
  EDITOR_SETTINGS_KEY,
  parseEditorSettings,
  serializeEditorSettings,
  toggleAutoFormat,
  toggleEditorSide,
  type EditorSettings,
} from './editorSettings'

// Storage can throw (private mode, blocked cookies); a missing preference is
// never worth failing the app over, so both directions degrade to no-op.
function readStored(): string | null {
  try {
    return localStorage.getItem(EDITOR_SETTINGS_KEY)
  } catch {
    return null
  }
}

function store(settings: EditorSettings) {
  try {
    localStorage.setItem(EDITOR_SETTINGS_KEY, serializeEditorSettings(settings))
  } catch {
    // ignore
  }
}

/**
 * React/storage adapter over the pure editor-settings module: holds the active
 * preferences and persists every change, so the editor opens the way it was
 * left. Unlike the theme there is nothing to mirror onto the DOM — the settings
 * are read as props by the editor pane.
 */
export function useEditorSettings() {
  const [settings, setSettings] = useState<EditorSettings>(function resolveInitial() {
    return parseEditorSettings(readStored())
  })

  const update = useCallback(function update(
    change: (current: EditorSettings) => EditorSettings,
  ) {
    setSettings(function apply(current) {
      const next = change(current)
      store(next)
      return next
    })
  }, [])

  return {
    settings,
    toggleAutoFormat: useCallback(() => update(toggleAutoFormat), [update]),
    toggleEditorSide: useCallback(() => update(toggleEditorSide), [update]),
  }
}
