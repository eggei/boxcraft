import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FilesView } from './FilesView'
import { type Scene } from './sceneList'

const SCENES: Scene[] = [
  {
    id: 'a',
    title: 'Alpha',
    source: '<html>a</html>',
    order: 0,
    archivedAt: null,
  },
  {
    id: 'b',
    title: 'Beta',
    source: '<html>b</html>',
    order: 1,
    archivedAt: null,
  },
  {
    id: 'c',
    title: 'Gamma',
    source: '<html>c</html>',
    order: 2,
    archivedAt: null,
  },
]

/** A 240px-wide tile whose left edge sits at x=0, so x<120 is its left half. */
const TILE_RECT = { left: 0, width: 240 }

function tiles() {
  return screen.getAllByTestId('files-tile')
}

function titles() {
  return tiles().map((tile) => tile.textContent)
}

/**
 * jsdom implements neither DragEvent nor layout, so a drag has to be staged:
 * a MouseEvent carries the pointer position that picks the target gap, and a
 * stand-in DataTransfer stands in for the one a browser would attach.
 */
function fireDrag(
  element: Element,
  type: 'dragstart' | 'dragover' | 'drop' | 'dragend',
  clientX = 0,
) {
  const event = Object.assign(
    new MouseEvent(type, { bubbles: true, cancelable: true, clientX }),
    { dataTransfer: { effectAllowed: '', dropEffect: '', setData: vi.fn() } },
  )
  fireEvent(element, event)
}

function stubTileBoxes() {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    ...TILE_RECT,
    top: 0,
    right: 240,
    bottom: 268,
    height: 268,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
}

describe('FilesView drag to reorder', () => {
  it('previews the landing gap by moving the dragged tile into it', () => {
    stubTileBoxes()
    render(<FilesView scenes={SCENES} onOpen={vi.fn()} onReorder={vi.fn()} />)

    expect(titles()).toEqual(['Alpha', 'Beta', 'Gamma'])

    // Drag Gamma over the left half of Alpha: it should show as landing before
    // Alpha, with the others already shifted along to open that gap.
    fireDrag(tiles()[2], 'dragstart')
    fireDrag(tiles()[0], 'dragover', 40)

    expect(titles()).toEqual(['Gamma', 'Alpha', 'Beta'])
  })

  it('follows the pointer across a tile to the gap on its far side', () => {
    stubTileBoxes()
    render(<FilesView scenes={SCENES} onOpen={vi.fn()} onReorder={vi.fn()} />)

    fireDrag(tiles()[0], 'dragstart') // Alpha
    fireDrag(tiles()[1], 'dragover', 200) // right half of Beta
    expect(titles()).toEqual(['Beta', 'Alpha', 'Gamma'])

    fireDrag(tiles()[2], 'dragover', 200) // on to the right half of Gamma
    expect(titles()).toEqual(['Beta', 'Gamma', 'Alpha'])
  })

  it('marks the dragged tile as the drop slot only while dragging', () => {
    stubTileBoxes()
    render(<FilesView scenes={SCENES} onOpen={vi.fn()} onReorder={vi.fn()} />)

    expect(document.querySelector('[data-drop-slot]')).toBeNull()

    fireDrag(tiles()[2], 'dragstart')
    expect(tiles()[2]).toHaveAttribute('data-drop-slot')
    expect(tiles()[2]).toHaveTextContent('Gamma')

    fireDrag(tiles()[2], 'dragend')
    expect(document.querySelector('[data-drop-slot]')).toBeNull()
  })

  it('commits the previewed order on drop', () => {
    stubTileBoxes()
    const onReorder = vi.fn()
    render(<FilesView scenes={SCENES} onOpen={vi.fn()} onReorder={onReorder} />)

    fireDrag(tiles()[0], 'dragstart')
    fireDrag(tiles()[2], 'dragover', 200)
    expect(titles()).toEqual(['Beta', 'Gamma', 'Alpha'])

    fireDrag(tiles()[2], 'drop')
    expect(onReorder).toHaveBeenCalledExactlyOnceWith(['b', 'c', 'a'])
  })

  it('leaves the order alone when a drag is abandoned', () => {
    stubTileBoxes()
    const onReorder = vi.fn()
    render(<FilesView scenes={SCENES} onOpen={vi.fn()} onReorder={onReorder} />)

    fireDrag(tiles()[0], 'dragstart')
    fireDrag(tiles()[2], 'dragover', 200)
    fireDrag(tiles()[2], 'dragend')

    expect(onReorder).not.toHaveBeenCalled()
    expect(titles()).toEqual(['Alpha', 'Beta', 'Gamma'])
  })
})
