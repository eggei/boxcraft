import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_EDITOR_SETTINGS, type EditorSettings } from "@/settings/editorSettings";
import { EditorSettingsMenu } from "./EditorSettingsMenu";

function renderMenu(settings: EditorSettings = DEFAULT_EDITOR_SETTINGS) {
  const onToggleAutoFormat = vi.fn();
  const onToggleVimMode = vi.fn();
  const onToggleEditorSide = vi.fn();
  const menu = (current: EditorSettings) => (
    <EditorSettingsMenu
      settings={current}
      onToggleAutoFormat={onToggleAutoFormat}
      onToggleVimMode={onToggleVimMode}
      onToggleEditorSide={onToggleEditorSide}
    />
  );
  const { rerender } = render(menu(settings));
  return {
    onToggleAutoFormat,
    onToggleVimMode,
    onToggleEditorSide,
    /** Hand the still-open menu new settings, as the pane does after a toggle. */
    withSettings: (next: EditorSettings) => rerender(menu(next)),
    user: userEvent.setup(),
  };
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Editor settings" }));
}

describe("EditorSettingsMenu", () => {
  it("opens from the gear and shows auto-format ticked by default", async () => {
    const { user } = renderMenu();

    await openMenu(user);

    expect(screen.getByRole("menuitemcheckbox", { name: /Auto-format/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("reflects an auto-format setting that is off", async () => {
    const { user } = renderMenu({ ...DEFAULT_EDITOR_SETTINGS, autoFormat: false });

    await openMenu(user);

    expect(screen.getByRole("menuitemcheckbox", { name: /Auto-format/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("names the side the code will move to, not the side it is on", async () => {
    const { user } = renderMenu({ ...DEFAULT_EDITOR_SETTINGS, editorSide: "left" });

    await openMenu(user);

    expect(screen.getByRole("menuitem", { name: "Code on the right" })).toBeVisible();
    expect(screen.queryByRole("menuitem", { name: "Code on the left" })).toBeNull();
  });

  it("offers the way back once the code is on the right", async () => {
    const { user } = renderMenu({ ...DEFAULT_EDITOR_SETTINGS, editorSide: "right" });

    await openMenu(user);

    expect(screen.getByRole("menuitem", { name: "Code on the left" })).toBeVisible();
  });

  it("reports the swap when the layout item is chosen", async () => {
    const { user, onToggleEditorSide } = renderMenu();

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Code on the right" }));

    expect(onToggleEditorSide).toHaveBeenCalledTimes(1);
  });

  it("stays open when auto-format is ticked, so more can be changed", async () => {
    const { user, onToggleAutoFormat } = renderMenu();

    await openMenu(user);
    await user.click(screen.getByRole("menuitemcheckbox", { name: /Auto-format/ }));

    expect(onToggleAutoFormat).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("menuitem", { name: "Code on the right" })).toBeVisible();
  });

  it("offers Vim mode, unticked until it is on, and says where :q is since Esc is Vim’s", async () => {
    const { user, withSettings } = renderMenu();

    await openMenu(user);
    const item = () => screen.getByRole("menuitemcheckbox", { name: /Vim mode/ });
    expect(item()).toHaveAttribute("aria-checked", "false");
    expect(item()).toHaveTextContent(":q");

    withSettings({ ...DEFAULT_EDITOR_SETTINGS, vimMode: true });
    expect(item()).toHaveAttribute("aria-checked", "true");
  });

  it("reports Vim mode being ticked, and only that, and stays open", async () => {
    const { user, onToggleVimMode, onToggleAutoFormat, onToggleEditorSide } = renderMenu();

    await openMenu(user);
    await user.click(screen.getByRole("menuitemcheckbox", { name: /Vim mode/ }));

    expect(onToggleVimMode).toHaveBeenCalledTimes(1);
    expect(onToggleAutoFormat).not.toHaveBeenCalled();
    expect(onToggleEditorSide).not.toHaveBeenCalled();
    expect(screen.getByRole("menuitem", { name: "Code on the right" })).toBeVisible();
  });
});
