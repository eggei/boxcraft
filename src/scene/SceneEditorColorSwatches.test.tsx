import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SceneEditor } from "./SceneEditor";
import { swatchClassName } from "./colorSwatches";

const SOURCE = `<!doctype html>
<html>
  <head>
    <style>
      .box-1 {
        background: #4f46e5;
      }
    </style>
  </head>
  <body>
    <div class="box-1"></div>
  </body>
</html>`;

function swatch(container: HTMLElement) {
  return container.querySelector<HTMLInputElement>(`.${swatchClassName} input[type="color"]`);
}

describe("SceneEditor color swatches", () => {
  it("renders a swatch for `background: #4f46e5` and writes a pick back", () => {
    const onChange = vi.fn();
    const { container } = render(
      <SceneEditor value={SOURCE} onChange={onChange} autoFormat={false} />,
    );

    const input = swatch(container);
    expect(input?.value).toBe("#4f46e5");

    input!.value = "#ff8800";
    fireEvent.change(input!);

    expect(onChange).toHaveBeenLastCalledWith(SOURCE.replace("#4f46e5", "#ff8800"));
  });

  it("still renders swatches with Vim mode on", () => {
    const { container } = render(
      <SceneEditor value={SOURCE} onChange={() => {}} autoFormat={false} vimMode />,
    );

    expect(swatch(container)?.value).toBe("#4f46e5");
  });
});
