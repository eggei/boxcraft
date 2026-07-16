import { useRef, useState } from 'react'
import { SceneEditor, type SceneEditorHandle } from './SceneEditor'
import { SceneStage } from './SceneStage'
import { Toolbar, type Tool } from './Toolbar'
import { listBoxes, type BoxPlacement } from './document'

/**
 * The L3 editing surface for a single scene: CodeMirror source (left) + the
 * instrumented iframe render with the tool overlay (right), plus a selection
 * panel. Tool/selection state is local to the focused scene. Source changes
 * are lifted out via `onChange` so the owner persists them.
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
      <div className="min-h-0 overflow-hidden border-r">
        <SceneEditor
          ref={editorRef}
          value={source}
          onChange={onChange}
          onCursorBox={setSelectedHandle}
        />
      </div>
      <div className="relative min-h-0">
        <Toolbar tool={tool} onToolChange={setTool} />
        <SceneStage
          source={source}
          tool={tool}
          selectedHandle={selectedHandle}
          onCreateBox={handleCreateBox}
          onSelectBox={handleSelectBox}
          onAttachJs={handleAttachJs}
        />
        {selectedBox && (
          <div className="bg-background absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-md">
            <span className="text-muted-foreground">
              <code>.{selectedBox.className}</code>
            </span>
            <button
              type="button"
              onClick={handleRename}
              className="hover:bg-muted rounded-md border px-2 py-1"
            >
              Rename
            </button>
            <button
              type="button"
              onClick={
                selectedHasJs ? handleDetachJs : () => handleAttachJs(selectedHandle!)
              }
              className="hover:bg-muted rounded-md border px-2 py-1"
            >
              {selectedHasJs ? 'Detach JS' : 'Attach JS'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
