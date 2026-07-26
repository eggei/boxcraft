import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EDITOR_SETTINGS,
  parseEditorSettings,
  serializeEditorSettings,
  toggleAutoFormat,
  toggleEditorSide,
} from './editorSettings'

describe('parseEditorSettings', () => {
  it('starts with auto-format on and the editor on the left', () => {
    expect(parseEditorSettings(null)).toEqual({
      autoFormat: true,
      editorSide: 'left',
    })
  })

  it('round-trips what was stored', () => {
    const settings = { autoFormat: false, editorSide: 'right' } as const

    expect(parseEditorSettings(serializeEditorSettings(settings))).toEqual(settings)
  })

  it('falls back to the defaults for a blob that is not settings at all', () => {
    expect(parseEditorSettings('not json')).toEqual(DEFAULT_EDITOR_SETTINGS)
    expect(parseEditorSettings('"left"')).toEqual(DEFAULT_EDITOR_SETTINGS)
  })

  it('keeps the fields it recognises and defaults only the rest', () => {
    expect(parseEditorSettings('{"editorSide":"right","autoFormat":"yes"}')).toEqual({
      autoFormat: true,
      editorSide: 'right',
    })
    expect(parseEditorSettings('{"autoFormat":false,"editorSide":"up"}')).toEqual({
      autoFormat: false,
      editorSide: 'left',
    })
  })
})

describe('toggles', () => {
  it('flip one field and leave the other alone', () => {
    const settings = DEFAULT_EDITOR_SETTINGS

    expect(toggleAutoFormat(settings)).toEqual({ autoFormat: false, editorSide: 'left' })
    expect(toggleEditorSide(settings)).toEqual({ autoFormat: true, editorSide: 'right' })
  })

  it('are their own inverse', () => {
    const settings = { autoFormat: false, editorSide: 'right' } as const

    expect(toggleAutoFormat(toggleAutoFormat(settings))).toEqual(settings)
    expect(toggleEditorSide(toggleEditorSide(settings))).toEqual(settings)
  })
})
