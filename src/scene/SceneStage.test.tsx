import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SceneStage } from './SceneStage'

const SOURCE = '<!doctype html><html><body><div class="canvas"></div></body></html>'

describe('SceneStage', () => {
  it('renders the source into an isolated iframe', () => {
    render(<SceneStage source={SOURCE} tool="select" onCreateBox={vi.fn()} />)
    const iframe = screen.getByTitle('Scene preview')
    expect(iframe).toHaveAttribute('srcdoc', SOURCE)
  })

  it('shows the box-drop overlay only while the Box tool is active', () => {
    const { rerender } = render(
      <SceneStage source={SOURCE} tool="select" onCreateBox={vi.fn()} />,
    )
    expect(screen.queryByTestId('box-overlay')).not.toBeInTheDocument()

    rerender(<SceneStage source={SOURCE} tool="box" onCreateBox={vi.fn()} />)
    expect(screen.getByTestId('box-overlay')).toBeInTheDocument()
  })
})
