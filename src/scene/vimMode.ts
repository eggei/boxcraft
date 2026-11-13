// Vim keybindings for the scene source, and the few places where Vim's model
// has to be reconciled with the rest of the app.
//
// `@replit/codemirror-vim` does the modal editing itself. Everything here is
// about fit: the app's own colours, the `Esc` key the app also wants, and the
// editor-driven cursor moves (drawing a box, picking one on the stage) that
// assume the next thing typed goes into the document.

import { Facet, Prec, type Extension } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import { getCM, vim, Vim } from "@replit/codemirror-vim";

/**
 * What `:q` does. The host supplies it — the editor has no idea what "leaving"
 * means — and with none supplied the command does nothing.
 */
const quitHandler = Facet.define<(() => void) | null, (() => void) | null>({
  combine: (handlers) => handlers.find(Boolean) ?? null,
});

let exCommandsRegistered = false;

/**
 * `:q`, `:wq` and `:x` leave the editor. The ex-command table is global to the
 * library rather than per-editor, so each command looks up the handler of the
 * editor it was typed into.
 *
 * Quitting has to be a command because `Esc` is no longer available for it:
 * Vim needs that key for itself (see `claimEscape`). Saving needs nothing —
 * the scene autosaves on every change — so `:wq` is just `:q`; `:w` is already
 * a silent no-op in the library and is left that way.
 */
function registerExCommands() {
  if (exCommandsRegistered) return;
  exCommandsRegistered = true;
  const quit = (cm: { cm6: EditorView }) => cm.cm6.state.facet(quitHandler)?.();
  Vim.defineEx("quit", "q", quit);
  Vim.defineEx("wq", undefined, quit);
  Vim.defineEx("xit", "x", quit);
}

/**
 * Keep `Esc` inside the editor.
 *
 * The app treats `Esc` as "leave the editor", with a listener on `window`. In
 * Vim that is the most-pressed key there is — leave insert mode, cancel a
 * half-typed command, dismiss the `:` line, and reflexively again for luck —
 * so letting it bubble would throw the person out of the editor every time
 * they went back to normal mode. Stopped at the editor's root it still reaches
 * everything inside it (the Vim handler on the content, the input of the `:`
 * line) and nothing outside. Everywhere other than the editor, `Esc` exits as
 * before.
 */
const claimEscape = ViewPlugin.define((view) => {
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") event.stopPropagation();
  }
  view.dom.addEventListener("keydown", onKeyDown);
  return {
    destroy() {
      view.dom.removeEventListener("keydown", onKeyDown);
    },
  };
});

/**
 * Appearance. The library paints its block cursor a fixed pink and draws the
 * character under it in the text colour, which is unreadable on the dark theme;
 * recoloured here from the app's tokens so it follows the theme like the rest
 * of the editor. The layout rule is Vim-only on purpose: it changes where the
 * editor scrolls, and nobody who hasn't opted in should see that.
 *
 * Highest precedence, and listed *ahead of* `vim()` below: the library installs
 * its own theme at highest precedence too, and between equals the earlier
 * extension wins. `!important` on the letter colour because the library sets
 * it inline.
 */
const vimTheme = Prec.highest(
  EditorView.theme({
    // Fill the pane and scroll inside it. Left to its own height the editor
    // is as tall as the text, and the status line — a bottom panel — would sit
    // under the last line instead of at the foot of the pane.
    "&": { height: "100%" },
    ".cm-scroller": { overflow: "auto" },
    ".cm-fat-cursor": {
      background: "var(--primary)",
      color: "var(--primary-foreground) !important",
    },
    // Unfocused, the cursor is an outline only — the library's own rule, in the
    // app's colour. The letter stays transparent so the text shows through.
    "&:not(.cm-focused) .cm-fat-cursor": {
      background: "none",
      outline: "1px solid var(--primary)",
      color: "transparent !important",
    },
    ".cm-vim-panel": {
      fontSize: "0.75rem",
      color: "var(--muted-foreground)",
    },
    ".cm-vim-panel input": {
      color: "var(--foreground)",
      fontFamily: "inherit",
      fontSize: "inherit",
    },
  }),
);

/**
 * Vim keybindings for the source editor, to be installed *before* every other
 * keymap — Vim has to see a key first to be able to claim it.
 *
 * `status: true` keeps a `-- NORMAL --` / `-- INSERT --` line under the source.
 * The library only shows it for the `:` prompt otherwise, and in a modal editor
 * not knowing which mode you are in is how text ends up in the wrong place.
 */
export function vimKeybindings(options: { onQuit?: () => void } = {}): Extension {
  registerExCommands();
  return [vimTheme, vim({ status: true }), claimEscape, quitHandler.of(options.onQuit ?? null)];
}

/**
 * Put the editor in insert mode, if it is running Vim and is not already.
 *
 * For the moves the app makes on the person's behalf — a box just drawn, a rule
 * just picked on the stage — where the cursor lands *to be typed at*. In normal
 * mode the first property they typed would run as commands instead: `background`
 * is "back a word, append, …". Any half-typed command or selection is dropped
 * first so the `i` is read as a command of its own and not as `di` or a
 * visual-mode key.
 */
export function startInsertMode(view: EditorView) {
  const cm = getCM(view);
  const state = cm?.state.vim;
  if (!cm || !state || state.insertMode) return;
  Vim.handleKey(cm, "<Esc>", "mapping");
  Vim.handleKey(cm, "i", "mapping");
}
