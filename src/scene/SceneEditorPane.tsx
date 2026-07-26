import { useEffect, useRef, useState } from 'react'
import { IndentIncrease } from 'lucide-react'
import { WithTooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useEditorSettings } from '@/settings/useEditorSettings'
import { EditorSettingsMenu } from './EditorSettingsMenu'
import { SceneEditor, type SceneEditorHandle } from './SceneEditor'
import { SceneStage } from './SceneStage'
import { Toolbar, type Tool } from './Toolbar'
import { listBoxes, type BoxPlacement } from './document'

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
}: {
  source: string
  onChange: (source: string) => void
}) {
  const [tool, setTool] = useState<Tool>('select')
  const [selectedHandle, setSelectedHandle] = useState<string | null>(null)
  const editorRef = useRef<SceneEditorHandle>(null)
  const { settings, toggleAutoFormat, toggleEditorSide } = useEditorSettings()
  const codeOnRight = settings.editorSide === 'right'

  function handleCreateBox(placement: BoxPlacement) {
    editorRef.current?.createBox(placement)
    setTool('select') // tool reverts to Select after creation
  }

  function handleSelectBox(handle: string) {
    setSelectedHandle(handle)
    editorRef.current?.selectBox(handle)
  }

  function handleAttachJs(handle: string) {
    setSelectedHandle(handle)
    editorRef.current?.attachJs(handle)
    setTool('select') // tool reverts to Select after attaching
  }

  function handleDetachJs() {
    if (selectedHandle) editorRef.current?.detachJs(selectedHandle)
  }

  function handleFormat() {
    editorRef.current?.format()
  }

  // ⌥F formats from anywhere on the editing surface, including from inside the
  // editor — which is the whole point, so unlike the app's other shortcuts this
  // one deliberately does not bow out of contenteditable.
  useEffect(function bindFormatShortcut() {
    function onKeyDown(event: KeyboardEvent) {
      // Option+F types "ƒ" on macOS, so match the physical key, not `key`.
      if (!event.altKey || event.metaKey || event.ctrlKey) return
      if (event.code !== 'KeyF') return
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return
      // Cancels the "ƒ" the editor would otherwise be handed.
      event.preventDefault()
      editorRef.current?.format()
    }
    window.addEventListener('keydown', onKeyDown)
    return function unbind() {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  function handleRename() {
    if (!selectedHandle) return
    const box = listBoxes(source).find((b) => b.handle === selectedHandle)
    if (!box) return
    const next = window.prompt('Rename box', box.className)?.trim()
    if (!next || next === box.className) return
    editorRef.current?.renameBox(selectedHandle, next)
  }

  const selectedBox = selectedHandle
    ? listBoxes(source).find((b) => b.handle === selectedHandle)
    : undefined
  const selectedHasJs =
    !!selectedBox &&
    source.includes(`getElementById('${selectedBox.className}')`)

  return (
    <div className="grid h-full min-h-0 grid-cols-2">
      {/* Which half each pane takes is CSS `order`, not JSX order: swapping the
          children would remount CodeMirror and take the undo history with it. */}
      <div
        className={cn(
          'relative min-h-0 overflow-hidden',
          codeOnRight ? 'order-2 border-l' : 'order-1 border-r',
        )}
      >
        <SceneEditor
          ref={editorRef}
          value={source}
          onChange={onChange}
          onCursorBox={setSelectedHandle}
          autoFormat={settings.autoFormat}
        />
        {/* One corner stack over the source: the settings gear, the tools
            beneath it, then Format. It lives on the editor side because that is
            the half that follows the person around when the sides are swapped,
            and the tools write code as much as they draw. */}
        <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-2">
          <EditorSettingsMenu
            settings={settings}
            onToggleAutoFormat={toggleAutoFormat}
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
      <div className={cn('relative min-h-0', codeOnRight ? 'order-1' : 'order-2')}>
        <SceneStage
          source={source}
          tool={tool}
          selectedHandle={selectedHandle}
          onCreateBox={handleCreateBox}
          onSelectBox={handleSelectBox}
          onAttachJs={handleAttachJs}
        />
        {selectedBox && (
          <div className="bg-popover shadow-raised absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              <code>.{selectedBox.className}</code>
            </span>
            <WithTooltip tip="Give this box a different class name">
              <button
                type="button"
                onClick={handleRename}
                className="hover:bg-muted rounded-md border px-2 py-1"
              >
                Rename
              </button>
            </WithTooltip>
            <WithTooltip
              tip={
                selectedHasJs
                  ? "Remove this box's script hook from the source"
                  : 'Add a script hook for this box to the source'
              }
            >
              <button
                type="button"
                onClick={
                  selectedHasJs ? handleDetachJs : () => handleAttachJs(selectedHandle!)
                }
                className="hover:bg-muted rounded-md border px-2 py-1"
              >
                {selectedHasJs ? 'Detach JS' : 'Attach JS'}
              </button>
            </WithTooltip>
          </div>
        )}
      </div>
    </div>
  )
}
