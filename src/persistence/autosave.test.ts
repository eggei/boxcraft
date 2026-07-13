import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAutosave } from './autosave'

describe('createAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('coalesces rapid schedule() calls into a single save of the latest value', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const autosave = createAutosave(save, { delayMs: 300 })

    autosave.schedule('a')
    autosave.schedule('b')
    autosave.schedule('c')

    await vi.advanceTimersByTimeAsync(300)

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('c')
  })

  it('flush() saves the pending value immediately, without waiting for the debounce window', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const autosave = createAutosave(save, { delayMs: 300 })

    autosave.schedule('mid-edit')
    await autosave.flush()

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('mid-edit')
  })

  it('flush() is a no-op when there is nothing pending', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const autosave = createAutosave(save, { delayMs: 300 })

    await autosave.flush()

    expect(save).not.toHaveBeenCalled()
  })

  it('retries a failed save after a backoff, without losing the pending value', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('write failed')).mockResolvedValueOnce(undefined)
    const onError = vi.fn()
    const autosave = createAutosave(save, { delayMs: 300, retryDelayMs: 500, onError })

    autosave.schedule('x')
    await vi.advanceTimersByTimeAsync(300)
    expect(save).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(500)
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenNthCalledWith(2, 'x')
  })

  it('a schedule() during an in-flight save triggers a follow-up save once it settles', async () => {
    let resolveFirst!: () => void
    const save = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockResolvedValueOnce(undefined)
    const autosave = createAutosave(save, { delayMs: 300 })

    autosave.schedule('a')
    await vi.advanceTimersByTimeAsync(300)
    expect(save).toHaveBeenCalledTimes(1)

    // Edited again while the first save is still in flight.
    autosave.schedule('b')
    await vi.advanceTimersByTimeAsync(300)
    expect(save).toHaveBeenCalledTimes(1) // debounced call is a no-op: already saving

    resolveFirst()
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    expect(save).toHaveBeenNthCalledWith(2, 'b')
  })
})
