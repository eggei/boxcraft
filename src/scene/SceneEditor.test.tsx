import { createRef } from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { getCM } from "@replit/codemirror-vim";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SOURCE, seedScenes } from "@/scenes/sceneList";
import { SceneEditor, type SceneEditorHandle } from "./SceneEditor";
import { listBoxes } from "./document";
import { formatSource } from "./format";

/** A scene that already has a box on it — DEFAULT_SOURCE is a blank canvas. */
const WITH_BOX = seedScenes()[0].source;

/** DEFAULT_SOURCE with every line pushed flush left. */
const MESSY = DEFAULT_SOURCE.split("\n")
  .map((line) => line.trimStart())
  .join("\n");

function viewIn(container: HTMLElement): EditorView {
  const view = EditorView.findFromDOM(container.querySelector(".cm-editor") as HTMLElement);
  if (!view) throw new Error("no editor mounted");
  return view;
}

describe("SceneEditor auto-format", () => {
  it("formats an unformatted document as soon as it opens", () => {
    const onChange = vi.fn();

    render(<SceneEditor value={MESSY} onChange={onChange} autoFormat />);

    expect(onChange).toHaveBeenCalledWith(DEFAULT_SOURCE);
  });

  it("leaves the document alone when the setting is off", () => {
    const onChange = vi.fn();

    const { container } = render(
      <SceneEditor value={MESSY} onChange={onChange} autoFormat={false} />,
    );

    expect(viewIn(container).state.doc.toString()).toBe(MESSY);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("formats the moment the setting is switched on", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <SceneEditor value={MESSY} onChange={onChange} autoFormat={false} />,
    );

    rerender(<SceneEditor value={MESSY} onChange={onChange} autoFormat />);

    expect(viewIn(container).state.doc.toString()).toBe(DEFAULT_SOURCE);
  });

  it("formats what was typed once the editor loses focus", () => {
    const onChange = vi.fn();
    const { container } = render(
      <SceneEditor value={DEFAULT_SOURCE} onChange={onChange} autoFormat />,
    );
    const view = viewIn(container);
    // A new box typed in at the wrong indent, as a person would leave it.
    const at = DEFAULT_SOURCE.indexOf('<div class="canvas">');
    view.dispatch({ changes: { from: at, insert: "        <p>hi</p>\n" } });
    const typed = view.state.doc.toString();

    fireEvent.blur(view.contentDOM);

    expect(view.state.doc.toString()).toBe(formatSource(typed));
    expect(view.state.doc.toString()).not.toBe(typed);
    expect(onChange).toHaveBeenLastCalledWith(view.state.doc.toString());
  });

  it("does not format on blur when the setting is off", () => {
    const { container } = render(
      <SceneEditor value={MESSY} onChange={vi.fn()} autoFormat={false} />,
    );
    const view = viewIn(container);

    fireEvent.blur(view.contentDOM);

    expect(view.state.doc.toString()).toBe(MESSY);
  });
});

