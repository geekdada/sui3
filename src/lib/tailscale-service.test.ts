import { describe, expect, it, vi } from 'vitest'
import {
  discoverTailnetDnsName,
  fetchTailscaleServicesSnapshot,
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

  it('discovers the DNS suffix from an internal device FQDN', () => {
    expect(
      discoverTailnetDnsName({
        devices: [
          {
            name: 'shared.other-tailnet.ts.net',
            isExternal: true,
          },
          {
            name: 'server.Tail1234.TS.NET.',
            isExternal: false,
          },
        ],
      }),
    ).toBe('tail1234.ts.net')
  })

  it('rejects malformed device lists and ambiguous internal suffixes', () => {
    expect(() => discoverTailnetDnsName({ devices: 'invalid' })).toThrow(
      'Invalid Tailscale Devices response',
    )
    expect(() =>
      discoverTailnetDnsName({
        devices: [{ name: 'shared.other.ts.net', isExternal: true }],
      }),
    ).toThrow('Unable to determine Tailscale tailnet DNS name')
    expect(() =>
      discoverTailnetDnsName({
        devices: [
          { name: 'one.first.ts.net', isExternal: false },
          { name: 'two.second.ts.net', isExternal: false },
        ],
      }),
    ).toThrow('Unable to determine Tailscale tailnet DNS name')
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
  it('accepts the official vipServices list response', async () => {
    const requests: string[] = []
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      requests.push(url)
      if (url.endsWith('/oauth/token')) {
        return Response.json({ access_token: 'short-lived-access-token' })
      }
      if (url.endsWith('/devices')) {
        return Response.json({
          devices: [
            {
              name: 'server.tail1234.ts.net',
              hostname: 'server',
              isExternal: false,
            },
          ],
        })
      }
      return Response.json({
        vipServices: [
          {
            name: 'svc:web',
            addrs: ['100.64.0.1'],
            ports: ['tcp:443'],
            tags: ['tag:web'],
          },
        ],
      })
    })

    await expect(
      fetchTailscaleServicesSnapshot({
        clientId: 'client-id',
        clientSecret: 'secret',
        fetchImpl,
      }),
    ).resolves.toEqual({
      tailnetDnsName: 'tail1234.ts.net',
      services: [
        {
          id: 'tailscale:svc:web',
          name: 'web',
          url: 'https://web.tail1234.ts.net/',
        },
      ],
    })
    expect(requests).toContain(
      'https://api.tailscale.com/api/v2/tailnet/-/vip-services',
    )
    expect(requests).toContain(
      'https://api.tailscale.com/api/v2/tailnet/-/devices',
    )
  })

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
      if (url.endsWith('/devices')) {
        return Response.json({
          devices: [
            {
              name: 'server.tail1234.ts.net',
              isExternal: false,
            },
          ],
        })
      }
      return new Response(
        JSON.stringify({
          vipServices: [{ name: 'svc:web', ports: ['tcp:443'] }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    })

    await expect(
      fetchTailscaleServicesSnapshot({
        clientId: 'client-id',
        clientSecret: 'CaseSensitiveSecret',
        fetchImpl,
      }),
    ).resolves.toEqual({
      tailnetDnsName: 'tail1234.ts.net',
      services: [
        {
          id: 'tailscale:svc:web',
          name: 'web',
          url: 'https://web.tail1234.ts.net/',
        },
      ],
    })

    expect(requests).toHaveLength(3)
    expect(requests[0]?.url).toBe(
      'https://api.tailscale.com/api/v2/oauth/token',
    )
    const tokenBody = requests[0]?.init?.body
    expect(tokenBody).toBeInstanceOf(URLSearchParams)
    expect(String(tokenBody)).toContain('client_id=client-id')
    expect(String(tokenBody)).toContain('client_secret=CaseSensitiveSecret')
    expect(String(tokenBody)).toContain('scope=all%3Aread')
    expect(requests.slice(1).map((request) => request.url)).toEqual([
      'https://api.tailscale.com/api/v2/tailnet/-/vip-services',
      'https://api.tailscale.com/api/v2/tailnet/-/devices',
    ])
    for (const request of requests.slice(1)) {
      expect(request.init?.headers).toEqual({
        Authorization: 'Bearer short-lived-access-token',
        Accept: 'application/json',
      })
    }
  })

  it('uses a validated manual DNS fallback when device discovery fails', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/oauth/token')) {
        return Response.json({ access_token: 'short-lived-access-token' })
      }
      if (url.endsWith('/devices')) {
        return new Response('raw-device-error', { status: 503 })
      }
      return Response.json({
        vipServices: [{ name: 'svc:web', ports: ['tcp:443'] }],
      })
    })

    await expect(
      fetchTailscaleServicesSnapshot({
        clientId: 'client-id',
        clientSecret: 'secret',
        tailnetDnsNameFallback: ' Manual-Tailnet.TS.NET. ',
        fetchImpl,
      }),
    ).resolves.toEqual({
      tailnetDnsName: 'manual-tailnet.ts.net',
      services: [
        {
          id: 'tailscale:svc:web',
          name: 'web',
          url: 'https://web.manual-tailnet.ts.net/',
        },
      ],
    })
  })

  it('classifies device discovery failures for the manual fallback UI', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/oauth/token')) {
        return Response.json({ access_token: 'short-lived-access-token' })
      }
      if (url.endsWith('/devices')) {
        return new Response(null, { status: 503 })
      }
      return Response.json({ vipServices: [] })
    })

    await expect(
      fetchTailscaleServicesSnapshot({
        clientId: 'client-id',
        clientSecret: 'secret',
        fetchImpl,
      }),
    ).rejects.toThrow(
      'TAILNET_DNS_DISCOVERY_FAILED: Tailscale Devices request failed (503)',
    )
  })

  it('returns sanitized HTTP failures without including response bodies', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('raw-body-with-sensitive-details', { status: 401 }),
    )

    const result = fetchTailscaleServicesSnapshot({
      clientId: 'client-id',
      clientSecret: 'secret',
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
      fetchTailscaleServicesSnapshot({
        clientId: 'client-id',
        clientSecret: 'secret',
        fetchImpl,
        timeoutMs: 1,
      }),
    ).rejects.toThrow('Tailscale request timed out')
  })
})
