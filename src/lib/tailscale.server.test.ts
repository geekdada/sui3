import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TailscaleCachedService } from '#/lib/tailscale-service'

type IntegrationRow = {
  client_id: string
  client_secret_ciphertext: string
  client_secret_iv: string
  tailnet_dns_name: string
  cached_services_json: string
  last_sync_at: number | null
  last_sync_attempt_at: number | null
  last_sync_error: string | null
  updated_at: number
}

class FakeD1 {
  row: IntegrationRow | null = null

  prepare(sql: string) {
    let values: unknown[] = []
    return {
      bind: (...bound: unknown[]) => {
        values = bound
        return this.statement(sql, () => values)
      },
      first: async () => this.copyRow(),
      run: async () => ({ success: true }),
    }
  }

  private statement(sql: string, values: () => unknown[]) {
    return {
      first: async () => this.copyRow(),
      run: async () => {
        const bound = values()
        if (sql.includes('INSERT INTO tailscale_integration')) {
          this.row = {
            client_id: String(bound[1]),
            client_secret_ciphertext: String(bound[2]),
            client_secret_iv: String(bound[3]),
            tailnet_dns_name: String(bound[4]),
            cached_services_json: String(bound[5]),
            last_sync_at: Number(bound[6]),
            last_sync_attempt_at: Number(bound[7]),
            last_sync_error: null,
            updated_at: Number(bound[8]),
          }
        } else if (sql.includes('SET cached_services_json = ?')) {
          if (!this.row) throw new Error('Missing integration row')
          this.row.cached_services_json = String(bound[0])
          this.row.last_sync_at = Number(bound[1])
          this.row.last_sync_attempt_at = Number(bound[2])
          this.row.last_sync_error = null
        } else if (sql.includes('SET last_sync_attempt_at = ?')) {
          if (!this.row) throw new Error('Missing integration row')
          this.row.last_sync_attempt_at = Number(bound[0])
          this.row.last_sync_error = String(bound[1])
        } else if (sql.includes('DELETE FROM tailscale_integration')) {
          this.row = null
        }
        return { success: true }
      },
    }
  }

  private copyRow() {
    return this.row ? structuredClone(this.row) : null
  }
}

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  nowSeconds: vi.fn(),
  fetchTailscaleServices: vi.fn(),
}))

vi.mock('#/lib/env', () => ({
  getDb: mocks.getDb,
  getCredentialEncryptionKey: () =>
    btoa(String.fromCharCode(...new Uint8Array(32).fill(9))),
}))

vi.mock('#/lib/crypto', () => ({
  nowSeconds: mocks.nowSeconds,
}))

vi.mock('#/lib/icons', () => ({
  getAppIconSvg: () => '<svg />',
  domainFromUrl: (url: string) => new URL(url).hostname,
}))

vi.mock('#/lib/tailscale-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/tailscale-service')>()),
  fetchTailscaleServices: mocks.fetchTailscaleServices,
}))

import {
  deleteTailscaleSettings,
  getTailscaleSettings,
  getTailscaleStartpageCategory,
  saveTailscaleSettings,
} from '#/lib/tailscale.server'

const webService: TailscaleCachedService = {
  id: 'tailscale:svc:web',
  name: 'web',
  url: 'https://web.tail1234.ts.net/',
}

