import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorView } from "@codemirror/view";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SOURCE } from "@/scenes/sceneList";
import { EDITOR_SETTINGS_KEY } from "@/settings/editorSettings";
import { SceneEditorPane } from "./SceneEditorPane";
import { createBox } from "./document";
import { BRIDGE_CHANNEL, stageDocument } from "./stageBridge";
import { PREVIEW_DELAY } from "./usePreviewSource";

/** DEFAULT_SOURCE with every line pushed flush left. */
const MESSY = DEFAULT_SOURCE.split("\n")
  .map((line) => line.trimStart())
  .join("\n");

/** Manual formatting has to work with the automatic kind switched off. */
function withAutoFormatOff() {
  localStorage.setItem(
    EDITOR_SETTINGS_KEY,
    JSON.stringify({ autoFormat: false, editorSide: "left" }),
  );
}

describe("SceneEditorPane formatting", () => {
  beforeEach(() => localStorage.clear());

  it("formats the source when the Format button is pressed", async () => {
    withAutoFormatOff();
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SceneEditorPane source={MESSY} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Format source" }));

    expect(onChange).toHaveBeenCalledWith(DEFAULT_SOURCE);
  });

  it('formats on ⌥F, matched by physical key since Option+F types "ƒ"', () => {
    withAutoFormatOff();
    const onChange = vi.fn();
    render(<SceneEditorPane source={MESSY} onChange={onChange} />);

    fireEvent.keyDown(window, { key: "ƒ", code: "KeyF", altKey: true });

    expect(onChange).toHaveBeenCalledWith(DEFAULT_SOURCE);
  });

  it("leaves the source alone for a plain F", () => {
    withAutoFormatOff();
    const onChange = vi.fn();
    render(<SceneEditorPane source={MESSY} onChange={onChange} />);

    fireEvent.keyDown(window, { key: "f", code: "KeyF" });

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("SceneEditorPane controls", () => {
  beforeEach(() => localStorage.clear());

  it("gathers settings, tools and format into one stack", () => {
    render(<SceneEditorPane source={DEFAULT_SOURCE} onChange={vi.fn()} />);

    for (const name of ["Editor settings", "Select", "Box", "Attach JS", "Format source"]) {
      expect(screen.getByRole("button", { name })).toBeVisible();
    }
  });
});

describe("SceneEditorPane Vim mode", () => {
  beforeEach(() => localStorage.clear());

  const modeOf = (container: HTMLElement) =>
    container.querySelector(".cm-vim-panel")?.textContent ?? null;

  const storedVimMode = () => {
    const raw = localStorage.getItem(EDITOR_SETTINGS_KEY);
    return raw === null ? undefined : JSON.parse(raw).vimMode;
  };

  async function tickVimMode(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Editor settings" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: /Vim mode/ }));
  }

  it("opens as an ordinary editor when nothing has been chosen", () => {
    const { container } = render(<SceneEditorPane source={DEFAULT_SOURCE} onChange={vi.fn()} />);

    expect(modeOf(container)).toBeNull();
  });

  it("turns Vim on from the settings menu, on the spot, and writes the choice to storage", async () => {
    // Other preferences already saved must come through the write untouched.
    localStorage.setItem(
      EDITOR_SETTINGS_KEY,
      JSON.stringify({ autoFormat: false, editorSide: "right" }),
    );
    const user = userEvent.setup();
    const { container } = render(<SceneEditorPane source={DEFAULT_SOURCE} onChange={vi.fn()} />);
    expect(modeOf(container)).toBeNull();
    expect(storedVimMode()).toBeUndefined();

    await tickVimMode(user);

    expect(modeOf(container)).toBe("--NORMAL--");
    expect(screen.getByRole("menuitemcheckbox", { name: /Vim mode/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(JSON.parse(localStorage.getItem(EDITOR_SETTINGS_KEY)!)).toEqual({
      autoFormat: false,
      editorSide: "right",
      vimMode: true,
    });
  });

  it("is remembered when the editor is opened again — on, and then off", async () => {
    const user = userEvent.setup();
    const first = render(<SceneEditorPane source={DEFAULT_SOURCE} onChange={vi.fn()} />);
    await tickVimMode(user); // on
    first.unmount();

    const second = render(<SceneEditorPane source={DEFAULT_SOURCE} onChange={vi.fn()} />);
    expect(modeOf(second.container)).toBe("--NORMAL--");

    await tickVimMode(user); // off again
    expect(storedVimMode()).toBe(false);
    second.unmount();

    const third = render(<SceneEditorPane source={DEFAULT_SOURCE} onChange={vi.fn()} />);
    expect(modeOf(third.container)).toBeNull();
  });

  it("comes up on when storage already says so, and stays off for nonsense", () => {
    localStorage.setItem(
      EDITOR_SETTINGS_KEY,
      JSON.stringify({ autoFormat: true, editorSide: "left", vimMode: true }),
    );
    const stored = render(<SceneEditorPane source={DEFAULT_SOURCE} onChange={vi.fn()} />);
    expect(modeOf(stored.container)).toBe("--NORMAL--");
    stored.unmount();

    localStorage.setItem(EDITOR_SETTINGS_KEY, '{"vimMode":"yes please"}');
    const mangled = render(<SceneEditorPane source={DEFAULT_SOURCE} onChange={vi.fn()} />);
    expect(modeOf(mangled.container)).toBeNull();
  });

  it("hands :q to the owner as a request to leave", () => {
    localStorage.setItem(
      EDITOR_SETTINGS_KEY,
      JSON.stringify({ autoFormat: false, editorSide: "left", vimMode: true }),
    );
    const onExit = vi.fn();
    const { container } = render(
      <SceneEditorPane source={DEFAULT_SOURCE} onChange={vi.fn()} onExit={onExit} />,
    );
    const content = container.querySelector(".cm-content")!;

    fireEvent.keyDown(content, { key: ":" });
    const input = container.querySelector<HTMLInputElement>(".cm-vim-panel input")!;
    fireEvent.input(input, { target: { value: "q" } });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 13 });

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("still formats on ⌥F with Vim on", () => {
    localStorage.setItem(
      EDITOR_SETTINGS_KEY,
      JSON.stringify({ autoFormat: false, editorSide: "left", vimMode: true }),
    );
    const onChange = vi.fn();
    render(<SceneEditorPane source={MESSY} onChange={onChange} />);

    fireEvent.keyDown(window, { key: "ƒ", code: "KeyF", altKey: true });

    expect(onChange).toHaveBeenCalledWith(DEFAULT_SOURCE);
  });
});

describe("SceneEditorPane preview", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.useRealTimers());

  /** The pane with its source held in state, the way the app holds it. */
  function Stateful({ initial, onSource }: { initial: string; onSource: (s: string) => void }) {
    const [source, setSource] = useState(initial);
    useEffect(() => {
      onSource(source);
    }, [source, onSource]);
    return <SceneEditorPane source={source} onChange={setSource} />;
  }

  const rendered = () => screen.getByTitle("Scene preview").getAttribute("srcdoc");

  it("waits for a pause in typing before re-rendering the stage", () => {
    vi.useFakeTimers();
    withAutoFormatOff();
    const { rerender } = render(<SceneEditorPane source={DEFAULT_SOURCE} onChange={vi.fn()} />);
    const typed = DEFAULT_SOURCE.replace("#fff", "#ffe");

    rerender(<SceneEditorPane source={typed} onChange={vi.fn()} />);
    expect(rendered()).toBe(stageDocument(DEFAULT_SOURCE));

    act(() => vi.advanceTimersByTime(PREVIEW_DELAY - 1));
    expect(rendered()).toBe(stageDocument(DEFAULT_SOURCE));

    act(() => vi.advanceTimersByTime(1));
    expect(rendered()).toBe(stageDocument(typed));
  });

  it("restarts the wait on every keystroke", () => {
    vi.useFakeTimers();
    withAutoFormatOff();
    const { rerender } = render(<SceneEditorPane source={DEFAULT_SOURCE} onChange={vi.fn()} />);

    rerender(<SceneEditorPane source={DEFAULT_SOURCE + "a"} onChange={vi.fn()} />);
    act(() => vi.advanceTimersByTime(PREVIEW_DELAY - 50));
    rerender(<SceneEditorPane source={DEFAULT_SOURCE + "ab"} onChange={vi.fn()} />);
    act(() => vi.advanceTimersByTime(PREVIEW_DELAY - 50));
    expect(rendered()).toBe(stageDocument(DEFAULT_SOURCE));

    act(() => vi.advanceTimersByTime(50));
    expect(rendered()).toBe(stageDocument(DEFAULT_SOURCE + "ab"));
  });

  it("shows a tool edit at once, without waiting", () => {
    vi.useFakeTimers();
    withAutoFormatOff();
    let latest = MESSY;
    render(<Stateful initial={MESSY} onSource={(s) => (latest = s)} />);

    fireEvent.click(screen.getByRole("button", { name: "Format source" }));

    expect(latest).toBe(DEFAULT_SOURCE);
    expect(rendered()).toBe(stageDocument(DEFAULT_SOURCE));
  });
});

describe("SceneEditorPane stage clicks", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.useRealTimers());

  /** DEFAULT_SOURCE with box-1 and box-2. */
  const TWO_BOXES = [1, 2].reduce((source, i) => {
    const result = createBox(source, { kind: "point", x: i * 10, y: i * 10 });
    if (!result.ok) throw new Error(result.problem);
    return result.source;
  }, DEFAULT_SOURCE);

  function clickOnStage(handle: string) {
    const iframe = screen.getByTitle("Scene preview") as HTMLIFrameElement;
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { channel: BRIDGE_CHANNEL, type: "click", handle },
          source: iframe.contentWindow,
        }),
      );
    });
  }

  it("selects the box that was clicked, even while the render lags behind typing", () => {
    vi.useFakeTimers();
    withAutoFormatOff();
    const { rerender } = render(<SceneEditorPane source={TWO_BOXES} onChange={vi.fn()} />);

    // A box typed in above the others shifts every positional handle by one,
    // but the stage still shows the old render, where box-2 is bx_2.
    const typed = TWO_BOXES.replace(
      '<div class="box-1">',
      '<div class="extra"></div>\n      <div class="box-1">',
    );
    rerender(<SceneEditorPane source={typed} onChange={vi.fn()} />);
    clickOnStage("bx_2");

    expect(screen.getByText(".box-2")).toBeInTheDocument();
  });

  it("never hands the bridge or the handles to the owner to store", async () => {
    withAutoFormatOff();
    const onChange = vi.fn();
    const user = userEvent.setup();
    const messyBoxes = TWO_BOXES.split("\n")
      .map((line) => line.trimStart())
      .join("\n");
    render(<SceneEditorPane source={messyBoxes} onChange={onChange} />);

    clickOnStage("bx_1");
    await user.click(screen.getByRole("button", { name: "Format source" }));

    expect(onChange).toHaveBeenCalled();
    for (const [stored] of onChange.mock.calls) expect(stored).not.toContain("data-bc");
  });
});

