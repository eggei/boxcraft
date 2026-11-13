import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SOURCE } from "@/scenes/sceneList";
import { EDITOR_SETTINGS_KEY } from "@/settings/editorSettings";
import { SceneEditorPane } from "./SceneEditorPane";

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
