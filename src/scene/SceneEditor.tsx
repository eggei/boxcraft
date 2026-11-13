import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Decoration, EditorView, ViewPlugin } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import {
  Compartment,
  EditorState,
  MapMode,
  RangeSetBuilder,
  StateEffect,
  StateField,
  Transaction,
} from "@codemirror/state";
import type { Extension, TransactionSpec } from "@codemirror/state";
import { html } from "@codemirror/lang-html";
import { basicSetup } from "codemirror";
import { colorSwatches } from "./colorSwatches";
import { editorTheme } from "./editorTheme";
import { indentAllChanges, indentConfig } from "./format";
import { startInsertMode, vimKeybindings } from "./vimMode";
import {
  attachJs,
  boxAtOffset,
  createBox,
  detachJs,
  ensureRule,
  listBoxes,
  rename,
  resolveTokens,
  ruleRangeOf,
  type BoxPlacement,
  type CreateBoxProblem,
  type RenameProblem,
  type TokenRange,
} from "./document";

export interface SceneEditorHandle {
  /**
   * Insert a box at `placement` and land the cursor inside its new rule.
   * Returns why it couldn't (no canvas, no `<style>`…), or null on success.
   */
  createBox: (placement: BoxPlacement) => CreateBoxProblem | null;
  /** Select a box: ensure it has a rule, scroll to it, land the cursor inside. */
  selectBox: (handle: string) => void;
  /**
   * Rename a box everywhere in one undo step. Returns why the name was refused
   * (see `validateBoxName`), or null when it was applied.
   */
  renameBox: (handle: string, newName: string) => RenameProblem | null;
  /** Attach JS to a box (or jump to its line) and land the cursor to code. */
  attachJs: (handle: string) => void;
  /** Detach a box's JS wiring in one undo step. */
  detachJs: (handle: string) => void;
  /** Re-indent the document now, whatever the auto-format setting says. */
  format: () => void;
}

interface SceneEditorProps {
  value: string;
  onChange: (source: string) => void;
  /** Fires with the box whose rule the cursor is in (null when outside any). */
  onCursorBox?: (handle: string | null) => void;
  /** Re-indent the whole document whenever the editor loses focus. */
  autoFormat?: boolean;
  /** Modal, Vim-style keybindings. Switchable on a live editor. */
  vimMode?: boolean;
  /** Vim's `:q` — the editor can't leave anywhere itself, so the host does. */
  onQuit?: () => void;
}

/** Chip / error decorations over managed identity tokens, computed from source. */
function chipDecorations(source: string): DecorationSet {
  const ranges: (TokenRange & { resolved: boolean })[] = [];
  for (const token of resolveTokens(source)) {
    for (const r of token.ranges) ranges.push({ ...r, resolved: token.resolved });
  }
  ranges.sort((a, b) => a.from - b.from);

  const builder = new RangeSetBuilder<Decoration>();
  for (const r of ranges) {
    builder.add(r.from, r.to, Decoration.mark({ class: r.resolved ? "bc-chip" : "bc-error" }));
  }
  return builder.finish();
}

const chipPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = chipDecorations(view.state.doc.toString());
    }
    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.decorations = chipDecorations(update.state.doc.toString());
      }
    }
  },
  { decorations: (v) => v.decorations },
);

// The selected box's rule gets a background highlight, set imperatively.
// The range maps through changes, so it stays on the rule when the same
// transaction also drops an unused landing line above it.
const setSelectedRule = StateEffect.define<TokenRange | null>({
  map: (range, mapping) =>
    range && { from: mapping.mapPos(range.from), to: mapping.mapPos(range.to) },
});
const selectedRuleField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setSelectedRule)) {
        deco = effect.value
          ? Decoration.set(
              Decoration.mark({ class: "bc-selected-rule" }).range(
                effect.value.from,
                effect.value.to,
              ),
            )
          : Decoration.none;
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// The indented blank line a generated rule or script hook parks the cursor on,
// ready to type into. Left unused it would linger in the source as stray
// whitespace, so it is tracked and taken out again once the cursor moves off
// it or the editor loses focus. Only that one app-made line is ever removed:
// the person's own blank lines are never touched, and the formatter stays a
// pure re-indent.
const setLandingLine = StateEffect.define<number | null>();
const landingLineField = StateField.define<number | null>({
  create() {
    return null;
  },
  update(pos, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setLandingLine)) return effect.value;
    }
    if (pos === null) return null;
    // Edits next to it (or a whole-document replace) mean it isn't ours to
    // tidy any more; typing into it makes it the person's line.
    const mapped = tr.changes.mapPos(pos, -1, MapMode.TrackDel);
    if (mapped === null || tr.newDoc.lineAt(mapped).text.trim() !== "") return null;
    return mapped;
  },
});