describe("SceneEditorPane box dragging", () => {
  beforeEach(() => localStorage.clear());

  /** DEFAULT_SOURCE with box-1 at (10, 20), 100 × 100. */
  const ONE_BOX = (() => {
    const result = createBox(DEFAULT_SOURCE, { kind: "point", x: 10, y: 20 });
    if (!result.ok) throw new Error(result.problem);
    return result.source;
  })();

  /** Deliver a bridge message to the stage, as its iframe would. */
  function fromStage(data: Record<string, unknown>) {
    const iframe = screen.getByTitle("Scene preview") as HTMLIFrameElement;
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { channel: BRIDGE_CHANNEL, ...data },
          source: iframe.contentWindow,
        }),
      );
    });
  }

  const rect = (left: number, top: number, width: number, height: number) => ({
    left,
    top,
    width,
    height,
  });

  it("rewrites the box's rule on drop as one edit, which one undo reverts", () => {
    withAutoFormatOff();
    const onChange = vi.fn();
    const { container } = render(<SceneEditorPane source={ONE_BOX} onChange={onChange} />);
    fromStage({ type: "click", handle: "bx_1" });
    fromStage({
      type: "layout",
      canvas: rect(0, 0, 400, 400),
      boxes: { bx_1: rect(10, 20, 100, 100) },
    });
    onChange.mockClear();

    const frame = screen.getByTestId("selection-outline");
    fireEvent.pointerDown(frame, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(frame, { clientX: 80, clientY: 90, pointerId: 1 });
    fireEvent.pointerUp(frame, { clientX: 80, clientY: 90, pointerId: 1 });

    expect(onChange).toHaveBeenCalledTimes(1);
    const moved = onChange.mock.calls[0][0] as string;
    expect(moved).toBe(ONE_BOX.replace("left: 10px", "left: 40px").replace("top: 20px", "top: 60px"));

    onChange.mockClear();
    fireEvent.keyDown(container.querySelector(".cm-content")!, { key: "z", ctrlKey: true });
    expect(onChange).toHaveBeenLastCalledWith(ONE_BOX);
  });
});

