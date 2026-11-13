import { useEffect, useRef, useState } from "react";
import { IndentIncrease } from "lucide-react";
import { WithTooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useEditorSettings } from "@/settings/useEditorSettings";
import { EditorSettingsMenu } from "./EditorSettingsMenu";
import { SceneEditor, type SceneEditorHandle } from "./SceneEditor";
import { SceneStage } from "./SceneStage";
import { Toolbar, type Tool } from "./Toolbar";
import { BoxRenameField } from "./BoxRenameField";
import {
  createBoxProblem,
  listBoxes,
  translateHandle,
  type BoxPlacement,
  type CreateBoxProblem,
  type RenameProblem,
} from "./document";
import { usePreviewSource } from "./usePreviewSource";

/** What the Box tool tells the person when the document has nowhere to draw. */
const BOX_PROBLEM_NOTICE: Record<CreateBoxProblem, string> = {
  "no-canvas": 'Add an element with class="canvas" to draw boxes',
  "unterminated-canvas": "Close the canvas element's tag to draw boxes",
  "no-style": "Add a <style> block to draw boxes",
};

/**
 * The L3 editing surface for a single scene: the CodeMirror source on one side
 * and the instrumented iframe render on the other, with every control gathered
 * into one corner stack over the source — settings, tools, format — and a
 * selection panel on the stage. Tool and selection state is local to the
 * focused scene; the editor settings outlive it. Source changes are lifted out
 * via `onChange` so the owner persists them.
 */
