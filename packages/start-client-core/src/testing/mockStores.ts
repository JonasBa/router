/**
 * What `mockServerFn` and `mockMiddleware` keep for a test file. Each of them
 * registers its store here, so that one hook of the test runner can put all
 * of them back after a test.
 */

/** Remembers what a store holds, and returns the function that puts it back. */
type SaveMocks = () => () => void

const stores = new Set<SaveMocks>()

/** @internal */
export function registerMockStore(save: SaveMocks): void {
  stores.add(save)
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
  const restores = Array.from(stores, (save) => save())
  return () => {
    for (const restore of restores) {
      restore()
    }
  }
}