describe("SceneEditorPane Box tool notice", () => {
  beforeEach(() => localStorage.clear());

  const NO_CANVAS = DEFAULT_SOURCE.replace('<div class="canvas"></div>', "<div></div>");
  const NOTICE = 'Add an element with class="canvas" to draw boxes';

  it("explains why boxes can't be drawn when the scene has no canvas", async () => {
    const user = userEvent.setup();
    render(<SceneEditorPane source={NO_CANVAS} onChange={vi.fn()} />);
    expect(screen.queryByText(NOTICE)).toBeNull(); // only while the Box tool is armed

    await user.click(screen.getByRole("button", { name: "Box" }));
    expect(screen.getByRole("status")).toHaveTextContent(NOTICE);

    await user.click(screen.getByRole("button", { name: "Select" }));
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("drops the notice as soon as the source gains a canvas", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<SceneEditorPane source={NO_CANVAS} onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Box" }));
    expect(screen.getByText(NOTICE)).toBeVisible();

    rerender(<SceneEditorPane source={DEFAULT_SOURCE} onChange={vi.fn()} />);

    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it("shows nothing for a scene that can take a box", async () => {
    const user = userEvent.setup();
    render(<SceneEditorPane source={DEFAULT_SOURCE} onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Box" }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("SceneEditorPane rename", () => {
  beforeEach(() => localStorage.clear());

  /** DEFAULT_SOURCE with box-1 and box-2 on the canvas. */
  function twoBoxes(): string {
    let source = DEFAULT_SOURCE;
    for (const x of [0, 50]) {
      const result = createBox(source, { kind: "point", x, y: 0 });
      if (!result.ok) throw new Error(result.problem);
      source = result.source;
    }
    return source;
  }

  /** The pane with its source held in state, the way the app owns it. */
  function Harness({ initial, onChange }: { initial: string; onChange: (s: string) => void }) {
    const [source, setSource] = useState(initial);
    return (
      <SceneEditorPane
        source={source}
        onChange={(next) => {
          setSource(next);
          onChange(next);
        }}
      />
    );
  }

  /** Select box-1 the way the reverse sync does: by putting the cursor in its rule. */
  function selectBox1(container: HTMLElement) {
    const view = EditorView.findFromDOM(container.querySelector(".cm-editor") as HTMLElement)!;
    const at = view.state.doc.toString().indexOf(".box-1 {") + 1;
    act(() => view.dispatch({ selection: { anchor: at } }));
  }

  async function openRename(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Rename" }));
    return screen.getByRole("textbox", { name: "New class name" });
  }

  function setup() {
    withAutoFormatOff();
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<Harness initial={twoBoxes()} onChange={onChange} />);
    selectBox1(container);
    return { onChange, user };
  }

  it("renames inline: Enter applies the new name and closes the field", async () => {
    const { onChange, user } = setup();
    const input = await openRename(user);
    expect(input).toHaveValue("box-1");

    await user.clear(input);
    await user.type(input, "hero{Enter}");

    expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining('class="hero"'));
    expect(screen.queryByRole("textbox", { name: "New class name" })).toBeNull();
  });

  it("keeps the field open with the reason when the name is taken", async () => {
    const { onChange, user } = setup();
    const input = await openRename(user);

    await user.clear(input);
    await user.type(input, "box-2{Enter}");

    expect(screen.getByRole("alert")).toHaveTextContent(".box-2 is already used in this scene");
    expect(input).toBeVisible();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("refuses a name with a space in it", async () => {
    const { onChange, user } = setup();
    const input = await openRename(user);

    await user.clear(input);
    await user.type(input, "my box{Enter}");

    expect(screen.getByRole("alert")).toHaveTextContent(/letters, digits/);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("cancels on Escape without the Escape also leaving the editor", async () => {
    const { onChange, user } = setup();
    const appEscape = vi.fn();
    // Stands in for the app's window-level "Escape exits the editor" shortcut.
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") appEscape();
    };
    window.addEventListener("keydown", onWindowKeyDown);
    try {
      const input = await openRename(user);
      await user.type(input, "zzz{Escape}");
    } finally {
      window.removeEventListener("keydown", onWindowKeyDown);
    }

    expect(appEscape).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "New class name" })).toBeNull();
    expect(screen.getByText(".box-1")).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();
  });
});
