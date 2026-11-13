// An in-process BroadcastChannel for tests. Node ships a real one, but it
// reaches across worker threads — test files running side by side would hear
// each other. This one only connects channels created in the same file, and
// like the real thing never delivers a message back to the channel that sent it.

const open = new Set<FakeBroadcastChannel>()

export class FakeBroadcastChannel extends EventTarget {
  onmessage: ((event: MessageEvent) => void) | null = null
  readonly name: string
  private closed = false

  constructor(name: string) {
    super()
    this.name = name
    open.add(this)
  }

  postMessage(message: unknown): void {
    if (this.closed) throw new DOMException('Channel is closed', 'InvalidStateError')
    const data = structuredClone(message)
    for (const channel of open) {
      if (channel === this || channel.name !== this.name) continue
      // Delivery is asynchronous, as in a browser.
      setTimeout(() => channel.deliver(data), 0)
    }
  }

  close(): void {
    this.closed = true
    open.delete(this)
  }

  private deliver(data: unknown): void {
    if (this.closed) return
    const event = new MessageEvent('message', { data })
    this.onmessage?.(event)
    this.dispatchEvent(event)
  }
}
