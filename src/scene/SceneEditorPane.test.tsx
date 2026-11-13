import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SOURCE } from "@/scenes/sceneList";
import { EDITOR_SETTINGS_KEY } from "@/settings/editorSettings";
import { SceneEditorPane } from "./SceneEditorPane";
import { instrument } from "./document";
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
    expect(rendered()).toBe(instrument(DEFAULT_SOURCE));

    act(() => vi.advanceTimersByTime(PREVIEW_DELAY - 1));
    expect(rendered()).toBe(instrument(DEFAULT_SOURCE));

    act(() => vi.advanceTimersByTime(1));
    expect(rendered()).toBe(instrument(typed));
  });

  it("restarts the wait on every keystroke", () => {
    vi.useFakeTimers();
    withAutoFormatOff();
    const { rerender } = render(<SceneEditorPane source={DEFAULT_SOURCE} onChange={vi.fn()} />);

    rerender(<SceneEditorPane source={DEFAULT_SOURCE + "a"} onChange={vi.fn()} />);
    act(() => vi.advanceTimersByTime(PREVIEW_DELAY - 50));
    rerender(<SceneEditorPane source={DEFAULT_SOURCE + "ab"} onChange={vi.fn()} />);
    act(() => vi.advanceTimersByTime(PREVIEW_DELAY - 50));
    expect(rendered()).toBe(instrument(DEFAULT_SOURCE));

    act(() => vi.advanceTimersByTime(50));
    expect(rendered()).toBe(instrument(DEFAULT_SOURCE + "ab"));
  });

  it("shows a tool edit at once, without waiting", () => {
    vi.useFakeTimers();
    withAutoFormatOff();
    let latest = MESSY;
    render(<Stateful initial={MESSY} onSource={(s) => (latest = s)} />);

    fireEvent.click(screen.getByRole("button", { name: "Format source" }));

    expect(latest).toBe(DEFAULT_SOURCE);
    expect(rendered()).toBe(instrument(DEFAULT_SOURCE));
  });
});
