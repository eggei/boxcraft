import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { openSceneStore } from '../persistence/scene-store'
import { SceneStoreProvider } from '../persistence/SceneStoreContext'
import { NavProvider, useNav } from './NavContext'
import { L3Focus } from './L3Focus'

let n = 0
const freshDb = () => `boxcraft-l3-${n++}`

function Level() {
  const { state } = useNav()
  return <span data-testid="level">{state.level}</span>
}

describe('L3Focus', () => {
  it('loads and renders the focused scene in the full editing workspace', async () => {
    const store = await openSceneStore(freshDb())
    await store.put({ id: 'a', title: 'Scene 1', source: '<div class="canvas"></div>', order: 0 })

    render(
      <SceneStoreProvider store={store}>
        <NavProvider initialState={{ level: 'L3', currentId: 'a' }}>
          <Level />
          <L3Focus id="a" />
        </NavProvider>
      </SceneStoreProvider>,
    )

    const frame = await screen.findByTitle('scene')
    expect(frame.getAttribute('srcdoc')).toContain('canvas')
    expect(screen.getByText('Scene 1')).toBeInTheDocument()
  })

  it('Esc exits back to L2', async () => {
    const store = await openSceneStore(freshDb())
    await store.put({ id: 'a', title: 'Scene 1', source: '<div class="canvas"></div>', order: 0 })

    render(
      <SceneStoreProvider store={store}>
        <NavProvider initialState={{ level: 'L3', currentId: 'a' }}>
          <Level />
          <L3Focus id="a" />
        </NavProvider>
      </SceneStoreProvider>,
    )
    await screen.findByTitle('scene')

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => expect(screen.getByTestId('level')).toHaveTextContent('L2'))
  })

  it('the back button also exits to L2', async () => {
    const store = await openSceneStore(freshDb())
    await store.put({ id: 'a', title: 'Scene 1', source: '<div class="canvas"></div>', order: 0 })

    render(
      <SceneStoreProvider store={store}>
        <NavProvider initialState={{ level: 'L3', currentId: 'a' }}>
          <Level />
          <L3Focus id="a" />
        </NavProvider>
      </SceneStoreProvider>,
    )
    await screen.findByTitle('scene')

    fireEvent.click(screen.getByRole('button', { name: 'Back to feed' }))

    await waitFor(() => expect(screen.getByTestId('level')).toHaveTextContent('L2'))
  })

  it('flushes a pending edit before unmounting, so switching away mid-edit does not lose it', async () => {
    const store = await openSceneStore(freshDb())
    await store.put({ id: 'a', title: 'Scene 1', source: 'x', order: 0 })
    const user = userEvent.setup()

    const { unmount } = render(
      <SceneStoreProvider store={store}>
        <NavProvider initialState={{ level: 'L3', currentId: 'a' }}>
          <L3Focus id="a" />
        </NavProvider>
      </SceneStoreProvider>,
    )
    const content = await waitFor(() => {
      const el = document.querySelector('.cm-content')
      expect(el).not.toBeNull()
      return el as HTMLElement
    })
    await user.click(content)
    await user.type(content, 'Z')

    // Unmount immediately — before the debounce window would otherwise fire.
    unmount()

    await waitFor(async () => {
      const saved = await store.get('a')
      expect(saved?.source).toContain('Z')
    })
  })
})
