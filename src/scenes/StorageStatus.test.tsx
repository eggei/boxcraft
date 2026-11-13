import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { downloadFile } from '@/library/transfer'
import { SaveIndicator, StorageUnavailable } from './StorageStatus'
import { seedScenes } from './sceneList'

vi.mock('@/library/transfer', () => ({ downloadFile: vi.fn() }))

describe('StorageUnavailable', () => {
  it('explains that nothing can be saved', () => {
    render(<StorageUnavailable scenes={[]} />)
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Storage is unavailable — your scenes can't be saved in this browser",
    )
    expect(screen.queryByRole('button', { name: 'Export library' })).not.toBeInTheDocument()
  })

  it('offers the library export when scenes are in memory', async () => {
    const user = userEvent.setup()
    render(<StorageUnavailable scenes={seedScenes()} />)

    await user.click(screen.getByRole('button', { name: 'Export library' }))

    expect(downloadFile).toHaveBeenCalledTimes(1)
    const [filename, contents] = vi.mocked(downloadFile).mock.calls[0]
    expect(filename).toMatch(/\.json$/)
    expect(JSON.parse(contents).scenes).toHaveLength(seedScenes().length)
  })
})

describe('SaveIndicator', () => {
  it.each([
    ['saved', 'Saved'],
    ['saving', 'Saving…'],
    ['error', 'Save failed'],
  ] as const)('shows %s as “%s”', (state, label) => {
    render(<SaveIndicator state={state} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('suggests exporting when a save failed', async () => {
    const user = userEvent.setup()
    render(<SaveIndicator state="error" />)

    await user.hover(screen.getByText('Save failed'))

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Export the library')
  })
})
