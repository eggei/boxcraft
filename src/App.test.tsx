import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { openSceneStore } from './persistence/scene-store'

let n = 0
const freshDb = () => `boxcraft-app-${n++}`

describe('App', () => {
  it('loads the scene list and opens into L2, live and toolless', async () => {
    const store = await openSceneStore(freshDb())
    render(<App openStore={() => Promise.resolve(store)} />)

    // New scenes are born with a .canvas stage (DESIGN.md §1, Phase 1).
    const frame = await screen.findByTitle('scene')
    expect(frame.getAttribute('srcdoc')).toContain('<div class="canvas">')
    expect(screen.getByText('Start Editing (⌘+Enter)')).toBeInTheDocument()
  })

  it('autosaves edits made after entering L3', async () => {
    const store = await openSceneStore(freshDb())
    // Pre-seed a tiny single-line scene: cursor math under jsdom (no layout)
    // makes multi-char typing into a large doc unreliable, so keep the edit
    // to a single character — enough to prove the autosave wiring.
    await store.put({ id: 'default', title: 'Scene 1', source: 'x', order: 0 })
    const user = userEvent.setup()
    render(<App openStore={() => Promise.resolve(store)} />)

    await user.click(await screen.findByText('Start Editing (⌘+Enter)'))
    const content = await waitFor(() => {
      const el = document.querySelector('.cm-content')
      expect(el).not.toBeNull()
      return el as HTMLElement
    })
    await user.click(content)
    await user.type(content, 'Z')

    await waitFor(async () => {
      const saved = await store.get('default')
      expect(saved?.source).toContain('Z')
    })
  })
})