/**
 * The transaction that deletes the landing line, if one is tracked and still
 * blank. Kept out of the undo history: it only tidies what the app itself
 * added, and an undo step that merely brings back a blank line would read as
 * a no-op.
 */
function landingLineRemoval(state: EditorState): TransactionSpec | null {
  const pos = state.field(landingLineField, false);
  if (pos == null) return null;
  const line = state.doc.lineAt(pos);
  if (line.text.trim() !== "") return null;
  const first = line.number === 1;
  return {
    changes: {
      from: first ? line.from : line.from - 1,
      to: first ? Math.min(line.to + 1, state.doc.length) : line.to,
    },
    effects: setLandingLine.of(null),
    annotations: Transaction.addToHistory.of(false),
  };
}

/**
 * Remove an unused landing line now. The tools call this before rewriting the
 * document, since a whole-document replace would otherwise carry it along.
 */
function dropLandingLine(view: EditorView) {
  const removal = landingLineRemoval(view.state);
  if (removal) view.dispatch(removal);
}

/** Moving the cursor off an unused landing line removes it, in the same step. */
const dropLandingLineOnLeave = EditorState.transactionFilter.of((tr) => {
  if (tr.docChanged || !tr.selection) return tr;
  const pos = tr.startState.field(landingLineField, false);
  if (pos == null) return tr;
  const line = tr.startState.doc.lineAt(pos);
  const head = tr.selection.main.head;
  if (head >= line.from && head <= line.to) return tr;
  const removal = landingLineRemoval(tr.startState);
  return removal ? [tr, removal] : tr;
});

/**
 * Re-indent the document in one transaction. Whitespace-only, so the cursor and
 * every decoration map straight through and a single undo restores the old
 * shape. A no-op when the source is already formatted — dispatching an empty
 * change would still push an undo step.
 */
function formatDocument(view: EditorView) {
  const changes = indentAllChanges(view.state);
  if (changes.empty) return;
  // The update listener below lifts the new source out via `onChange`.
  view.dispatch({ changes });
}

// Where Vim lives in the extension list. A compartment so the setting can be
// flipped on an open editor without rebuilding it — which would cost the undo
// history — and first in the list because Vim has to see a key before any other
// keymap does.
const vimCompartment = new Compartment();

/**
 * What the compartment holds: Vim when it is on, nothing when off. `:q` goes
 * through a ref so the handler stays current without the extension being rebuilt
 * whenever the host passes a new function.
 */
function vimExtension(on: boolean, onQuitRef: { current: (() => void) | undefined }): Extension {
  return on ? vimKeybindings({ onQuit: () => onQuitRef.current?.() }) : [];
}

/**
 * CodeMirror 6 adapter over the scene source. The domain module owns what the
 * source becomes, where the cursor lands, and which tokens are managed; this
 * component only translates that into transactions, decorations, and sync
 * callbacks. It holds no parallel model.
 */
