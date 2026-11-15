import { describe, expect, test } from 'vitest'
import { ENTRY_POINTS } from '../../src/constants'
import { createViteTestConfigPlan } from '../../src/vite/planning'

const entryPaths = {
  client: '/app/src/client.tsx',
  server: '/app/src/server.ts',
  start: '/app/src/start.ts',
}

describe('createViteTestConfigPlan', () => {
  test('aliases every entry of an app', () => {
    const plan = createViteTestConfigPlan({
      framework: 'react',
      entryPaths: { ...entryPaths, router: '/app/src/router.tsx' },
      optimizeDepsExclude: [],
      noExternal: [],
    })

    expect(plan.resolve.alias).toMatchObject({
      [ENTRY_POINTS.client]: '/app/src/client.tsx',
      [ENTRY_POINTS.server]: '/app/src/server.ts',
      [ENTRY_POINTS.start]: '/app/src/start.ts',
      [ENTRY_POINTS.router]: '/app/src/router.tsx',
    })
  })

  // Start's packages then resolve the placeholder router entry they ship.
  test('leaves the router entry of a package without one unaliased', () => {
    const plan = createViteTestConfigPlan({
      framework: 'react',
      entryPaths: { ...entryPaths, router: undefined },
      optimizeDepsExclude: [],
      noExternal: [],
    })

    expect(plan.resolve.alias).toMatchObject({
      [ENTRY_POINTS.client]: '/app/src/client.tsx',
      [ENTRY_POINTS.server]: '/app/src/server.ts',
      [ENTRY_POINTS.start]: '/app/src/start.ts',
    })
    expect(ENTRY_POINTS.router in plan.resolve.alias).toBe(false)
  })

  // No server takes the request of a client test, so the module that sends
  // it is replaced by the one that asks the mocks of `mockServerFn`.
  test.each(['react', 'solid', 'vue'] as const)(
    'sends the server function calls of %s client code to the mocks',
    (framework) => {
      const plan = createViteTestConfigPlan({
        framework,
        entryPaths: { ...entryPaths, router: undefined },
        optimizeDepsExclude: [],
        noExternal: [],
      })

      expect(plan.resolve.alias).toMatchObject({
        [`@tanstack/${framework}-start/client-rpc`]: `@tanstack/${framework}-start/testing/client-rpc`,
      })
    },
  )

  test('keeps the libraries built on Start out of pre-bundling and externalization', () => {
    const plan = createViteTestConfigPlan({
      framework: 'solid',
      entryPaths: { ...entryPaths, router: undefined },
      optimizeDepsExclude: ['a-start-library'],
      noExternal: ['a-start-library'],
    })

    expect(plan.environments.client.optimizeDeps.exclude).toEqual([
      'a-start-library',
    ])
    expect(plan.resolve.noExternal).toContain('a-start-library')
  })

  // Vitest decides by a file's path whether Vite compiles the file or Node
  // loads it as it is. Its translation of the wildcards the app's config
  // uses (`@tanstack/start**`) does not match a `-`: of Start's own packages
  // only `@tanstack/react-start` was compiled in a project that installs them
  // from the registry, and a server function call in a jsdom test failed
  // with "No Start context found in AsyncLocalStorage".
  describe("names Start's own packages so that a test runner finds them", () => {
    const plan = createViteTestConfigPlan({
      framework: 'react',
      entryPaths: { ...entryPaths, router: undefined },
      optimizeDepsExclude: [],
      noExternal: [],
    })
    const isNamed = (value: string) =>
      plan.resolve.noExternal.some(
        (pattern) => typeof pattern !== 'string' && pattern.test(value),
      )

    test.each([
      '@tanstack/react-start',
      '@tanstack/react-start-client',
      '@tanstack/react-start-server',
      '@tanstack/start-client-core',
      '@tanstack/start-server-core',
      '@tanstack/start-storage-context',
      '@tanstack/start-fn-stubs',
    ])('%s, by the path of a file and by its name', (name) => {
      // (as pnpm installs it, as npm installs it, and as Vite asks)
      expect(
        isNamed(
          `/app/node_modules/.pnpm/${name.replace('/', '+')}@1.0.0/node_modules/${name}/dist/esm/index.js`,
        ),
      ).toBe(true)
      expect(isNamed(`/app/node_modules/${name}/dist/esm/index.js`)).toBe(true)
      expect(isNamed(name)).toBe(true)
    })

    test.each([
      // another package of the scope
      '/app/node_modules/@tanstack/react-router/dist/esm/index.js',
      // the Start package of another framework
      '/app/node_modules/@tanstack/solid-start/dist/esm/index.js',
      // a project whose own directory is named like a Start package
      '/home/me/@tanstack/start-app/src/index.ts',
      '/home/me/@tanstack/start-app/node_modules/react/index.js',
    ])('and not %s', (file) => {
      expect(isNamed(file)).toBe(false)
    })
  })

  // A test runner decides what it builds and serves.
  test('plans no build and no dependency scan of the app', () => {
    const plan = createViteTestConfigPlan({
      framework: 'react',
      entryPaths: { ...entryPaths, router: '/app/src/router.tsx' },
      optimizeDepsExclude: [],
      noExternal: [],
    })

    expect(Object.keys(plan.environments)).toEqual(['client'])
    expect(Object.keys(plan.environments.client)).toEqual(['optimizeDeps'])
    expect(plan.environments.client.optimizeDeps).not.toHaveProperty('entries')
  })
})
