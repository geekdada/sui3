import { describe, expect, it, vi } from 'vitest'
import {
  clampRefreshRate,
  fetchTrmnlCurrentScreen,
  fetchTrmnlImage,
  fetchTrmnlNextScreen,
  isRefreshDue,
  MIN_REFRESH_ATTEMPT_INTERVAL_SECONDS,
  nextAttemptAllowedAt,
  parseRetryAfter,
  parseTrmnlMode,
  TrmnlRateLimitError,
} from '#/lib/trmnl-service'

describe('TRMNL refresh scheduling', () => {
  it('clamps the refresh rate into a sane window', () => {
    expect(clampRefreshRate(null)).toBe(300)
    expect(clampRefreshRate(undefined)).toBe(300)
    expect(clampRefreshRate(0)).toBe(300)
    expect(clampRefreshRate(Number.NaN)).toBe(300)
    expect(clampRefreshRate(1)).toBe(15)
    expect(clampRefreshRate(300)).toBe(300)
    expect(clampRefreshRate(999_999)).toBe(86_400)
  })

  it('applies the attempt interval and rate-limit backoff', () => {
    expect(
      nextAttemptAllowedAt({ lastAttemptAt: null, retryAfterAt: null }),
    ).toBe(MIN_REFRESH_ATTEMPT_INTERVAL_SECONDS)
    expect(
      nextAttemptAllowedAt({ lastAttemptAt: 1_000, retryAfterAt: null }),
    ).toBe(1_000 + MIN_REFRESH_ATTEMPT_INTERVAL_SECONDS)
    expect(
      nextAttemptAllowedAt({ lastAttemptAt: 1_000, retryAfterAt: 5_000 }),
    ).toBe(5_000)
    expect(
      nextAttemptAllowedAt({ lastAttemptAt: 10_000, retryAfterAt: 5_000 }),
    ).toBe(10_000 + MIN_REFRESH_ATTEMPT_INTERVAL_SECONDS)
  })

  it('is due without an image or after expiry', () => {
    expect(isRefreshDue({ hasImage: false, expiresAt: 999_999 }, 100)).toBe(
      true,
    )
    expect(isRefreshDue({ hasImage: true, expiresAt: null }, 100)).toBe(true)
    expect(isRefreshDue({ hasImage: true, expiresAt: 100 }, 100)).toBe(true)
    expect(isRefreshDue({ hasImage: true, expiresAt: 101 }, 100)).toBe(false)
  })

  it('parses Retry-After seconds and HTTP dates', () => {
    expect(parseRetryAfter(null)).toBeNull()
    expect(parseRetryAfter('60')).toBe(60)
    expect(parseRetryAfter('garbage')).toBeNull()
    const httpDate = new Date(Date.now() + 30_000).toUTCString()
    const parsed = parseRetryAfter(httpDate)
    expect(parsed).not.toBeNull()
    expect(parsed).toBeGreaterThan(0)
    expect(parsed).toBeLessThanOrEqual(31)
  })
})

