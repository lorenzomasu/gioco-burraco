import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import { createMemoryStorage } from './memoryStorage'

// The application persists the active match locally: every test starts from an empty,
// isolated, timer-free storage instead of jsdom's shared localStorage.
beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { configurable: true, value: createMemoryStorage() })
})

afterEach(cleanup)
