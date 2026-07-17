import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CACHE_ACTIVITY_MESSAGE,
  PUBLIC_STARTPAGE_CACHE,
  type CacheActivityMessage,
} from '#/lib/service-worker-messages'
import { PUBLIC_STARTPAGE_PATH } from '#/lib/public-startpage'

vi.mock('workbox-core', () => ({ clientsClaim: vi.fn() }))
vi.mock('workbox-precaching', () => ({
  cleanupOutdatedCaches: vi.fn(),
  precacheAndRoute: vi.fn(),
}))

describe('public startpage service worker', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('serves cached data immediately while conditionally revalidating it', async () => {
    const listeners = new Map<string, (event: any) => void>()
    const messages: CacheActivityMessage[] = []
    const storedResponses = new Map<string, Response>()
    const cache = {
      keys: vi.fn(async () =>
        [...storedResponses.keys()].map((url) => new Request(url)),
      ),
      match: vi.fn(async (request: Request) =>
        storedResponses.get(request.url)?.clone(),
      ),
      put: vi.fn(async (request: Request, response: Response) => {
        storedResponses.set(request.url, response.clone())
      }),
    }
    const cacheStorage = {
      keys: vi.fn(async () => [PUBLIC_STARTPAGE_CACHE]),
      open: vi.fn(async () => cache),
    }
    const fakeSelf = {
      __WB_MANIFEST: [],
      location: { origin: 'https://sui3.example.com' },
      clients: {
        matchAll: vi.fn(async () => [
          {
            postMessage: (message: CacheActivityMessage) =>
              messages.push(message),
          },
        ]),
      },
      addEventListener: (type: string, listener: (event: any) => void) => {
        listeners.set(type, listener)
      },
      skipWaiting: vi.fn(),
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { authenticated: false, categories: [] },
          { headers: { ETag: '"public-v1"' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 304,
          headers: { ETag: '"public-v1"' },
        }),
      )

    vi.stubGlobal('self', fakeSelf)
    vi.stubGlobal('caches', cacheStorage)
    vi.stubGlobal('fetch', fetchMock)
    await import('./sw')

    const request = new Request(
      `https://sui3.example.com${PUBLIC_STARTPAGE_PATH}`,
    )
    const fetchHandler = listeners.get('fetch')!

    const first = dispatchFetch(fetchHandler, request)
    await expect(first.response).resolves.toMatchObject({ status: 200 })
    expect(messages.map(({ kind }) => kind)).toEqual(['fetching', 'fetched'])

    messages.length = 0
    const second = dispatchFetch(fetchHandler, request)
    const staleResponse = await second.response
    await Promise.all(second.backgroundWork)

    expect(staleResponse.status).toBe(200)
    expect(messages.map(({ kind }) => kind)).toEqual([
      'served-stale',
      'revalidating',
      'unchanged',
    ])
    expect(fetchMock.mock.calls[1]?.[0]).toMatchObject({
      headers: expect.any(Headers),
    })
    expect(
      (fetchMock.mock.calls[1]?.[0] as Request).headers.get('If-None-Match'),
    ).toBe('"public-v1"')
    expect(
      messages.every(({ type }) => type === CACHE_ACTIVITY_MESSAGE),
    ).toBe(true)
  })
})

function dispatchFetch(
  handler: (event: any) => void,
  request: Request,
): { response: Promise<Response>; backgroundWork: Promise<unknown>[] } {
  let response: Promise<Response> | undefined
  const backgroundWork: Promise<unknown>[] = []
  handler({
    request,
    respondWith(value: Promise<Response>) {
      response = value
    },
    waitUntil(value: Promise<unknown>) {
      backgroundWork.push(value)
    },
  })
  if (!response) throw new Error('The service worker did not handle the request')
  return { response, backgroundWork }
}
