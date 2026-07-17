export const PUBLIC_STARTPAGE_CACHE = 'sui3-public-startpage-v1'
export const CACHE_ACTIVITY_MESSAGE = 'sui3:cache-activity'
export const CACHE_INSPECT_MESSAGE = 'sui3:cache-inspect'
export const SKIP_WAITING_MESSAGE = 'sui3:skip-waiting'

export type CacheActivityKind =
  | 'fetching'
  | 'fetched'
  | 'served-stale'
  | 'revalidating'
  | 'updated'
  | 'unchanged'
  | 'failed'

const cacheActivityKinds = new Set<CacheActivityKind>([
  'fetching',
  'fetched',
  'served-stale',
  'revalidating',
  'updated',
  'unchanged',
  'failed',
])

export type CacheActivityMessage = {
  type: typeof CACHE_ACTIVITY_MESSAGE
  id: string
  kind: CacheActivityKind
  url: string
  timestamp: number
  status?: number
  durationMs?: number
  cacheAgeMs?: number
}

export type CacheSnapshotEntry = {
  cacheName: string
  url: string
}

export type CacheSnapshotResponse = {
  type: typeof CACHE_INSPECT_MESSAGE
  entries: CacheSnapshotEntry[]
}

export function isCacheActivityMessage(
  value: unknown,
): value is CacheActivityMessage {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    record.type === CACHE_ACTIVITY_MESSAGE &&
    typeof record.id === 'string' &&
    typeof record.kind === 'string' &&
    cacheActivityKinds.has(record.kind as CacheActivityKind) &&
    typeof record.url === 'string' &&
    typeof record.timestamp === 'number'
  )
}

export function isCacheSnapshotResponse(
  value: unknown,
): value is CacheSnapshotResponse {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    record.type === CACHE_INSPECT_MESSAGE &&
    Array.isArray(record.entries) &&
    record.entries.every((entry) => {
      if (!entry || typeof entry !== 'object') return false
      const candidate = entry as Record<string, unknown>
      return (
        typeof candidate.cacheName === 'string' &&
        typeof candidate.url === 'string'
      )
    })
  )
}
