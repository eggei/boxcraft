import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDITOR_SETTINGS,
  parseEditorSettings,
  serializeEditorSettings,
  toggleAutoFormat,
  toggleEditorSide,
  toggleVimMode,
} from "./editorSettings";

describe("parseEditorSettings", () => {
  it("starts with auto-format on, the editor on the left and Vim off", () => {
    expect(parseEditorSettings(null)).toEqual({
      autoFormat: true,
      editorSide: "left",
      vimMode: false,
    });
  });

  it("round-trips what was stored", () => {
    const settings = { autoFormat: false, editorSide: "right", vimMode: true } as const;

    expect(parseEditorSettings(serializeEditorSettings(settings))).toEqual(settings);
  });

  it("keeps Vim mode on across a round trip of every other combination too", () => {
    for (const autoFormat of [true, false]) {
      for (const editorSide of ["left", "right"] as const) {
        for (const vimMode of [true, false]) {
          const settings = { autoFormat, editorSide, vimMode };

          expect(parseEditorSettings(serializeEditorSettings(settings))).toEqual(settings);
        }
      }
    }
  });

  it("reads a blob saved before Vim mode existed, with Vim off and the rest intact", () => {
    expect(parseEditorSettings('{"autoFormat":false,"editorSide":"right"}')).toEqual({
      autoFormat: false,
      editorSide: "right",
      vimMode: false,
    });
  });

  it("falls back to the defaults for a blob that is not settings at all", () => {
    expect(parseEditorSettings("not json")).toEqual(DEFAULT_EDITOR_SETTINGS);
    expect(parseEditorSettings('"left"')).toEqual(DEFAULT_EDITOR_SETTINGS);
  });

  it("keeps the fields it recognises and defaults only the rest", () => {
    expect(parseEditorSettings('{"editorSide":"right","autoFormat":"yes"}')).toEqual({
      autoFormat: true,
      editorSide: "right",
      vimMode: false,
    });
    expect(parseEditorSettings('{"autoFormat":false,"editorSide":"up"}')).toEqual({
      autoFormat: false,
      editorSide: "left",
      vimMode: false,
    });
  });

  it("does not take a truthy non-boolean for Vim being on", () => {
    for (const vimMode of ["true", 1, "yes", {}, []]) {
      expect(parseEditorSettings(JSON.stringify({ vimMode })).vimMode).toBe(false);
    }
    expect(parseEditorSettings('{"vimMode":true,"autoFormat":"x"}')).toEqual({
      autoFormat: true,
      editorSide: "left",
      vimMode: true,
    });
  });
});

describe("toggles", () => {
  it("flip one field and leave the others alone", () => {
    const settings = DEFAULT_EDITOR_SETTINGS;

    expect(toggleAutoFormat(settings)).toEqual({
      autoFormat: false,
      editorSide: "left",
      vimMode: false,
    });
    expect(toggleEditorSide(settings)).toEqual({
      autoFormat: true,
      editorSide: "right",
      vimMode: false,
    });
    expect(toggleVimMode(settings)).toEqual({
      autoFormat: true,
      editorSide: "left",
      vimMode: true,
    });
  });

  it("are their own inverse", () => {
    const settings = { autoFormat: false, editorSide: "right", vimMode: true } as const;

    expect(toggleAutoFormat(toggleAutoFormat(settings))).toEqual(settings);
    expect(toggleEditorSide(toggleEditorSide(settings))).toEqual(settings);
    expect(toggleVimMode(toggleVimMode(settings))).toEqual(settings);
  });
});
