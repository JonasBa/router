import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { hasRouteTreeSources } from '../src/start-router-plugin/has-route-tree-sources'

const roots = new Set<string>()

function createRoutesDirectory(files: Array<string>) {
  const root = mkdtempSync(join(tmpdir(), 'tanstack-start-routes-'))
  roots.add(root)
  const routesDirectory = join(root, 'src', 'routes')
  mkdirSync(routesDirectory, { recursive: true })
  for (const file of files) {
    writeFileSync(join(routesDirectory, file), 'export {}\n')
  }
  return routesDirectory
}

afterEach(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true })
  }
  roots.clear()
})

describe('hasRouteTreeSources', () => {
  test('is true for a router entry and a routes directory with a root route', () => {
    const routesDirectory = createRoutesDirectory(['__root.tsx', 'index.tsx'])

    expect(
      hasRouteTreeSources({
        routerFilePath: '/app/src/router.tsx',
        generatorConfig: { routesDirectory },
      }),
    ).toBe(true)
  })

  test('is false without a router entry', () => {
    const routesDirectory = createRoutesDirectory(['__root.tsx', 'index.tsx'])

    expect(
      hasRouteTreeSources({
        routerFilePath: '',
        generatorConfig: { routesDirectory },
      }),
    ).toBe(false)
  })

  test('is false for a routes directory without a root route', () => {
    const routesDirectory = createRoutesDirectory(['index.tsx', '__rooted.tsx'])

    expect(
      hasRouteTreeSources({
        routerFilePath: '/app/src/router.tsx',
        generatorConfig: { routesDirectory },
      }),
    ).toBe(false)
  })

  test('is false when the routes directory does not exist', () => {
    const routesDirectory = join(createRoutesDirectory([]), 'missing')

    expect(
      hasRouteTreeSources({
        routerFilePath: '/app/src/router.tsx',
        generatorConfig: { routesDirectory },
      }),
    ).toBe(false)
  })

  // Virtual routes name their root route file themselves.
  test('is true for a virtual route config, whatever the routes directory holds', () => {
    const routesDirectory = join(createRoutesDirectory([]), 'missing')

    expect(
      hasRouteTreeSources({
        routerFilePath: '/app/src/router.tsx',
        generatorConfig: {
          routesDirectory,
          virtualRouteConfig: './routes.ts',
        },
      }),
    ).toBe(true)
  })
})
