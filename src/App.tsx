import { useRef, useState } from 'react'
import { useScene } from '@/scene/useScene'
import { SceneEditor, type SceneEditorHandle } from '@/scene/SceneEditor'
import { SceneStage } from '@/scene/SceneStage'
import { Toolbar, type Tool } from '@/scene/Toolbar'
import { listBoxes, type BoxPlacement } from '@/scene/document'

function App() {
  const { scene, status, update } = useScene()
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

  function handleRename() {
    if (!selectedHandle || !scene) return
    const box = listBoxes(scene.source).find((b) => b.handle === selectedHandle)
    if (!box) return
    const next = window.prompt('Rename box', box.className)?.trim()
    if (!next || next === box.className) return
    editorRef.current?.renameBox(selectedHandle, next)
  }

  const selectedBox =
    scene && selectedHandle
      ? listBoxes(scene.source).find((b) => b.handle === selectedHandle)
      : undefined

  return (
    <div className="flex h-svh flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-2">
        <h1 className="text-lg font-semibold tracking-tight">BoxCraft</h1>
        {scene && (
          <input
            aria-label="Scene title"
            className="border-input focus-visible:ring-ring rounded-md border bg-transparent px-2 py-1 text-sm outline-none focus-visible:ring-[3px]"
            value={scene.title}
            onChange={(event) => update({ title: event.target.value })}
          />
        )}
      </header>

      {status === 'loading' || !scene ? (
        <p className="text-muted-foreground p-8 text-sm">Loading…</p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-2">
          <div className="min-h-0 overflow-hidden border-r">
            <SceneEditor
              ref={editorRef}
              value={scene.source}
              onChange={(source) => update({ source })}
              onCursorBox={setSelectedHandle}
            />
          </div>
          <div className="relative min-h-0">
            <Toolbar tool={tool} onToolChange={setTool} />
            <SceneStage
              source={scene.source}
              tool={tool}
              selectedHandle={selectedHandle}
              onCreateBox={handleCreateBox}
              onSelectBox={handleSelectBox}
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
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
