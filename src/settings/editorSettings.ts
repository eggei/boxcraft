// Headless editor-settings module.
//
// The preferences that shape the L3 editing surface — nothing about *what* a
// scene is, only how the person editing it likes to work. Pure: parsing a
// stored blob and flipping a field. No storage, no DOM, no React; the adapter
// hook does all of that, exactly as the theme module is arranged.

export const EDITOR_SIDES = ['left', 'right'] as const

/** Which half of the split the code lives in; the stage takes the other. */
export type EditorSide = (typeof EDITOR_SIDES)[number]

export interface EditorSettings {
  /** Re-indent the source when the editor loses focus. */
  autoFormat: boolean
  editorSide: EditorSide
}

/** Storage key holding the user's preferences, if they have changed any. */
export const EDITOR_SETTINGS_KEY = 'boxcraft:editor-settings'

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  autoFormat: true,
  editorSide: 'left',
}

function isEditorSide(value: unknown): value is EditorSide {
  return EDITOR_SIDES.includes(value as EditorSide)
}

/**
 * The settings to start with. Read field by field so an older or hand-mangled
 * blob still contributes what it does have — a preference we can't understand
 * is worth exactly one default, not a reset of the rest.
 */
export function parseEditorSettings(raw: string | null): EditorSettings {
  let stored: unknown
  try {
    stored = raw === null ? null : JSON.parse(raw)
  } catch {
    return DEFAULT_EDITOR_SETTINGS
  }
  if (typeof stored !== 'object' || stored === null) return DEFAULT_EDITOR_SETTINGS

  const { autoFormat, editorSide } = stored as Partial<EditorSettings>
  return {
    autoFormat:
      typeof autoFormat === 'boolean'
        ? autoFormat
        : DEFAULT_EDITOR_SETTINGS.autoFormat,
    editorSide: isEditorSide(editorSide)
      ? editorSide
      : DEFAULT_EDITOR_SETTINGS.editorSide,
  }
}

export function serializeEditorSettings(settings: EditorSettings): string {
  return JSON.stringify(settings)
}

export function toggleAutoFormat(settings: EditorSettings): EditorSettings {
  return { ...settings, autoFormat: !settings.autoFormat }
}

export function toggleEditorSide(settings: EditorSettings): EditorSettings {
  return {
    ...settings,
    editorSide: settings.editorSide === 'left' ? 'right' : 'left',
  }
}
