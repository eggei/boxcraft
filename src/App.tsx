import { useRef, useState } from 'react'
import { useScene } from '@/scene/useScene'
import { SceneEditor, type SceneEditorHandle } from '@/scene/SceneEditor'
import { SceneStage } from '@/scene/SceneStage'
import { Toolbar, type Tool } from '@/scene/Toolbar'
import type { BoxPlacement } from '@/scene/document'

function App() {
  const { scene, status, update } = useScene()
  const [tool, setTool] = useState<Tool>('select')
  const editorRef = useRef<SceneEditorHandle>(null)

  function handleCreateBox(placement: BoxPlacement) {
    editorRef.current?.createBox(placement)
    setTool('select') // tool reverts to Select after creation
  }

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
            />
          </div>
          <div className="relative min-h-0">
            <Toolbar tool={tool} onToolChange={setTool} />
            <SceneStage
              source={scene.source}
              tool={tool}
              onCreateBox={handleCreateBox}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default App
