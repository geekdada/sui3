import { describe, expect, it, vi } from 'vitest'
import {
  fetchTailscaleServices,
  normalizeTailnetDnsName,
  normalizeTailscaleServices,
  shouldRefreshTailscaleCache,
} from '#/lib/tailscale-service'

describe('Tailscale service normalization', () => {
  it('filters web ports, accepts ranges, de-duplicates, and prefers HTTPS', () => {
    const services = normalizeTailscaleServices(
      [
        { name: 'svc:zeta', ports: ['tcp:80'] },
        { name: 'svc:alpha', ports: ['tcp:70-90'] },
        { name: 'svc:zeta', ports: ['tcp:443'] },
        { name: 'svc:secure', ports: ['tcp:400-500'] },
        { name: 'svc:ssh', ports: ['tcp:22'] },
        { name: 'svc:udp-web', ports: ['udp:443'] },
        { name: 'svc:invalid-port', ports: ['tcp:not-a-port'] },
        { name: 'svc:bad/name', ports: ['tcp:443'] },
      ],
      'tail1234.ts.net',
    )

    expect(services).toEqual([
      {
        id: 'tailscale:svc:alpha',
        name: 'alpha',
        url: 'http://alpha.tail1234.ts.net/',
      },
      {
        id: 'tailscale:svc:secure',
        name: 'secure',
        url: 'https://secure.tail1234.ts.net/',
      },
      {
        id: 'tailscale:svc:zeta',
        name: 'zeta',
        url: 'https://zeta.tail1234.ts.net/',
      },
    ])
  })

  it('rejects malformed service payloads', () => {
    expect(() =>
      normalizeTailscaleServices({ services: [] }, 'tail1234.ts.net'),
    ).toThrow('Invalid Tailscale Services response')
    expect(() =>
      normalizeTailscaleServices(
        [{ name: 'svc:web', ports: 'tcp:443' }],
        'tail1234.ts.net',
      ),
    ).toThrow('Invalid Tailscale Services response')
  })

  it('normalizes a plain DNS suffix and rejects URLs, ports, and bad labels', () => {
    expect(normalizeTailnetDnsName(' Tail1234.TS.NET. ')).toBe(
      'tail1234.ts.net',
    )
    expect(() => normalizeTailnetDnsName('https://tail1234.ts.net')).toThrow(
      'hostname',
    )
    expect(() => normalizeTailnetDnsName('tail1234.ts.net:443')).toThrow(
      'hostname',
    )
    expect(() => normalizeTailnetDnsName('-bad.ts.net')).toThrow('hostname')
  })

  it('refreshes successful and failed syncs at the configured interval', () => {
    expect(
      shouldRefreshTailscaleCache(
        { lastSyncAt: 700, lastSyncAttemptAt: 700, lastSyncError: null },
        999,
        300,
      ),
    ).toBe(false)
    expect(
      shouldRefreshTailscaleCache(
        { lastSyncAt: 700, lastSyncAttemptAt: 700, lastSyncError: null },
        1_000,
        300,
      ),
    ).toBe(true)
    expect(
      shouldRefreshTailscaleCache(
        {
          lastSyncAt: 100,
          lastSyncAttemptAt: 900,
          lastSyncError: 'Tailscale request failed',
        },
        1_000,
        300,
      ),
    ).toBe(false)
    expect(
      shouldRefreshTailscaleCache(
        { lastSyncAt: null, lastSyncAttemptAt: null, lastSyncError: null },
        1_000,
        300,
      ),
    ).toBe(true)
  })
})

describe('Tailscale API client', () => {
  it('exchanges OAuth credentials and lists services with bearer auth', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, init })
      if (url.endsWith('/oauth/token')) {
        return new Response(
          JSON.stringify({ access_token: 'short-lived-access-token' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      return new Response(
        JSON.stringify([{ name: 'svc:web', ports: ['tcp:443'] }]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    })

    await expect(
      fetchTailscaleServices({
        clientId: 'client-id',
        clientSecret: 'CaseSensitiveSecret',
        tailnetDnsName: 'tail1234.ts.net',
        fetchImpl,
      }),
    ).resolves.toEqual([
      {
        id: 'tailscale:svc:web',
        name: 'web',
        url: 'https://web.tail1234.ts.net/',
      },
    ])

    expect(requests).toHaveLength(2)
    expect(requests[0]?.url).toBe(
      'https://api.tailscale.com/api/v2/oauth/token',
    )
    const tokenBody = requests[0]?.init?.body
    expect(tokenBody).toBeInstanceOf(URLSearchParams)
    expect(String(tokenBody)).toContain('client_id=client-id')
    expect(String(tokenBody)).toContain('client_secret=CaseSensitiveSecret')
    expect(String(tokenBody)).toContain('scope=all%3Aread')
    expect(requests[1]?.url).toBe(
      'https://api.tailscale.com/api/v2/tailnet/-/services',
    )
    expect(requests[1]?.init?.headers).toEqual({
      Authorization: 'Bearer short-lived-access-token',
      Accept: 'application/json',
    })
  })

  it('returns sanitized HTTP failures without including response bodies', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('raw-body-with-sensitive-details', { status: 401 }),
    )

    const result = fetchTailscaleServices({
      clientId: 'client-id',
      clientSecret: 'secret',
      tailnetDnsName: 'tail1234.ts.net',
      fetchImpl,
    })

    await expect(result).rejects.toThrow('Tailscale OAuth request failed (401)')
    await expect(result).rejects.not.toThrow('raw-body-with-sensitive-details')
  })

  it('returns a sanitized timeout error', async () => {
    const fetchImpl = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'))
          })
        }),
    )

    await expect(
      fetchTailscaleServices({
        clientId: 'client-id',
        clientSecret: 'secret',
        tailnetDnsName: 'tail1234.ts.net',
        fetchImpl,
        timeoutMs: 1,
      }),
    ).rejects.toThrow('Tailscale request timed out')
  })
})
