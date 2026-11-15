import { createServerHistory } from '@tanstack/history'
import { getNormalizedURL } from '@tanstack/router-core/ssr/server'
import {
  createNullProtoObject,
  flattenMiddlewares,
  safeObjectMerge,
} from '@tanstack/start-client-core'
import { runWithStartContext } from '@tanstack/start-storage-context'
import {
  reconcileResponse,
  withStartRequest,
} from '../internal-request-response'
import { assertMocksRan } from './middlewareMocks'
import { runWithScope } from './scope'
import type { AnyRouter, Expand, Register } from '@tanstack/router-core'
import type {
  AnyRequestMiddleware,
  AnyStartInstanceOptions,
  AssignAllServerFnContext,
  RouterEntry,
  StartEntry,
} from '@tanstack/start-client-core'
import type { StartEvent } from '../internal-request-response'
import type { RequestOptions } from '../request-handler'
import type { TestRequestScope } from './scope'
import type { ContextOption } from './types'

/** The request of a scope: a `Request`, or the parts to build one from. */
export type RequestDescription =
  | { request: Request; url?: never; method?: never; headers?: never }
  | {
      request?: never
      /** Relative URLs are resolved against `http://localhost`. */
      url?: string | URL
      method?: string
      headers?: HeadersInit
    }

/**
 * The context the global middleware of `src/start.ts` leaves for a server
 * function: what the server entry passes in, and what the request middleware
 * and the function middleware of the start instance add.
 */
export type GlobalMiddlewareContext = Expand<
  AssignAllServerFnContext<Register, undefined>
>

export type RunInRequestOptions = RequestDescription &
  (
    | ({
        globalMiddleware?: undefined
        // The request context the server entry passes to Start, see
        // `Register['server']['requestContext']`.
      } & Pick<RequestOptions<Register>, 'context'>)
    | ({
        /**
         * Leaves out the middleware of `src/start.ts`, the request list and
         * the function list. `context` then stands for what they pass on.
         */
        globalMiddleware: 'skip'
      } & ContextOption<GlobalMiddlewareContext>)
  )

const NO_ROUTER =
  'This project has no router entry (src/router.tsx), so there is no router to return in a test.'

async function loadRouter(
  url: URL,
  startOptions: AnyStartInstanceOptions,
): Promise<AnyRouter> {
  // @ts-ignore The virtual entry is resolved by the bundler, as in createStartHandler.
  const routerEntry: RouterEntry = await import('#tanstack-router-entry')
  // (the placeholder entry of a project without a router returns nothing)
  const router = (await routerEntry.getRouter()) as AnyRouter | undefined
  if (!router) {
    throw new Error(NO_ROUTER)
  }
  // As createStartHandler prepares the router of a request.
  router.update({
    history: createServerHistory(url.pathname + url.search + url.hash),
    origin: router.options.origin ?? url.origin,
    basepath: process.env.TSS_ROUTER_BASEPATH || '/',
    ...{ defaultSsr: startOptions.defaultSsr },
  })
  return router
}

