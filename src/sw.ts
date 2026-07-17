/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { PUBLIC_STARTPAGE_PATH } from '#/lib/public-startpage'
import {
  CACHE_ACTIVITY_MESSAGE,
  CACHE_INSPECT_MESSAGE,
  PUBLIC_STARTPAGE_CACHE,
  SKIP_WAITING_MESSAGE,
  type CacheActivityKind,
  type CacheActivityMessage,
  type CacheSnapshotEntry,
  type CacheSnapshotResponse,
} from '#/lib/service-worker-messages'

declare let self: ServiceWorkerGlobalScope

const CACHED_AT_HEADER = 'X-SUI3-Cached-At'

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
clientsClaim()

function publicUrl(request: Request): string {
  const url = new URL(request.url)
  return `${url.pathname}${url.search}`
}

async function broadcastActivity(
  request: Request,
  kind: CacheActivityKind,
  details: Pick<
    CacheActivityMessage,
    'status' | 'durationMs' | 'cacheAgeMs'
  > = {},
) {
  const message: CacheActivityMessage = {
    type: CACHE_ACTIVITY_MESSAGE,
    id: crypto.randomUUID(),
    kind,
    url: publicUrl(request),
    timestamp: Date.now(),
    ...details,
  }
  const clients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  })
  for (const client of clients) client.postMessage(message)
}

function isCacheablePublicResponse(response: Response): boolean {
  return (
    response.status === 200 &&
    response.headers.get('Content-Type')?.startsWith('application/json') ===
      true
  )
}

function withCachedAt(response: Response, cachedAt: number): Response {
  const headers = new Headers(response.headers)
  headers.set(CACHED_AT_HEADER, String(cachedAt))
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

async function revalidatePublicStartpage(
  request: Request,
  cached: Response | undefined,
): Promise<Response> {
  const startedAt = performance.now()
  await broadcastActivity(request, cached ? 'revalidating' : 'fetching')

  const headers = new Headers(request.headers)
  const cachedEtag = cached?.headers.get('ETag')
  if (cachedEtag) headers.set('If-None-Match', cachedEtag)

  try {
    const response = await fetch(
      new Request(request, { cache: 'no-store', headers }),
    )
    const durationMs = Math.round(performance.now() - startedAt)

    if (response.status === 304 && cached) {
      await broadcastActivity(request, 'unchanged', {
        status: response.status,
        durationMs,
      })
      return cached
    }

    if (!isCacheablePublicResponse(response)) {
      throw new Error(`Public startpage returned ${response.status}`)
    }

    const stored = withCachedAt(response.clone(), Date.now())
    const cache = await caches.open(PUBLIC_STARTPAGE_CACHE)
    await cache.put(request, stored.clone())

    const nextEtag = stored.headers.get('ETag')
    const kind = cached
      ? cachedEtag !== nextEtag
        ? 'updated'
        : 'unchanged'
      : 'fetched'
    await broadcastActivity(request, kind, {
      status: response.status,
      durationMs,
    })
    return stored
  } catch (error) {
    await broadcastActivity(request, 'failed', {
      durationMs: Math.round(performance.now() - startedAt),
    })
    if (cached) return cached
    throw error
  }
}

async function handlePublicStartpage(
  event: FetchEvent,
  request: Request,
): Promise<Response> {
  const cache = await caches.open(PUBLIC_STARTPAGE_CACHE)
  const cached = await cache.match(request)

  if (!cached) return revalidatePublicStartpage(request, undefined)

  const cachedAt = Number(cached.headers.get(CACHED_AT_HEADER))
  await broadcastActivity(request, 'served-stale', {
    cacheAgeMs: Number.isFinite(cachedAt) ? Date.now() - cachedAt : undefined,
  })
  event.waitUntil(revalidatePublicStartpage(request, cached))
  return cached
}

async function inspectCaches(): Promise<CacheSnapshotEntry[]> {
  const cacheNames = await caches.keys()
  const ownedCacheNames = cacheNames.filter(
    (name) =>
      name === PUBLIC_STARTPAGE_CACHE || name.startsWith('workbox-precache'),
  )
  const entries = await Promise.all(
    ownedCacheNames.map(async (cacheName) => {
      const cache = await caches.open(cacheName)
      const requests = await cache.keys()
      return requests.map((request) => ({
        cacheName,
        url: publicUrl(request),
      }))
    }),
  )
  return entries.flat().slice(0, 100)
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (
    event.request.method === 'GET' &&
    url.origin === self.location.origin &&
    url.pathname === PUBLIC_STARTPAGE_PATH
  ) {
    event.respondWith(handlePublicStartpage(event, event.request))
  }
})

self.addEventListener('message', (event) => {
  if (event.data?.type === SKIP_WAITING_MESSAGE) {
    void self.skipWaiting()
    return
  }

  if (event.data?.type === CACHE_INSPECT_MESSAGE && event.ports[0]) {
    const port = event.ports[0]
    event.waitUntil(
      inspectCaches().then((entries) => {
        const response: CacheSnapshotResponse = {
          type: CACHE_INSPECT_MESSAGE,
          entries,
        }
        port.postMessage(response)
      }),
    )
  }
})