describe('Tailscale integration persistence and cache', () => {
  let db: FakeD1

  beforeEach(() => {
    vi.clearAllMocks()
    db = new FakeD1()
    mocks.getDb.mockReturnValue(db)
    mocks.nowSeconds.mockReturnValue(1_000)
  })

  it('stores encrypted credentials while returning a secret-free summary', async () => {
    mocks.fetchTailscaleServices.mockResolvedValue([webService])

    const summary = await saveTailscaleSettings({
      clientId: 'client-id',
      clientSecret: 'plaintext-client-secret',
      tailnetDnsName: 'tail1234.ts.net',
    })

    expect(summary).toEqual({
      configured: true,
      clientId: 'client-id',
      tailnetDnsName: 'tail1234.ts.net',
      serviceCount: 1,
      lastSyncAt: 1_000,
      lastSyncAttemptAt: 1_000,
      lastSyncError: null,
    })
    expect(JSON.stringify(summary)).not.toContain('plaintext-client-secret')
    expect(JSON.stringify(summary)).not.toContain('ciphertext')
    expect(db.row?.client_secret_ciphertext).not.toContain(
      'plaintext-client-secret',
    )
    expect(db.row?.client_secret_iv).not.toContain('plaintext-client-secret')
  })

  it('replaces settings only after a successful fetch', async () => {
    mocks.fetchTailscaleServices.mockResolvedValueOnce([webService])
    await saveTailscaleSettings({
      clientId: 'original-client',
      clientSecret: 'original-secret',
      tailnetDnsName: 'tail1234.ts.net',
    })
    const originalRow = structuredClone(db.row)

    mocks.fetchTailscaleServices.mockRejectedValueOnce(
      new Error('Tailscale OAuth request failed (401)'),
    )
    await expect(
      saveTailscaleSettings({
        clientId: 'replacement-client',
        clientSecret: 'replacement-secret',
        tailnetDnsName: 'new-tailnet.ts.net',
      }),
    ).rejects.toThrow('Tailscale OAuth request failed (401)')
    expect(db.row).toEqual(originalRow)

    mocks.fetchTailscaleServices.mockResolvedValueOnce([])
    mocks.nowSeconds.mockReturnValue(1_100)
    const replacement = await saveTailscaleSettings({
      clientId: 'replacement-client',
      clientSecret: 'replacement-secret',
      tailnetDnsName: 'new-tailnet.ts.net',
    })
    expect(replacement.clientId).toBe('replacement-client')
    expect(replacement.serviceCount).toBe(0)
    expect(db.row?.tailnet_dns_name).toBe('new-tailnet.ts.net')
  })

  it('uses fresh cache and retains stale or empty last-good results on failure', async () => {
    mocks.fetchTailscaleServices.mockResolvedValueOnce([webService])
    await saveTailscaleSettings({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      tailnetDnsName: 'tail1234.ts.net',
    })
    mocks.fetchTailscaleServices.mockClear()

    mocks.nowSeconds.mockReturnValue(1_299)
    const fresh = await getTailscaleStartpageCategory()
    expect(mocks.fetchTailscaleServices).not.toHaveBeenCalled()
    expect(fresh?.apps.map((app) => app.name)).toEqual(['web'])

    mocks.nowSeconds.mockReturnValue(1_300)
    mocks.fetchTailscaleServices.mockRejectedValueOnce(
      new Error('raw upstream detail that must not persist'),
    )
    const stale = await getTailscaleStartpageCategory()
    expect(stale?.apps.map((app) => app.name)).toEqual(['web'])
    expect(stale?.emptyMessage).toBeUndefined()
    expect(db.row?.last_sync_error).toBe('Tailscale sync failed')

    if (!db.row) throw new Error('Missing integration row')
    db.row.cached_services_json = '[]'
    db.row.last_sync_at = 2_000
    db.row.last_sync_attempt_at = 2_000
    db.row.last_sync_error = null
    mocks.nowSeconds.mockReturnValue(2_300)
    mocks.fetchTailscaleServices.mockRejectedValueOnce(
      new Error('Tailscale API request failed (503)'),
    )
    const emptyLastGood = await getTailscaleStartpageCategory()
    expect(emptyLastGood?.emptyMessage).toBe(
      'No Tailscale services listen on port 80 or 443.',
    )
  })

  it('deletes both the credential and cached services on disconnect', async () => {
    mocks.fetchTailscaleServices.mockResolvedValue([webService])
    await saveTailscaleSettings({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      tailnetDnsName: 'tail1234.ts.net',
    })

    await deleteTailscaleSettings()

    expect(db.row).toBeNull()
    await expect(getTailscaleSettings()).resolves.toEqual({
      configured: false,
      clientId: '',
      tailnetDnsName: '',
      serviceCount: 0,
      lastSyncAt: null,
      lastSyncAttemptAt: null,
      lastSyncError: null,
    })
  })
})
