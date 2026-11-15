---
'@tanstack/start-client-core': minor
'@tanstack/react-start': minor
'@tanstack/solid-start': minor
'@tanstack/vue-start': minor
'@tanstack/start-plugin-core': minor
---

Add `mockServerFn` and `resetServerFnMocks` for client tests, exported from `@tanstack/react-start/testing`, `@tanstack/solid-start/testing` and `@tanstack/vue-start/testing`. Experimental.

A client test has no server. When Vitest compiles a project with Start's plugin, a server function call in client code no longer sends a request. It goes to the mock a test registered for that function, and fails with an error that names the function when there is none.

```ts
import { mockServerFn } from '@tanstack/react-start/testing'

test('greets', async () => {
  mockServerFn(greet, ({ data }) => `Hello ${data}`)
  // ...
})
```

A mock that a test registers ends with that test. Start's plugin adds a setup file to every Vitest project for this. `resetServerFnMocks` removes mocks earlier.

The mock is typed from the server function: it gets the `data` the function is called with, and has to return what the function's handler returns. It stands for the server side of the function (its server middleware, validator and handler); the function's client middleware runs as in the app. Unlike a module mock, it also answers a call made in the file that defines the server function.
