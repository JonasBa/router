// The setup file Start's plugin adds to a Vitest run. After each test the
// mocks of `mockServerFn` and `mockMiddleware` are what they were before it.
import { beforeEach } from 'vitest'
import { saveMocks } from './mockStores'

beforeEach(() => saveMocks())
