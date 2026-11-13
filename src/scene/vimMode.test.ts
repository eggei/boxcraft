import { fireEvent } from "@testing-library/react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { getCM } from "@replit/codemirror-vim";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startInsertMode, vimKeybindings } from "./vimMode";

const views: EditorView[] = [];

/** A bare editor with only Vim in it, on a document that is easy to reason about. */
function mount(options: { onQuit?: () => void; vim?: boolean } = {}) {
  const parent = document.body.appendChild(document.createElement("div"));
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: "alpha\nbeta\n",
      extensions: options.vim === false ? [] : [vimKeybindings({ onQuit: options.onQuit })],
    }),
  });
  views.push(view);
  return view;
}

// Unmounted views are left to run their measure cycle after the test is over,
// which jsdom can't do (no `Range.getClientRects`); destroying them cancels it.
afterEach(() => {
  for (const view of views.splice(0)) {
    view.dom.parentElement?.remove();
    view.destroy();
  }
});

function press(target: Element, key: string, init: KeyboardEventInit = {}) {
  fireEvent.keyDown(target, { key, ...init });
}

function keys(view: EditorView, sequence: string) {
  for (const key of sequence) press(view.contentDOM, key);
}

const mode = (view: EditorView) => view.dom.querySelector(".cm-vim-panel")?.textContent;
const vimState = (view: EditorView) => getCM(view)?.state.vim;

/** Type `:` and a command into the ex prompt, then Enter. */
function exCommand(view: EditorView, command: string) {
  press(view.contentDOM, ":");
  const input = view.dom.querySelector<HTMLInputElement>(".cm-vim-panel input");
  if (!input) throw new Error("the : prompt did not open");
  fireEvent.input(input, { target: { value: command } });
  fireEvent.keyDown(input, { key: "Enter", keyCode: 13 });
}

