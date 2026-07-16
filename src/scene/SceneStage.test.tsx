import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SceneStage } from './SceneStage'

const SOURCE = '<!doctype html><html><body><div class="canvas"></div></body></html>'

function stageProps() {
  return {
    tool: 'select' as const,
    selectedHandle: null,
    onCreateBox: vi.fn(),
    onSelectBox: vi.fn(),
    onAttachJs: vi.fn(),
  }
}

describe('SceneStage', () => {
  it('renders the source into an isolated iframe', () => {
    // A bare canvas has no boxes, so the instrumented render equals the source.
    render(<SceneStage source={SOURCE} {...stageProps()} />)
    const iframe = screen.getByTitle('Scene preview')
    expect(iframe).toHaveAttribute('srcdoc', SOURCE)
  })

  it('shows the box-drop overlay only while the Box tool is active', () => {
    const { rerender } = render(
      <SceneStage source={SOURCE} {...stageProps()} tool="select" />,
    )
    expect(screen.queryByTestId('box-overlay')).not.toBeInTheDocument()

    rerender(<SceneStage source={SOURCE} {...stageProps()} tool="box" />)
    expect(screen.getByTestId('box-overlay')).toBeInTheDocument()
  })
})
