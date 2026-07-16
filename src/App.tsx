import { Button } from '@/components/ui/button'
import { useScene } from '@/scene/useScene'

function App() {
  const { scene, status, update } = useScene()

  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col gap-6 p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">BoxCraft</h1>
        <p className="text-muted-foreground text-sm">
          Foundation is up — a scene autosaves to IndexedDB and survives a
          reload. The render loop and tools land next.
        </p>
      </header>

      {status === 'loading' || !scene ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <section className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Scene title</span>
            <input
              aria-label="Scene title"
              className="border-input bg-background focus-visible:ring-ring rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-[3px]"
              value={scene.title}
              onChange={(event) => update({ title: event.target.value })}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Scene source (HTML)</span>
            <textarea
              aria-label="Scene source"
              className="border-input bg-background focus-visible:ring-ring h-64 rounded-md border px-3 py-2 font-mono text-xs outline-none focus-visible:ring-[3px]"
              value={scene.source}
              onChange={(event) => update({ source: event.target.value })}
              spellCheck={false}
            />
          </label>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => update({ title: scene.title })}
            >
              Autosaved continuously
            </Button>
            <span className="text-muted-foreground text-xs">
              Edits persist automatically — reload to confirm.
            </span>
          </div>
        </section>
      )}
    </main>
  )
}

export default App