describe("vimKeybindings", () => {
  it("opens in normal mode and says so in a status line", () => {
    const view = mount();

    expect(mode(view)).toBe("--NORMAL--");
    expect(vimState(view)?.insertMode).toBe(false);
  });

  it("goes to insert mode on i and back to normal on Esc, and says so each time", () => {
    const view = mount();

    press(view.contentDOM, "i");
    expect(mode(view)).toBe("--INSERT--");
    expect(vimState(view)?.insertMode).toBe(true);

    press(view.contentDOM, "Escape");
    expect(mode(view)).toBe("--NORMAL--");
    expect(vimState(view)?.insertMode).toBe(false);
  });

  it("treats keys as commands, not text, in normal mode", () => {
    const view = mount();

    keys(view, "dd");

    expect(view.state.doc.toString()).toBe("beta\n");
  });

  it("leaves the content editable in normal mode, which is how the app knows to keep its N/V/B/J shortcuts out", () => {
    // The app's single-key shortcuts bow out when the target is a
    // contenteditable. Were normal mode to make the content read-only they
    // would start firing on every motion key.
    const view = mount();

    expect(view.contentDOM.getAttribute("contenteditable")).toBe("true");

    press(view.contentDOM, "i");
    press(view.contentDOM, "Escape");

    expect(view.contentDOM.getAttribute("contenteditable")).toBe("true");
  });

  it("is not there at all when the extension is not installed", () => {
    const view = mount({ vim: false });

    expect(getCM(view)).toBeNull();
    expect(view.dom.querySelector(".cm-vim-panel")).toBeNull();
  });

  describe("Escape", () => {
    /** What the app's own Esc listener (on `window`) would have been handed. */
    function escapesReachingWindow() {
      const seen = vi.fn();
      window.addEventListener("keydown", seen);
      return {
        seen,
        stop: () => window.removeEventListener("keydown", seen),
      };
    }

    it("does not reach the window from insert mode", () => {
      const view = mount();
      const { seen, stop } = escapesReachingWindow();
      press(view.contentDOM, "i");
      seen.mockClear(); // the `i` is not what is under test

      press(view.contentDOM, "Escape");

      expect(seen).not.toHaveBeenCalled();
      stop();
    });

    it("does not reach the window from plain normal mode either — the reflexive second Esc", () => {
      const view = mount();
      const { seen, stop } = escapesReachingWindow();

      press(view.contentDOM, "Escape");
      press(view.contentDOM, "Escape");

      expect(seen).not.toHaveBeenCalled();
      stop();
    });

    it("does not reach the window from the : prompt, which it closes", () => {
      const view = mount();
      press(view.contentDOM, ":");
      const input = view.dom.querySelector<HTMLInputElement>(".cm-vim-panel input")!;
      const { seen, stop } = escapesReachingWindow();

      press(input, "Escape", { keyCode: 27 });

      expect(seen).not.toHaveBeenCalled();
      expect(view.dom.querySelector(".cm-vim-panel input")).toBeNull();
      stop();
    });

    it("still reaches the window without Vim — the app keeps its own Esc", () => {
      const view = mount({ vim: false });
      const { seen, stop } = escapesReachingWindow();

      press(view.contentDOM, "Escape");

      expect(seen).toHaveBeenCalledTimes(1);
      stop();
    });
  });

  describe("quitting", () => {
    it.each([":q", ":wq", ":x"])("%s asks the host to leave", (command) => {
      const onQuit = vi.fn();
      const view = mount({ onQuit });

      exCommand(view, command.slice(1));

      expect(onQuit).toHaveBeenCalledTimes(1);
    });

    it("does not leave for :w, which is a save and scenes save themselves", () => {
      const onQuit = vi.fn();
      const view = mount({ onQuit });

      exCommand(view, "w");

      expect(onQuit).not.toHaveBeenCalled();
    });

    it("does not leave for a command that only starts like :q", () => {
      const onQuit = vi.fn();
      const view = mount({ onQuit });

      exCommand(view, "qux");

      expect(onQuit).not.toHaveBeenCalled();
    });

    it("asks the editor it was typed into, not whichever was made last", () => {
      const first = vi.fn();
      const second = vi.fn();
      const a = mount({ onQuit: first });
      mount({ onQuit: second });

      exCommand(a, "q");

      expect(first).toHaveBeenCalledTimes(1);
      expect(second).not.toHaveBeenCalled();
    });

    it("has nowhere to go without a handler, and does not throw", () => {
      const view = mount();

      expect(() => exCommand(view, "q")).not.toThrow();
    });
  });
});

describe("startInsertMode", () => {
  it("takes normal mode to insert mode", () => {
    const view = mount();

    startInsertMode(view);

    expect(vimState(view)?.insertMode).toBe(true);
    expect(mode(view)).toBe("--INSERT--");
  });

  it("leaves an editor already in insert mode alone, and types nothing", () => {
    const view = mount();
    press(view.contentDOM, "i");

    startInsertMode(view);

    expect(vimState(view)?.insertMode).toBe(true);
    expect(view.state.doc.toString()).toBe("alpha\nbeta\n");
  });

  it('drops a half-typed command first, so its i is not read as the "di" of "d" + "i"', () => {
    const view = mount();
    press(view.contentDOM, "d"); // an operator, waiting for a motion

    startInsertMode(view);

    // Had the `i` been taken as a text-object prefix we would still be in
    // normal mode, waiting for the rest of the command.
    expect(vimState(view)?.insertMode).toBe(true);
    expect(view.state.doc.toString()).toBe("alpha\nbeta\n");
  });

  it("gets out of visual mode on the way", () => {
    const view = mount();
    press(view.contentDOM, "v");
    expect(vimState(view)?.visualMode).toBe(true);

    startInsertMode(view);

    expect(vimState(view)?.visualMode).toBe(false);
    expect(vimState(view)?.insertMode).toBe(true);
  });

  it("does nothing to an editor that is not running Vim", () => {
    const view = mount({ vim: false });

    expect(() => startInsertMode(view)).not.toThrow();
    expect(getCM(view)).toBeNull();
  });
});