describe("SceneEditor Vim mode", () => {
  const modeOf = (container: HTMLElement) =>
    container.querySelector(".cm-vim-panel")?.textContent ?? null;

  /** A key press as the editor would receive it. */
  const press = (view: EditorView, key: string) => fireEvent.keyDown(view.contentDOM, { key });

  function escapesReachingWindow() {
    const seen = vi.fn((event: KeyboardEvent) => event.key);
    window.addEventListener("keydown", seen);
    return { seen, stop: () => window.removeEventListener("keydown", seen) };
  }

  it("is off unless asked for: no mode line, and keys are text", () => {
    const { container } = render(
      <SceneEditor value={DEFAULT_SOURCE} onChange={vi.fn()} autoFormat={false} />,
    );

    expect(getCM(viewIn(container))).toBeNull();
    expect(modeOf(container)).toBeNull();
  });

  it("opens in normal mode when the setting is already on", () => {
    const { container } = render(
      <SceneEditor value={DEFAULT_SOURCE} onChange={vi.fn()} autoFormat={false} vimMode />,
    );

    expect(modeOf(container)).toBe("--NORMAL--");
    expect(getCM(viewIn(container))?.state.vim?.insertMode).toBe(false);
  });

  it("is switched on and off on the live editor", () => {
    const { container, rerender } = render(
      <SceneEditor value={DEFAULT_SOURCE} onChange={vi.fn()} autoFormat={false} />,
    );
    const view = viewIn(container);

    rerender(<SceneEditor value={DEFAULT_SOURCE} onChange={vi.fn()} autoFormat={false} vimMode />);
    expect(modeOf(container)).toBe("--NORMAL--");

    rerender(
      <SceneEditor value={DEFAULT_SOURCE} onChange={vi.fn()} autoFormat={false} vimMode={false} />,
    );
    expect(modeOf(container)).toBeNull();
    expect(getCM(view)).toBeNull();
  });

  it("keeps the same editor across the switch — nothing is remounted or lost", () => {
    const typed = "X" + DEFAULT_SOURCE;
    const { container, rerender } = render(
      <SceneEditor value={DEFAULT_SOURCE} onChange={vi.fn()} autoFormat={false} />,
    );
    const view = viewIn(container);
    view.dispatch({ changes: { from: 0, insert: "X" }, userEvent: "input.type" });
    view.dispatch({ selection: { anchor: 7 } });

    rerender(<SceneEditor value={typed} onChange={vi.fn()} autoFormat={false} vimMode />);

    expect(viewIn(container)).toBe(view);
    expect(view.state.doc.toString()).toBe(typed);
    expect(view.state.selection.main.head).toBe(7);
  });

  it("keeps the undo history across the switch, and Vim can use it", () => {
    const typed = "X" + DEFAULT_SOURCE;
    const { container, rerender } = render(
      <SceneEditor value={DEFAULT_SOURCE} onChange={vi.fn()} autoFormat={false} />,
    );
    const view = viewIn(container);
    view.dispatch({ changes: { from: 0, insert: "X" }, userEvent: "input.type" });

    rerender(<SceneEditor value={typed} onChange={vi.fn()} autoFormat={false} vimMode />);
    press(view, "u");

    expect(view.state.doc.toString()).toBe(DEFAULT_SOURCE);
  });

  it("does not set the document or fire onChange just by being switched on", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <SceneEditor value={DEFAULT_SOURCE} onChange={onChange} autoFormat={false} />,
    );

    rerender(<SceneEditor value={DEFAULT_SOURCE} onChange={onChange} autoFormat={false} vimMode />);

    expect(onChange).not.toHaveBeenCalled();
    expect(viewIn(container).state.doc.toString()).toBe(DEFAULT_SOURCE);
  });

  it("keeps Esc for itself while on, and hands it back to the app once off", () => {
    const { container, rerender } = render(
      <SceneEditor value={DEFAULT_SOURCE} onChange={vi.fn()} autoFormat={false} vimMode />,
    );
    const view = viewIn(container);
    const { seen, stop } = escapesReachingWindow();

    press(view, "Escape");
    expect(seen).not.toHaveBeenCalled();

    rerender(
      <SceneEditor value={DEFAULT_SOURCE} onChange={vi.fn()} autoFormat={false} vimMode={false} />,
    );
    press(view, "Escape");
    expect(seen).toHaveBeenCalledTimes(1);
    stop();
  });

  it(":q leaves through the onQuit it has *now*, not the one it mounted with", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { container, rerender } = render(
      <SceneEditor
        value={DEFAULT_SOURCE}
        onChange={vi.fn()}
        autoFormat={false}
        vimMode
        onQuit={first}
      />,
    );
    rerender(
      <SceneEditor
        value={DEFAULT_SOURCE}
        onChange={vi.fn()}
        autoFormat={false}
        vimMode
        onQuit={second}
      />,
    );
    const view = viewIn(container);

    press(view, ":");
    const input = container.querySelector<HTMLInputElement>(".cm-vim-panel input")!;
    fireEvent.input(input, { target: { value: "q" } });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 13 });

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  describe("when the editor moves the cursor on the person’s behalf", () => {
    function setup(vimMode: boolean) {
      const ref = createRef<SceneEditorHandle>();
      const { container } = render(
        <SceneEditor
          ref={ref}
          value={WITH_BOX}
          onChange={vi.fn()}
          autoFormat={false}
          vimMode={vimMode}
        />,
      );
      const view = viewIn(container);
      return { ref, container, view };
    }

    it("lands in insert mode after a box is drawn, so the next keys are text", () => {
      const { ref, container, view } = setup(true);
      expect(modeOf(container)).toBe("--NORMAL--");

      act(() => ref.current!.createBox({ kind: "point", x: 20, y: 20 }));

      expect(modeOf(container)).toBe("--INSERT--");
      // ...with the cursor inside the new rule, as without Vim.
      const head = view.state.selection.main.head;
      expect(view.state.doc.toString().slice(0, head)).toContain(".box-2 {");
    });

    it("lands in insert mode after a box is picked on the stage", () => {
      const { ref, container } = setup(true);
      const [box] = listBoxes(WITH_BOX);

      act(() => ref.current!.selectBox(box.handle));

      expect(modeOf(container)).toBe("--INSERT--");
    });

    it("lands in insert mode after JS is attached, to write the handler", () => {
      const { ref, container } = setup(true);
      const [box] = listBoxes(WITH_BOX);

      act(() => ref.current!.attachJs(box.handle));

      expect(modeOf(container)).toBe("--INSERT--");
    });

    it("does not read a half-typed command as part of the move", () => {
      const { ref, container, view } = setup(true);
      press(view, "d"); // waiting for a motion

      act(() => ref.current!.createBox({ kind: "point", x: 20, y: 20 }));

      expect(modeOf(container)).toBe("--INSERT--");
      expect(view.state.doc.toString()).toContain('class="box-2"');
    });

    it("does nothing of the kind without Vim", () => {
      const { ref, container, view } = setup(false);

      act(() => ref.current!.createBox({ kind: "point", x: 20, y: 20 }));

      expect(modeOf(container)).toBeNull();
      expect(getCM(view)).toBeNull();
      expect(view.state.doc.toString()).toContain('class="box-2"');
    });
  });
});
