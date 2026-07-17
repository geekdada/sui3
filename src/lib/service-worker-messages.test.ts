import { describe, expect, it } from 'vitest'
import {
  CACHE_ACTIVITY_MESSAGE,
  CACHE_INSPECT_MESSAGE,
  isCacheActivityMessage,
  isCacheSnapshotResponse,
} from '#/lib/service-worker-messages'

describe('service worker messages', () => {
  it('accepts typed cache activity and rejects unknown activity kinds', () => {
    const activity = {
      type: CACHE_ACTIVITY_MESSAGE,
      id: 'event-1',
      kind: 'served-stale',
      url: '/api/startpage',
      timestamp: 1_730_000_000_000,
      cacheAgeMs: 500,
    }

    expect(isCacheActivityMessage(activity)).toBe(true)
    expect(isCacheActivityMessage({ ...activity, kind: 'private-data' })).toBe(
      false,
    )
  })

  it('validates cache inspection entries before rendering them', () => {
    expect(
      isCacheSnapshotResponse({
        type: CACHE_INSPECT_MESSAGE,
        entries: [
          { cacheName: 'sui3-public-startpage-v1', url: '/api/startpage' },
        ],
      }),
    ).toBe(true)
    expect(
      isCacheSnapshotResponse({
        type: CACHE_INSPECT_MESSAGE,
        entries: [{ cacheName: 'cache-without-url' }],
      }),
    ).toBe(false)
  })
})
