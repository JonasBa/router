---
'@tanstack/start-plugin-core': minor
'@tanstack/router-plugin': minor
'@tanstack/router-generator': minor
---

Start's Vite plugin can be used in a Vitest config. When Vitest resolves the config to run tests, the plugin compiles the code as it does in the app (`createServerFn`, `createIsomorphicFn`, `createServerOnlyFn`, `createClientOnlyFn`, the server-only route options), for the client in browser mode and in jsdom or happy-dom, and for the server in the Node environment. It does not set up the app's dev server, preview server or build.

- A project needs no router entry and no routes. A package that only uses Start's compile-time APIs used to fail with "Could not resolve entry for router entry".
- The route tree is generated once, when Vitest starts, and only for a project with a router entry and a root route. It is not regenerated while Vitest watches.
- A test run never writes route files: a route file with an outdated route path and an empty route file are left as they are, with a warning.
- A module that calls `createFileRoute`, `createRootRoute` or `createRootRouteWithContext` loses its `server`, `ssr` and `headers` options in client code even when the route generator does not know the module.
- Start's own packages go through the Start compiler in jsdom, happy-dom and Node tests of a project that installs them from the registry. Vitest's translation of the wildcards in `resolve.noExternal` misses a package name with a dash, so `@tanstack/start-client-core` ran uncompiled and a server function call in a client test failed with "No Start context found in AsyncLocalStorage". In a test run Start now names its packages with regular expressions.

For this, `Generator` of `@tanstack/router-generator` takes `writeRouteFiles: false`, and `tanstackRouterGenerator` and `tanStackRouterCodeSplitter` of `@tanstack/router-plugin/vite` take options for the plugin that embeds them.
