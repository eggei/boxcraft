import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { openSceneStore } from './persistence/scene-store'
import { DEFAULT_SCENE_ID } from './app/scene-bootstrap'

let n = 0
const freshDb = () => `boxcraft-app-${n++}`

describe('App', () => {
  it('loads the default scene from the store and renders it', async () => {
    const store = await openSceneStore(freshDb())
    render(<App openStore={() => Promise.resolve(store)} />)

    const frame = await screen.findByTitle('scene')
    // New scenes are born with a .canvas stage (DESIGN.md §1, Phase 1).
    expect(frame.getAttribute('srcdoc')).toContain('<div class="canvas">')
  })

  it('autosaves edits so the scene persists', async () => {
    const store = await openSceneStore(freshDb())
    // Pre-seed a tiny single-line scene: cursor math under jsdom (no layout)
    // makes multi-char typing into a large doc unreliable, so keep the edit
    // to a single character — enough to prove the autosave wiring.
    await store.put({ id: DEFAULT_SCENE_ID, title: 'Scene 1', source: 'x' })
    const user = userEvent.setup()
    render(<App openStore={() => Promise.resolve(store)} />)

    await screen.findByTitle('scene')
    const content = document.querySelector('.cm-content') as HTMLElement
    await user.click(content)
    await user.type(content, 'Z')

    await waitFor(async () => {
      const saved = await store.get(DEFAULT_SCENE_ID)
      expect(saved?.source).toContain('Z')
    })
  })
})
