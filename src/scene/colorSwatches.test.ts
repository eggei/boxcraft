import { fireEvent } from "@testing-library/react";
import { history, undo } from "@codemirror/commands";
import { html } from "@codemirror/lang-html";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { ColorType, parseColorLiteral, parseNamedColor } from "@replit/codemirror-css-color-picker";
import { afterEach, describe, expect, it } from "vitest";
import { colorSwatches, hslToHex, parseColorFunction, swatchClassName } from "./colorSwatches";

const views: EditorView[] = [];

function mount(doc: string) {
  const parent = document.body.appendChild(document.createElement("div"));
  const view = new EditorView({
    parent,
    state: EditorState.create({ doc, extensions: [history(), html(), colorSwatches] }),
  });
  views.push(view);
  return view;
}

afterEach(() => {
  for (const view of views.splice(0)) {
    view.dom.parentElement?.remove();
    view.destroy();
  }
});

function pickers(view: EditorView): HTMLInputElement[] {
  return [...view.dom.querySelectorAll<HTMLInputElement>(`.${swatchClassName} input[type="color"]`)];
}

/** What the native picker does on commit: set the value, fire `change`. */
function pick(input: HTMLInputElement, hex: string) {
  input.value = hex;
  fireEvent.change(input);
}

const scene = (css: string, body = "") =>
  `<!doctype html>\n<html>\n<head>\n<style>\n${css}\n</style>\n</head>\n<body>${body}</body>\n</html>`;

describe("color detection", () => {
  it("reads hex literals, expanding the short forms", () => {
    expect(parseColorLiteral("#4f46e5")).toEqual({ colorType: ColorType.hex, color: "#4f46e5", alpha: "" });
    expect(parseColorLiteral("#fff")?.color).toBe("#ffffff");
    expect(parseColorLiteral("#4f46e580")).toMatchObject({ color: "#4f46e5", alpha: "80" });
  });

  it("reads rgb()/rgba() calls as hex, keeping alpha in comma form", () => {
    expect(parseColorFunction("rgb(255, 0, 0)")).toEqual({ colorType: ColorType.rgb, color: "#ff0000", alpha: "" });
    expect(parseColorFunction("rgba(0, 0, 255, 0.5)")).toMatchObject({ color: "#0000ff", alpha: ", 0.5" });
    expect(parseColorFunction("rgb(0 0 255 / 50%)")).toMatchObject({ color: "#0000ff", alpha: ", 50%" });
    expect(parseColorFunction("translate(1px, 2px)")).toBeNull();
  });

  it("reads hsl()/hsla() calls in comma and space syntax", () => {
    expect(parseColorFunction("hsl(120, 100%, 50%)")).toEqual({ colorType: ColorType.hsl, color: "#00ff00", alpha: "" });
    expect(parseColorFunction("hsla(240, 100%, 50%, 0.25)")).toMatchObject({ color: "#0000ff", alpha: ", 0.25" });
    expect(parseColorFunction("hsl(243deg 75% 59% / 40%)")).toMatchObject({ color: "#5048e5", alpha: ", 40%" });
    expect(parseColorFunction("hsl(var(--h), 50%, 50%)")).toBeNull();
  });

  it("converts hsl to hex", () => {
    expect(hslToHex(0, 100, 50)).toBe("#ff0000");
    expect(hslToHex(0, 0, 100)).toBe("#ffffff");
    expect(hslToHex(210, 50, 25)).toBe("#204060");
  });

  it("reads named colors and ignores other words", () => {
    expect(parseNamedColor("rebeccapurple")).toMatchObject({ colorType: ColorType.named, color: "#663399" });
    expect(parseNamedColor("solid")).toBeNull();
  });
});

describe("color swatches in the editor", () => {
  it("puts a swatch beside each color in the style block", () => {
    const view = mount(
      scene(".a { background: #4f46e5; color: rgb(255, 0, 0); border-color: hsl(120, 100%, 50%); outline-color: tomato; }"),
    );

    expect(pickers(view).map((p) => p.value)).toEqual(["#4f46e5", "#ff0000", "#00ff00", "#ff6347"]);
  });

  it("finds colors in style attributes too", () => {
    const view = mount(scene("", '<div style="color: #00ff00"></div>'));

    expect(pickers(view).map((p) => p.value)).toEqual(["#00ff00"]);
  });

  it("rewrites an hsl color as hsl, keeping its alpha", () => {
    const view = mount(scene(".a { color: hsla(240, 100%, 50%, 0.5); }"));

    pick(pickers(view)[0], "#ff0000");

    expect(view.state.doc.toString()).toBe(scene(".a { color: hsl(0, 100%, 50%, 0.5); }"));
  });

  it("leaves color-like text outside CSS alone", () => {
    const view = mount(scene(".red { width: 10px; }", "<p>#ff0000 red</p>"));

    expect(pickers(view)).toHaveLength(0);
  });

  it("writes a pick back in the original notation, undoable in one step", () => {
    const source = scene(".a { color: rgb(255, 0, 0); background: #4f46e5; }");
    const view = mount(source);

    pick(pickers(view)[0], "#00ff00");
    expect(view.state.doc.toString()).toBe(scene(".a { color: rgb(0, 255, 0); background: #4f46e5; }"));

    pick(pickers(view)[1], "#112233");
    expect(view.state.doc.toString()).toBe(scene(".a { color: rgb(0, 255, 0); background: #112233; }"));

    undo(view);
    expect(view.state.doc.toString()).toBe(scene(".a { color: rgb(0, 255, 0); background: #4f46e5; }"));
    undo(view);
    expect(view.state.doc.toString()).toBe(source);
  });
});