async function runScope<TResult>(
  event: StartEvent,
  options: RunInRequestOptions,
  callback: () => TResult | Promise<TResult>,
): Promise<TResult> {
  const request = event.request
  const url = getNormalizedURL(event.requestUrl).url

  // @ts-ignore The virtual entry is resolved by the bundler, as in createStartHandler.
  const startEntry: StartEntry = await import('#tanstack-start-entry')
  const appStartOptions: AnyStartInstanceOptions =
    (await startEntry.startInstance?.getOptions()) ??
    ({} as AnyStartInstanceOptions)
  const startOptions: AnyStartInstanceOptions =
    options.globalMiddleware === 'skip'
      ? {
          ...appStartOptions,
          requestMiddleware: undefined,
          functionMiddleware: undefined,
        }
      : appStartOptions

  // The same set a request of the app keeps: a server function does not run
  // a request middleware again that already ran for the request.
  const executedRequestMiddlewares = new Set<AnyRequestMiddleware>()
  const requestMiddleware = flattenMiddlewares<AnyRequestMiddleware>(
    [...(startOptions.requestMiddleware ?? [])],
    undefined,
    executedRequestMiddlewares,
  )

  let routerPromise: Promise<AnyRouter> | undefined
  const scope: TestRequestScope = {
    request,
    pathname: url.pathname,
    handlerType: 'router',
    mocks: new Map(),
  }

  return runWithScope(scope, async () => {
    const pipeline: {
      request: Request
      pathname: string
      handlerType: 'router'
      context: Record<string, unknown>
      response?: Response
    } = {
      request,
      pathname: url.pathname,
      handlerType: 'router',
      context: createNullProtoObject(
        options.context as Record<string, unknown> | undefined,
      ),
    }
    let outcome: { value: TResult } | { error: unknown } | undefined
    let callbackStarted = false

    const runCallback = async () => {
      if (callbackStarted) {
        throw new Error(
          'runInRequest(): a request middleware called next() more than once.',
        )
      }
      callbackStarted = true
      try {
        const value = await runWithStartContext(
          {
            getRouter: () => (routerPromise ??= loadRouter(url, startOptions)),
            request,
            startOptions,
            contextAfterGlobalMiddlewares: pipeline.context,
            executedRequestMiddlewares,
            handlerType: 'router',
          },
          callback,
        )
        outcome = { value }
      } catch (error) {
        outcome = { error }
        throw error
      }
      if (requestMiddleware.length) {
        // What a request middleware gets from next(): a response that has
        // the status and the headers the code in the callback set.
        pipeline.response = reconcileResponse(new Response(null), event)
      }
      return pipeline
    }

    const dispatch = async (index: number): Promise<typeof pipeline> => {
      const middleware = requestMiddleware[index]
      if (!middleware) {
        return runCallback()
      }
      const server = middleware.options.server as
        | ((options: unknown) => unknown)
        | undefined
      if (!server) {
        return dispatch(index + 1)
      }
      const result = await server({
        ...pipeline,
        next: (nextOptions?: { context?: Record<string, unknown> }) => {
          if (nextOptions?.context) {
            pipeline.context = safeObjectMerge(
              pipeline.context,
              nextOptions.context,
            )
          }
          return dispatch(index + 1)
        },
      })
      if (result instanceof Response) {
        pipeline.response = result
      }
      return pipeline
    }

    try {
      await dispatch(0)
    } catch (error) {
      // The error of the callback is what the test is about, also when a
      // middleware turned it into something else.
      throw outcome && 'error' in outcome ? outcome.error : error
    }
    if (!outcome) {
      throw new Error(
        `runInRequest(): a request middleware of src/start.ts ended the request${
          pipeline.response ? ` with status ${pipeline.response.status}` : ''
        } before the callback ran. ` +
          `Send a request the middleware lets through, replace the middleware with mockMiddleware(), or pass globalMiddleware: 'skip'. ` +
          `To test the middleware itself, call it with runMiddleware().`,
        { cause: pipeline.response },
      )
    }
    if ('error' in outcome) {
      throw outcome.error
    }
    assertMocksRan(scope.mocks)
    return outcome.value
  })
}

function toRequest(options: RunInRequestOptions): Request {
  if (options.request) {
    return options.request
  }
  return new Request(new URL(options.url ?? '/', 'http://localhost'), {
    method: options.method,
    headers: options.headers,
  })
}

/**
 * Runs `callback` as code that handles one request to the app's server.
 *
 * The global request middleware of `src/start.ts` runs first. Inside the
 * callback a server function can be called as a loader calls it while the
 * server renders a page: its client middleware runs, then its server
 * middleware, its validator and its handler. Start's request and response
 * helpers (`getRequest`, `getCookie`, `setResponseHeader`,
 * `getResponseHeader`, ...) work inside the callback as well.
 *
 * Resolves to what the callback returns, and rejects with what it throws.
 */
export function runInRequest<TResult>(
  callback: {} extends RunInRequestOptions
    ? () => TResult | Promise<TResult>
    : never,
): Promise<TResult>
export function runInRequest<TResult>(
  options: RunInRequestOptions,
  callback: () => TResult | Promise<TResult>,
): Promise<TResult>
export async function runInRequest<TResult>(
  ...args:
    | [callback: () => TResult | Promise<TResult>]
    | [options: RunInRequestOptions, callback: () => TResult | Promise<TResult>]
): Promise<TResult> {
  const [options, callback] = args.length === 1 ? [{}, args[0]] : args
  if (typeof callback !== 'function') {
    throw new Error(
      'runInRequest() needs a callback: runInRequest(options, async () => { ... }).',
    )
  }
  const request = toRequest(options)
  let completed: { value: TResult } | undefined

  const handleRequest = withStartRequest(async (_request, _options, event) => {
    completed = { value: await runScope(event, options, callback) }
    return new Response(null)
  })
  const response = await handleRequest(request, undefined)

  if (!completed) {
    throw new Error(
      `runInRequest(): Start does not accept the URL of the request, ${request.url} (status ${response.status}).`,
    )
  }
  return completed.value
}