export function SceneEditorPane({
  source,
  onChange,
  onExit,
}: {
  source: string;
  onChange: (source: string) => void;
  /** Leave the editor — what Vim's `:q` asks for. */
  onExit?: () => void;
}) {
  const [tool, setTool] = useState<Tool>("select");
  const [selectedHandle, setSelectedHandle] = useState<string | null>(null);
  const editorRef = useRef<SceneEditorHandle>(null);
  const { settings, toggleAutoFormat, toggleVimMode, toggleEditorSide } = useEditorSettings();
  const codeOnRight = settings.editorSide === "right";

  // The stage renders a copy of the source that trails typing by a moment (see
  // usePreviewSource). Tool edits go through `asToolEdit`, which shows their
  // result at once: the editor reports the new source synchronously from inside
  // the call, and `handleChange` sees the flag while it is still up.
  const [previewSource, showNow] = usePreviewSource(source);
  const toolEditRef = useRef(false);

  function handleChange(next: string) {
    onChange(next);
    if (toolEditRef.current) showNow(next);
  }

  function asToolEdit<T>(edit: () => T): T {
    toolEditRef.current = true;
    try {
      return edit();
    } finally {
      toolEditRef.current = false;
    }
  }

  // Handles are positional, so the stage's (from the rendered copy) and the
  // editor's (from the live source) can disagree while the render lags. They
  // are translated at the boundary, in both directions.
  const fromStage = (handle: string) => translateHandle(previewSource, source, handle);
  const stageSelectedHandle =
    selectedHandle && translateHandle(source, previewSource, selectedHandle);

  function handleCreateBox(placement: BoxPlacement) {
    const problem = asToolEdit(() => editorRef.current?.createBox(placement) ?? null);
    // On failure the Box tool stays armed, so its notice stays up until the
    // person fixes the document or picks another tool.
    if (problem) return;
    setTool("select"); // tool reverts to Select after creation
  }

  // Derived rather than stored: the notice goes away the moment the source
  // gains a canvas (or a <style>), with nothing to reset.
  const boxProblem = tool === "box" ? createBoxProblem(source) : null;

  function selectBox(handle: string) {
    setSelectedHandle(handle);
    asToolEdit(() => editorRef.current?.selectBox(handle));
  }

  function attachJsTo(handle: string) {
    setSelectedHandle(handle);
    asToolEdit(() => editorRef.current?.attachJs(handle));
    setTool("select"); // tool reverts to Select after attaching
  }

  function handleStageSelect(stageHandle: string) {
    const handle = fromStage(stageHandle);
    if (handle) selectBox(handle);
  }

  function handleStageAttachJs(stageHandle: string) {
    const handle = fromStage(stageHandle);
    if (handle) attachJsTo(handle);
  }

  function handleDetachJs() {
    const handle = selectedHandle;
    if (handle) asToolEdit(() => editorRef.current?.detachJs(handle));
  }

  function handleFormat() {
    asToolEdit(() => editorRef.current?.format());
  }

  // ⌥F formats from anywhere on the editing surface, including from inside the
  // editor — which is the whole point, so unlike the app's other shortcuts this
  // one deliberately does not bow out of contenteditable.
  useEffect(function bindFormatShortcut() {
    function onKeyDown(event: KeyboardEvent) {
      // Option+F types "ƒ" on macOS, so match the physical key, not `key`.
      if (!event.altKey || event.metaKey || event.ctrlKey) return;
      if (event.code !== "KeyF") return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      // Cancels the "ƒ" the editor would otherwise be handed.
      event.preventDefault();
      asToolEdit(() => editorRef.current?.format());
    }
    window.addEventListener("keydown", onKeyDown);
    return function unbind() {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const selectedBox = selectedHandle
    ? listBoxes(source).find((b) => b.handle === selectedHandle)
    : undefined;

  // Which box the inline rename field is open for. Tied to a handle, so picking
  // another box quietly closes it rather than renaming the wrong one.
  const [renamingHandle, setRenamingHandle] = useState<string | null>(null);
  const renaming = !!selectedBox && renamingHandle === selectedHandle;

  function handleRenameSubmit(name: string): RenameProblem | null {
    if (!selectedBox) return null;
    const problem =
      name.trim() === selectedBox.className
        ? null // unchanged — just close
        : asToolEdit(() => editorRef.current?.renameBox(selectedBox.handle, name) ?? null);
    if (!problem) setRenamingHandle(null);
    return problem;
  }
  const selectedHasJs =
    !!selectedBox && source.includes(`getElementById('${selectedBox.className}')`);

  return (
    <div className="grid h-full min-h-0 grid-cols-2">
      {/* Which half each pane takes is CSS `order`, not JSX order: swapping the
          children would remount CodeMirror and take the undo history with it. */}
      <div
        className={cn(
          "relative min-h-0 overflow-hidden",
          codeOnRight ? "order-2 border-l" : "order-1 border-r",
        )}
      >
        <SceneEditor
          ref={editorRef}
          value={source}
          onChange={handleChange}
          onCursorBox={setSelectedHandle}
          autoFormat={settings.autoFormat}
          vimMode={settings.vimMode}
          onQuit={onExit}
        />
        {/* One corner stack over the source: the settings gear, the tools
            beneath it, then Format. It lives on the editor side because that is
            the half that follows the person around when the sides are swapped,
            and the tools write code as much as they draw. */}
        <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-2">
          <EditorSettingsMenu
            settings={settings}
            onToggleAutoFormat={toggleAutoFormat}
            onToggleVimMode={toggleVimMode}
            onToggleEditorSide={toggleEditorSide}
          />
          <Toolbar tool={tool} onToolChange={setTool} />
          <WithTooltip side="left" tip="Re-indent the source now (⌥F)">
            <button
              type="button"
              aria-label="Format source"
              onClick={handleFormat}
              className="bg-popover shadow-raised text-muted-foreground hover:text-foreground flex size-9 items-center justify-center rounded-lg border transition-colors"
            >
              <IndentIncrease className="size-4" />
            </button>
          </WithTooltip>
        </div>
      </div>
      <div className={cn("relative min-h-0", codeOnRight ? "order-1" : "order-2")}>
        <SceneStage
          source={previewSource}
          tool={tool}
          selectedHandle={stageSelectedHandle || null}
          onCreateBox={handleCreateBox}
          onSelectBox={handleStageSelect}
          onAttachJs={handleStageAttachJs}
        />
        {boxProblem && (
          <div
            role="status"
            className="bg-popover shadow-raised absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-lg border px-3 py-2 text-sm"
          >
            {BOX_PROBLEM_NOTICE[boxProblem]}
          </div>
        )}
        {selectedBox && (
          <div className="bg-popover shadow-raised absolute bottom-3 left-3 z-10 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm">
            {renaming ? (
              <BoxRenameField
                initialName={selectedBox.className}
                onSubmit={handleRenameSubmit}
                onCancel={() => setRenamingHandle(null)}
              />
            ) : (
              <>
                <span className="text-muted-foreground self-center">
                  <code>.{selectedBox.className}</code>
                </span>
                <WithTooltip tip="Give this box a different class name">
                  <button
                    type="button"
                    onClick={() => setRenamingHandle(selectedBox.handle)}
                    className="hover:bg-muted rounded-md border px-2 py-1"
                  >
                    Rename
                  </button>
                </WithTooltip>
              </>
            )}
            <WithTooltip
              tip={
                selectedHasJs
                  ? "Remove this box's script hook from the source"
                  : "Add a script hook for this box to the source"
              }
            >
              <button
                type="button"
                onClick={selectedHasJs ? handleDetachJs : () => attachJsTo(selectedHandle!)}
                className="hover:bg-muted rounded-md border px-2 py-1"
              >
                {selectedHasJs ? "Detach JS" : "Attach JS"}
              </button>
            </WithTooltip>
          </div>
        )}
      </div>
    </div>
  );
}
