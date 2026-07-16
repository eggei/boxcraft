import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Reset the DOM and the in-memory IndexedDB between tests so each test starts clean.
afterEach(() => {
  cleanup()
  globalThis.indexedDB = new IDBFactory()
})
