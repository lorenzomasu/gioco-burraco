/**
 * Deterministic in-memory `Storage`. Unlike jsdom's implementation it schedules no
 * storage-event timers, so fake-timer assertions only observe application timers.
 */
export const createMemoryStorage = (): Storage => {
  const items = new Map<string, string>()
  return {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => {
      items.delete(key)
    },
    setItem: (key, value) => {
      items.set(key, String(value))
    },
  }
}
