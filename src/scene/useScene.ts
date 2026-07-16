import { useEffect, useState } from 'react'
import { getAllScenes, saveScene, type Scene } from '@/persistence/scenes'

export const DEFAULT_SOURCE = `<!doctype html>
<html>
  <head>
    <style>
      body { margin: 0; display: grid; place-items: center; min-height: 100vh; }
      .canvas { position: relative; width: 400px; height: 400px; background: #fff; }
    </style>
  </head>
  <body>
    <div class="canvas"></div>
  </body>
</html>
`

function createDefaultScene(): Scene {
  return { id: 'scene-1', title: 'Scene 1', source: DEFAULT_SOURCE }
}

type Status = 'loading' | 'ready'

export function useScene() {
  const [scene, setScene] = useState<Scene | null>(null)
  const [status, setStatus] = useState<Status>('loading')

  useEffect(function restoreScene() {
    let active = true
    async function run() {
      const scenes = await getAllScenes()
      if (!active) return
      setScene(scenes[0] ?? createDefaultScene())
      setStatus('ready')
    }
    void run()
    return function cancel() {
      active = false
    }
  }, [])

  useEffect(
    function autosave() {
      if (status !== 'ready' || !scene) return
      void saveScene(scene)
    },
    [scene, status],
  )

  function update(patch: Partial<Pick<Scene, 'title' | 'source'>>) {
    setScene((current) => (current ? { ...current, ...patch } : current))
  }

  return { scene, status, update }
}
