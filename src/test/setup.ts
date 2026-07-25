import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Reset the DOM, the in-memory IndexedDB and the stored appearance preferences
// between tests so each one starts clean.
afterEach(() => {
  cleanup()
  globalThis.indexedDB = new IDBFactory()
  localStorage.clear()
  document.documentElement.classList.remove('dark')
  document.documentElement.style.colorScheme = ''
  delete document.documentElement.dataset.theme
  delete document.documentElement.dataset.palette
})
