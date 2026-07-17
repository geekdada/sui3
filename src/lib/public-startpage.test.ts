import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PUBLIC_STARTPAGE_PATH,
  createPublicStartpageResponse,
  fetchPublicStartpageData,
} from '#/lib/public-startpage'
import type { StartpageData } from '#/lib/types'

const data: StartpageData = {
  authenticated: false,
  categories: [],
}

describe('public startpage transport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns cache-revalidatable public JSON with a stable ETag', async () => {
    const request = new Request(`https://sui3.example.com${PUBLIC_STARTPAGE_PATH}`)
    const first = await createPublicStartpageResponse(data, request)
    const etag = first.headers.get('ETag')

    expect(first.status).toBe(200)
    expect(first.headers.get('Cache-Control')).toBe(
      'public, max-age=0, must-revalidate',
    )
    expect(etag).toMatch(/^"[a-f0-9]{64}"$/)
    await expect(first.json()).resolves.toEqual(data)

    const conditional = await createPublicStartpageResponse(
      data,
      new Request(request, { headers: { 'If-None-Match': etag! } }),
    )
    expect(conditional.status).toBe(304)
    expect(await conditional.text()).toBe('')
  })

  it('fetches only the stable public endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(data))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchPublicStartpageData()).resolves.toEqual(data)
    expect(fetchMock).toHaveBeenCalledWith(PUBLIC_STARTPAGE_PATH, {
      headers: { Accept: 'application/json' },
      signal: undefined,
    })
  })

  it('surfaces public endpoint failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    )

    await expect(fetchPublicStartpageData()).rejects.toThrow(
      'Unable to load the public startpage (503)',
    )
  })
})