export const SceneEditor = forwardRef<SceneEditorHandle, SceneEditorProps>(function SceneEditor(
  { value, onChange, onCursorBox, autoFormat = true, vimMode = false, onQuit },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onCursorBoxRef = useRef(onCursorBox);
  const onQuitRef = useRef(onQuit);
  // Read at blur time rather than baked into the mounted extensions, so
  // flipping the setting never costs the editor its state or history.
  const autoFormatRef = useRef(autoFormat);
  // What the view was last configured with, so the reconfigure effect below
  // can tell a real change from the initial render.
  const vimModeRef = useRef(vimMode);
  onChangeRef.current = onChange;
  onCursorBoxRef.current = onCursorBox;
  onQuitRef.current = onQuit;
  autoFormatRef.current = autoFormat;

  useEffect(function mount() {
    const syncSelection = EditorView.updateListener.of(function report(update) {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString());
      }
      if (update.docChanged || update.selectionSet) {
        const head = update.state.selection.main.head;
        onCursorBoxRef.current?.(boxAtOffset(update.state.doc.toString(), head));
      }
    });

    // Formatting on blur is this app's "format on save": there is no save,
    // and reformatting mid-keystroke would fight the person typing. Leaving
    // the editor — for the stage, the toolbar, anywhere — is the moment the
    // document is between thoughts and safe to tidy. An unused landing line
    // goes first, whatever the setting — it was never the person's code.
    const formatOnBlur = EditorView.domEventHandlers({
      blur(_event, view) {
        dropLandingLine(view);
        if (autoFormatRef.current) formatDocument(view);
      },
    });

    const extensions: Extension[] = [
      vimCompartment.of(vimExtension(vimModeRef.current, onQuitRef)),
      basicSetup,
      editorTheme,
      html(),
      indentConfig,
      EditorView.lineWrapping,
      chipPlugin,
      colorSwatches,
      selectedRuleField,
      landingLineField,
      dropLandingLineOnLeave,
      syncSelection,
      formatOnBlur,
    ];

    const view = new EditorView({
      parent: hostRef.current as HTMLElement,
      state: EditorState.create({ doc: value, extensions }),
    });
    viewRef.current = view;
    return function unmount() {
      view.destroy();
      viewRef.current = null;
    };
    // Mount once; external `value` changes are handled by the sync effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect external source changes (restore-from-persistence) into the doc,
  // without disturbing the cursor while the user is typing (value === doc).
  useEffect(
    function syncExternalValue() {
      const view = viewRef.current;
      if (!view) return;
      const current = view.state.doc.toString();
      if (value !== current) {
        view.dispatch({
          changes: { from: 0, to: current.length, insert: value },
        });
      }
    },
    [value],
  );

  // Vim is swapped in and out of the live editor: document, selection and
  // undo history all carry across, so switching it on mid-edit loses nothing.
  useEffect(
    function syncVimMode() {
      const view = viewRef.current;
      if (!view || vimModeRef.current === vimMode) return;
      vimModeRef.current = vimMode;
      view.dispatch({
        effects: vimCompartment.reconfigure(vimExtension(vimMode, onQuitRef)),
        // Vim changes which element scrolls (see its theme), and the scroll
        // offset doesn't follow — without this the cursor is left off-screen.
        scrollIntoView: true,
      });
    },
    [vimMode],
  );

  // Turning the setting on (and opening an editor with it already on) tidies
  // the document there and then: the promise is "kept formatted", and a
  // checkbox that visibly does nothing until the next blur reads as broken.
  useEffect(
    function formatWhenEnabled() {
      const view = viewRef.current;
      if (view && autoFormat) formatDocument(view);
    },
    [autoFormat],
  );

  useImperativeHandle(ref, function handle() {
    return {
      createBox(placement) {
        const view = viewRef.current;
        if (!view) return null;
        dropLandingLine(view);
        const source = view.state.doc.toString();
        const result = createBox(source, placement);
        // Nowhere to draw: leave the document and the editor's mode alone and
        // let the host explain what's missing.
        if (!result.ok) return result.problem;
        startInsertMode(view);
        view.dispatch({
          changes: { from: 0, to: source.length, insert: result.source },
          selection: { anchor: result.cursor },
          scrollIntoView: true,
          effects: setLandingLine.of(result.cursor),
        });
        view.focus();
        onChangeRef.current(result.source);
        return null;
      },

      selectBox(handleId) {
        const view = viewRef.current;
        if (!view) return;
        dropLandingLine(view);
        const source = view.state.doc.toString();
        const result = ensureRule(source, handleId);
        const box = listBoxes(result.source).find((b) => b.handle === handleId);
        const range = box ? ruleRangeOf(result.source, box.className) : null;

        startInsertMode(view);
        view.dispatch({
          changes: result.created
            ? { from: 0, to: source.length, insert: result.source }
            : undefined,
          selection: { anchor: result.cursor },
          scrollIntoView: true,
          effects: [
            setSelectedRule.of(range),
            // A re-created rule parks the cursor on a fresh blank line.
            ...(result.created ? [setLandingLine.of(result.cursor)] : []),
          ],
        });
        view.focus();
        if (result.created) onChangeRef.current(result.source);
      },

      renameBox(handleId, newName) {
        const view = viewRef.current;
        if (!view) return null;
        dropLandingLine(view);
        const source = view.state.doc.toString();
        const { source: next, problem } = rename(source, handleId, newName);
        if (problem) return problem;
        if (next === source) return null;
        // A single transaction — one ⌘Z reverts the whole rename.
        view.dispatch({
          changes: { from: 0, to: source.length, insert: next },
        });
        onChangeRef.current(next);
        return null;
      },

      attachJs(handleId) {
        const view = viewRef.current;
        if (!view) return;
        dropLandingLine(view);
        const source = view.state.doc.toString();
        const result = attachJs(source, handleId);
        const attached = result.source !== source;
        startInsertMode(view);
        view.dispatch({
          // Re-attach returns the same source — just jump to the line.
          changes: attached ? { from: 0, to: source.length, insert: result.source } : undefined,
          selection: { anchor: result.cursor },
          scrollIntoView: true,
          // New wiring parks the cursor on a blank line below it.
          effects: attached ? setLandingLine.of(result.cursor) : [],
        });
        view.focus();
        if (result.source !== source) onChangeRef.current(result.source);
      },

      detachJs(handleId) {
        const view = viewRef.current;
        if (!view) return;
        dropLandingLine(view);
        const source = view.state.doc.toString();
        const { source: next } = detachJs(source, handleId);
        if (next === source) return;
        view.dispatch({
          changes: { from: 0, to: source.length, insert: next },
        });
        onChangeRef.current(next);
      },

      format() {
        const view = viewRef.current;
        if (view) formatDocument(view);
      },
    };
  });

  return <div ref={hostRef} className="h-full overflow-auto text-sm" />;
});