describe('TRMNL display API client', () => {
  it('fetches the current screen with the device API key', async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe('https://trmnl.com/api/display/current')
        const headers = new Headers(init?.headers)
        expect(headers.get('Access-Token')).toBe('abc-123')
        return new Response(
          JSON.stringify({
            status: 200,
            refresh_rate: 900,
            image_url: 'https://trmnl.com/images/x.png',
            filename: 'x.png',
            rendered_at: '2026-07-29T00:00:00Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      },
    )

    await expect(
      fetchTrmnlCurrentScreen({ apiKey: 'abc-123', fetchImpl }),
    ).resolves.toEqual({
      refreshRate: 900,
      imageUrl: 'https://trmnl.com/images/x.png',
      filename: 'x.png',
      renderedAt: '2026-07-29T00:00:00Z',
    })
  })

  it('fetches the next screen from the device endpoint in device mode', async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe('https://trmnl.com/api/display')
        const headers = new Headers(init?.headers)
        expect(headers.get('Access-Token')).toBe('abc-123')
        // The device endpoint sends no `rendered_at` and adds fields we ignore.
        return new Response(
          JSON.stringify({
            status: 200,
            refresh_rate: 900,
            image_url: 'https://trmnl.com/images/next.png',
            filename: 'next.bmp',
            reset_firmware: false,
            update_firmware: false,
            firmware_url: null,
            special_function: 'identify',
            action: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      },
    )

    await expect(
      fetchTrmnlNextScreen({ apiKey: 'abc-123', fetchImpl }),
    ).resolves.toEqual({
      refreshRate: 900,
      imageUrl: 'https://trmnl.com/images/next.png',
      filename: 'next.bmp',
      renderedAt: null,
    })
  })

  // Both endpoints share one request/response path, so error mapping must match.
  const fetchers = [
    ['current screen', fetchTrmnlCurrentScreen],
    ['next screen', fetchTrmnlNextScreen],
  ] as const

  it.each(fetchers)(
    'maps 429 to a rate-limit error carrying Retry-After (%s)',
    async (_label, fetchScreen) => {
      const fetchImpl = vi.fn(
        async () =>
          new Response('slow down', {
            status: 429,
            headers: { 'Retry-After': '120' },
          }),
      )

      const error = await fetchScreen({
        apiKey: 'abc-123',
        fetchImpl,
      }).catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(TrmnlRateLimitError)
      expect((error as TrmnlRateLimitError).retryAfterSeconds).toBe(120)
      expect((error as TrmnlRateLimitError).message).toBe(
        'TRMNL rate limited the request',
      )
    },
  )

  it.each(fetchers)(
    'rejects bad keys, failures, and invalid payloads with safe messages (%s)',
    async (_label, fetchScreen) => {
      const unauthorized = vi.fn(
        async () => new Response('nope', { status: 401 }),
      )
      await expect(
        fetchScreen({ apiKey: 'bad', fetchImpl: unauthorized }),
      ).rejects.toThrow('TRMNL rejected the device API key')

      const forbidden = vi.fn(async () => new Response('nope', { status: 403 }))
      await expect(
        fetchScreen({ apiKey: 'bad', fetchImpl: forbidden }),
      ).rejects.toThrow('TRMNL rejected the device API key')

      const failing = vi.fn(async () => new Response('nope', { status: 500 }))
      await expect(
        fetchScreen({ apiKey: 'abc-123', fetchImpl: failing }),
      ).rejects.toThrow('TRMNL display request failed (500)')

      const broken = vi.fn(async () => new Response('not json', { status: 200 }))
      await expect(
        fetchScreen({ apiKey: 'abc-123', fetchImpl: broken }),
      ).rejects.toThrow('TRMNL returned an invalid response')

      const unexpectedShape = vi.fn(
        async () =>
          new Response(JSON.stringify({ refresh_rate: 'soon' }), {
            status: 200,
          }),
      )
      await expect(
        fetchScreen({ apiKey: 'abc-123', fetchImpl: unexpectedShape }),
      ).rejects.toThrow('TRMNL returned an invalid response')
    },
  )
})

describe('TRMNL mode parsing', () => {
  it('only accepts the exact "device" literal, defaulting to mirror', () => {
    expect(parseTrmnlMode('device')).toBe('device')
    expect(parseTrmnlMode('mirror')).toBe('mirror')
    expect(parseTrmnlMode('DEVICE')).toBe('mirror')
    expect(parseTrmnlMode('garbage')).toBe('mirror')
    expect(parseTrmnlMode('')).toBe('mirror')
    expect(parseTrmnlMode(null)).toBe('mirror')
    expect(parseTrmnlMode(undefined)).toBe('mirror')
    expect(parseTrmnlMode(1)).toBe('mirror')
  })
})

describe('TRMNL image download', () => {
  it('returns image bytes with a normalized content type', async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer
    const fetchImpl = vi.fn(
      async () =>
        new Response(bytes, {
          status: 200,
          headers: { 'Content-Type': 'image/png; charset=binary' },
        }),
    )

    const result = await fetchTrmnlImage('https://trmnl.com/images/x.png', {
      fetchImpl,
    })

    expect(result.contentType).toBe('image/png')
    expect([...new Uint8Array(result.bytes)]).toEqual([1, 2, 3])
  })

  it('rejects invalid URLs, non-images, empty and oversized downloads', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('<html/>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
    )
    await expect(
      fetchTrmnlImage('https://trmnl.com/x', { fetchImpl }),
    ).rejects.toThrow('TRMNL image download returned a non-image response')
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    await expect(
      fetchTrmnlImage('ftp://trmnl.com/x', { fetchImpl }),
    ).rejects.toThrow('TRMNL image URL is invalid')

    const missing = vi.fn(async () => new Response(null, { status: 404 }))
    await expect(
      fetchTrmnlImage('https://trmnl.com/x.png', { fetchImpl: missing }),
    ).rejects.toThrow('TRMNL image download failed (404)')

    const empty = vi.fn(
      async () =>
        new Response(new ArrayBuffer(0), {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        }),
    )
    await expect(
      fetchTrmnlImage('https://trmnl.com/x.png', { fetchImpl: empty }),
    ).rejects.toThrow('TRMNL image download was empty')

    const oversized = vi.fn(
      async () =>
        new Response(new ArrayBuffer(1024 * 1024 + 1), {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        }),
    )
    await expect(
      fetchTrmnlImage('https://trmnl.com/x.png', { fetchImpl: oversized }),
    ).rejects.toThrow('TRMNL image is too large')
  })
})
