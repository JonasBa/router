/**
 * The registries of `mockServerFn` and `mockMiddleware`. Each registers its
 * map here, so that one hook of the test runner can put all of them back
 * after a test.
 */
const stores = new Set<Map<unknown, unknown>>()

/** @internal */
export function registerMockStore(store: Map<any, any>): void {
  stores.add(store)
}

/**
 * Remembers every mock that is registered now and returns the function that
 * restores exactly those. The setup file of a test runner calls it before
 * each test and the returned function after it: a mock from the test itself
 * or from `beforeEach` then ends with the test, and a mock from the top of
 * the file or from `beforeAll` stays for the file.
 *
 * @internal
 */
export function saveMocks(): () => void {
  const saved = Array.from(stores, (store) => [store, new Map(store)] as const)
  return () => {
    for (const [store, entries] of saved) {
      store.clear()
      for (const [key, value] of entries) {
        store.set(key, value)
      }
    }
  }
}
