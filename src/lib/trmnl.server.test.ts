import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type IntegrationRow = {
  device_key_ciphertext: string
  device_key_iv: string
  mode: string | null
  image: number[] | null
  image_content_type: string | null
  image_filename: string | null
  image_url: string | null
  rendered_at: string | null
  refresh_rate: number | null
  fetched_at: number | null
  expires_at: number | null
  last_attempt_at: number | null
  retry_after_at: number | null
  last_error: string | null
  updated_at: number
}

/** D1 converts written BLOBs with `Array.from`, so reads never return the
 * original `ArrayBuffer`. The fake mirrors that to keep the tests honest. */
function storedBlob(value: unknown): number[] | null {
  if (value === null || value === undefined) return null
  if (value instanceof ArrayBuffer) return [...new Uint8Array(value)]
  if (ArrayBuffer.isView(value)) {
    return [...new Uint8Array(value.buffer, value.byteOffset, value.byteLength)]
  }
  if (Array.isArray(value)) return [...(value as number[])]
  throw new Error('Unsupported BLOB value')
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
        if (sql.includes('INSERT INTO trmnl_integration')) {
          this.row = {
            device_key_ciphertext: String(bound[1]),
            device_key_iv: String(bound[2]),
            image: storedBlob(bound[3]),
            image_content_type: (bound[4] as string | null) ?? null,
            image_filename: (bound[5] as string | null) ?? null,
            image_url: (bound[6] as string | null) ?? null,
            rendered_at: (bound[7] as string | null) ?? null,
            refresh_rate: (bound[8] as number | null) ?? null,
            fetched_at: (bound[9] as number | null) ?? null,
            expires_at: (bound[10] as number | null) ?? null,
            last_attempt_at: (bound[11] as number | null) ?? null,
            retry_after_at: null,
            last_error: (bound[12] as string | null) ?? null,
            updated_at: Number(bound[13]),
            // `mode` is bound last so the indices above stay stable.
            mode: (bound[14] as string | null) ?? null,
          }
        } else if (sql.includes('SET image = ?')) {
          if (!this.row) throw new Error('Missing integration row')
          this.row.image = storedBlob(bound[0])
          this.row.image_content_type = String(bound[1])
          this.row.image_filename = (bound[2] as string | null) ?? null
          this.row.image_url = (bound[3] as string | null) ?? null
          this.row.rendered_at = (bound[4] as string | null) ?? null
          this.row.refresh_rate = Number(bound[5])
          this.row.fetched_at = Number(bound[6])
          this.row.expires_at = Number(bound[7])
          this.row.retry_after_at = null
          this.row.last_error = null
          this.row.updated_at = Number(bound[8])
        } else if (sql.includes('SET last_error = ?')) {
          if (!this.row) throw new Error('Missing integration row')
          this.row.last_error = String(bound[0])
          this.row.retry_after_at = (bound[1] as number | null) ?? null
          this.row.updated_at = Number(bound[2])
        } else if (sql.includes('SET last_attempt_at = ?')) {
          if (!this.row) throw new Error('Missing integration row')
          this.row.last_attempt_at = Number(bound[0])
        } else if (sql.includes('DELETE FROM trmnl_integration')) {
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
  fetchTrmnlCurrentScreen: vi.fn(),
  fetchTrmnlNextScreen: vi.fn(),
  fetchTrmnlImage: vi.fn(),
  backgroundTasks: [] as Promise<unknown>[],
}))

vi.mock('#/lib/env', () => ({
  getDb: mocks.getDb,
  getCredentialEncryptionKey: () =>
    btoa(String.fromCharCode(...new Uint8Array(32).fill(9))),
}))

vi.mock('#/lib/crypto', () => ({
  nowSeconds: mocks.nowSeconds,
}))

vi.mock('#/lib/background', () => ({
  runInBackground: (task: Promise<unknown>) => {
    mocks.backgroundTasks.push(task)
    // Avoid unhandled rejections; tests await the tasks they care about.
    task.catch(() => {})
  },
}))

vi.mock('#/lib/trmnl-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/trmnl-service')>()),
  fetchTrmnlCurrentScreen: mocks.fetchTrmnlCurrentScreen,
  fetchTrmnlNextScreen: mocks.fetchTrmnlNextScreen,
  fetchTrmnlImage: mocks.fetchTrmnlImage,
}))

import {
  deleteTrmnlSettings,
  forceRefreshTrmnlImage,
  getTrmnlDisplayState,
  getTrmnlImagePayload,
  getTrmnlSettings,
  saveTrmnlSettings,
} from '#/lib/trmnl.server'
import { TrmnlRateLimitError } from '#/lib/trmnl-service'

const screen = {
  refreshRate: 300,
  imageUrl: 'https://trmnl.com/images/a.png',
  filename: 'a.png',
  renderedAt: '2026-07-29T00:00:00Z',
}
const imagePayload = {
  bytes: new Uint8Array([1, 2, 3, 4]).buffer,
  contentType: 'image/png',
}

function bytesOf(
  value: ArrayBuffer | ArrayBufferView | number[] | null | undefined,
): number[] {
  return storedBlob(value) ?? []
}

describe('TRMNL integration persistence and background refresh', () => {
  let db: FakeD1

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.backgroundTasks.length = 0
    db = new FakeD1()
    mocks.getDb.mockReturnValue(db)
    mocks.nowSeconds.mockReturnValue(1_000)
    mocks.fetchTrmnlCurrentScreen.mockReset()
    mocks.fetchTrmnlNextScreen.mockReset()
    mocks.fetchTrmnlImage.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function seedConfigured(
    now = 1_000,
    mode: 'mirror' | 'device' = 'mirror',
  ) {
    mocks.nowSeconds.mockReturnValue(now)
    mocks.fetchTrmnlCurrentScreen.mockResolvedValueOnce(screen)
    mocks.fetchTrmnlImage.mockResolvedValueOnce(imagePayload)
    await saveTrmnlSettings({ deviceApiKey: 'device-key', mode })
    mocks.fetchTrmnlCurrentScreen.mockReset()
    mocks.fetchTrmnlNextScreen.mockReset()
    mocks.fetchTrmnlImage.mockReset()
  }

  it('stores the encrypted key and the first image on save', async () => {
    mocks.fetchTrmnlCurrentScreen.mockResolvedValueOnce(screen)
    mocks.fetchTrmnlImage.mockResolvedValueOnce(imagePayload)

    const summary = await saveTrmnlSettings({ deviceApiKey: 'device-key' })

    expect(mocks.fetchTrmnlCurrentScreen).toHaveBeenCalledWith({
      apiKey: 'device-key',
    })
    expect(summary).toEqual({
      configured: true,
      mode: 'mirror',
      hasImage: true,
      refreshRate: 300,
      fetchedAt: 1_000,
      expiresAt: 1_300,
      lastError: null,
    })
    expect(JSON.stringify(summary)).not.toContain('device-key')
    expect(db.row?.device_key_ciphertext).not.toContain('device-key')
    expect(db.row?.device_key_iv).not.toContain('device-key')
    expect(bytesOf(db.row?.image)).toEqual([1, 2, 3, 4])
    expect(db.row?.image_content_type).toBe('image/png')
  })

  it('rejects invalid keys without storing anything', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.fetchTrmnlCurrentScreen.mockRejectedValueOnce(
      new Error('TRMNL rejected the device API key'),
    )
    await expect(
      saveTrmnlSettings({ deviceApiKey: 'bad-key' }),
    ).rejects.toThrow('TRMNL rejected the device API key')
    expect(db.row).toBeNull()

    mocks.fetchTrmnlCurrentScreen.mockRejectedValueOnce(
      new Error('socket exploded with upstream detail'),
    )
    await expect(
      saveTrmnlSettings({ deviceApiKey: 'bad-key' }),
    ).rejects.toThrow('TRMNL refresh failed')
    expect(db.row).toBeNull()
    const logged = consoleError.mock.calls.flat().join(' ')
    expect(logged).not.toContain('socket exploded')
  })

  it('keeps the stored key when saving with a blank field', async () => {
    await seedConfigured()

    mocks.fetchTrmnlCurrentScreen.mockResolvedValueOnce(screen)
    mocks.fetchTrmnlImage.mockResolvedValueOnce(imagePayload)
    mocks.nowSeconds.mockReturnValue(1_100)

    const summary = await saveTrmnlSettings({ deviceApiKey: '' })

    expect(mocks.fetchTrmnlCurrentScreen).toHaveBeenCalledWith({
      apiKey: 'device-key',
    })
    expect(summary.fetchedAt).toBe(1_100)
  })

  it('saves credentials even when the first image download fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.fetchTrmnlCurrentScreen.mockResolvedValueOnce(screen)
    mocks.fetchTrmnlImage.mockRejectedValueOnce(
      new Error('TRMNL image download failed (404)'),
    )

    const summary = await saveTrmnlSettings({ deviceApiKey: 'device-key' })

    expect(summary.configured).toBe(true)
    expect(summary.hasImage).toBe(false)
    expect(summary.refreshRate).toBe(300)
    expect(summary.lastError).toBe('TRMNL image download failed (404)')
    expect(db.row?.fetched_at).toBeNull()
    expect(db.row?.expires_at).toBeNull()

    // The widget sees the missing image as overdue and schedules a fetch once
    // the attempt window opened by the save has passed.
    mocks.nowSeconds.mockReturnValue(1_031)
    mocks.fetchTrmnlCurrentScreen.mockResolvedValueOnce(screen)
    mocks.fetchTrmnlImage.mockResolvedValueOnce(imagePayload)
    const state = await getTrmnlDisplayState()
    expect(state.expired).toBe(true)
    expect(mocks.backgroundTasks).toHaveLength(1)
    await mocks.backgroundTasks[0]
    expect(db.row?.fetched_at).toBe(1_031)
  })

  it('returns an unconfigured state without a stored row', async () => {
    await expect(getTrmnlDisplayState()).resolves.toEqual({
      configured: false,
      hasImage: false,
      fetchedAt: null,
      expiresAt: null,
      expired: false,
    })
    await expect(getTrmnlImagePayload()).resolves.toBeNull()
    await expect(forceRefreshTrmnlImage()).rejects.toThrow(
      'TRMNL is not configured',
    )
    expect(mocks.backgroundTasks).toHaveLength(0)
  })

  it('serves fresh images without touching the network', async () => {
    await seedConfigured()

    mocks.nowSeconds.mockReturnValue(1_200)
    const state = await getTrmnlDisplayState()
    expect(state).toEqual({
      configured: true,
      hasImage: true,
      fetchedAt: 1_000,
      expiresAt: 1_300,
      expired: false,
    })
    expect(mocks.backgroundTasks).toHaveLength(0)
    expect(mocks.fetchTrmnlCurrentScreen).not.toHaveBeenCalled()

    const payload = await getTrmnlImagePayload()
    if (!payload) throw new Error('Missing image payload')
    // Must stay a BufferSource; a plain array would serialize as text.
    expect(payload.bytes).toBeInstanceOf(ArrayBuffer)
    expect(bytesOf(payload.bytes)).toEqual([1, 2, 3, 4])
    expect(payload.contentType).toBe('image/png')
    expect(payload.fetchedAt).toBe(1_000)
    expect(payload.expiresAt).toBe(1_300)
    expect(mocks.backgroundTasks).toHaveLength(0)
  })

  it('refreshes an overdue image in the background without blocking', async () => {
    await seedConfigured()

    mocks.nowSeconds.mockReturnValue(1_400)
    const nextScreen = {
      ...screen,
      imageUrl: 'https://trmnl.com/images/b.png',
      filename: 'b.png',
    }
    mocks.fetchTrmnlCurrentScreen.mockResolvedValueOnce(nextScreen)
    mocks.fetchTrmnlImage.mockResolvedValueOnce({
      bytes: new Uint8Array([9, 9]).buffer,
      contentType: 'image/bmp',
    })

    const state = await getTrmnlDisplayState()
    expect(state.expired).toBe(true)
    expect(state.fetchedAt).toBe(1_000)
    expect(mocks.backgroundTasks).toHaveLength(1)

    // The stale image is served while the refresh runs, and the attempt
    // claimed above dedupes this second trigger.
    const stale = await getTrmnlImagePayload()
    if (!stale) throw new Error('Missing image payload')
    expect(bytesOf(stale.bytes)).toEqual([1, 2, 3, 4])
    expect(mocks.backgroundTasks).toHaveLength(1)

    await mocks.backgroundTasks[0]
    expect(bytesOf(db.row?.image)).toEqual([9, 9])
    expect(db.row?.image_content_type).toBe('image/bmp')
    expect(db.row?.image_filename).toBe('b.png')
    expect(db.row?.fetched_at).toBe(1_400)
    expect(db.row?.expires_at).toBe(1_700)
    expect(db.row?.last_error).toBeNull()

    mocks.nowSeconds.mockReturnValue(1_600)
    const fresh = await getTrmnlDisplayState()
    expect(fresh.expired).toBe(false)
    expect(fresh.fetchedAt).toBe(1_400)
    expect(mocks.backgroundTasks).toHaveLength(1)
  })

  it('backs off after rate limiting and keeps the stale image', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await seedConfigured()

    mocks.nowSeconds.mockReturnValue(1_400)
    mocks.fetchTrmnlCurrentScreen.mockRejectedValueOnce(
      new TrmnlRateLimitError(120),
    )
    await getTrmnlDisplayState()
    expect(mocks.backgroundTasks).toHaveLength(1)
    await expect(mocks.backgroundTasks[0]).rejects.toThrow(
      'TRMNL rate limited the request',
    )
    expect(db.row?.last_error).toBe('TRMNL rate limited the request')
    expect(db.row?.retry_after_at).toBe(1_520)
    expect(bytesOf(db.row?.image)).toEqual([1, 2, 3, 4])

    // Still inside the backoff window: no new upstream attempt.
    mocks.fetchTrmnlCurrentScreen.mockClear()
    mocks.nowSeconds.mockReturnValue(1_519)
    const blocked = await getTrmnlDisplayState()
    expect(blocked.expired).toBe(true)
    expect(mocks.backgroundTasks).toHaveLength(1)
    expect(mocks.fetchTrmnlCurrentScreen).not.toHaveBeenCalled()

    // Backoff elapsed: the next trigger refreshes and clears the error.
    mocks.nowSeconds.mockReturnValue(1_520)
    mocks.fetchTrmnlCurrentScreen.mockResolvedValueOnce(screen)
    mocks.fetchTrmnlImage.mockResolvedValueOnce(imagePayload)
    await getTrmnlDisplayState()
    expect(mocks.backgroundTasks).toHaveLength(2)
    await mocks.backgroundTasks[1]
    expect(db.row?.last_error).toBeNull()
    expect(db.row?.retry_after_at).toBeNull()
    expect(db.row?.fetched_at).toBe(1_520)
  })

  it('sanitizes unexpected refresh errors', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    await seedConfigured()

    mocks.nowSeconds.mockReturnValue(1_400)
    mocks.fetchTrmnlCurrentScreen.mockRejectedValueOnce(
      new Error('raw upstream detail that must not persist'),
    )
    await getTrmnlDisplayState()
    await expect(mocks.backgroundTasks[0]).rejects.toThrow(
      'TRMNL refresh failed',
    )
    expect(db.row?.last_error).toBe('TRMNL refresh failed')
    expect(db.row?.retry_after_at).toBeNull()
    const logged = consoleError.mock.calls.flat().join(' ')
    expect(logged).toContain('[trmnl] Image refresh failed: TRMNL refresh failed')
    expect(logged).not.toContain('raw upstream detail')
  })

  it('force refresh bypasses the dedup window and surfaces errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await seedConfigured()

    mocks.nowSeconds.mockReturnValue(1_010)
    mocks.fetchTrmnlCurrentScreen.mockResolvedValueOnce({
      ...screen,
      filename: 'c.png',
    })
    mocks.fetchTrmnlImage.mockResolvedValueOnce(imagePayload)
    const summary = await forceRefreshTrmnlImage()
    expect(summary.fetchedAt).toBe(1_010)
    expect(db.row?.image_filename).toBe('c.png')
    expect(mocks.backgroundTasks).toHaveLength(0)

    mocks.fetchTrmnlCurrentScreen.mockRejectedValueOnce(
      new Error('TRMNL request timed out'),
    )
    await expect(forceRefreshTrmnlImage()).rejects.toThrow(
      'TRMNL request timed out',
    )
    expect(db.row?.last_error).toBe('TRMNL request timed out')
    expect(db.row?.image_filename).toBe('c.png')
  })

  it('deletes the credential and cached image on disconnect', async () => {
    await seedConfigured()

    await deleteTrmnlSettings()

    expect(db.row).toBeNull()
    await expect(getTrmnlSettings()).resolves.toEqual({
      configured: false,
      mode: null,
      hasImage: false,
      refreshRate: null,
      fetchedAt: null,
      expiresAt: null,
      lastError: null,
    })
  })

  describe('running modes', () => {
    it('defaults to mirror mode when no mode is supplied', async () => {
      mocks.fetchTrmnlCurrentScreen.mockResolvedValueOnce(screen)
      mocks.fetchTrmnlImage.mockResolvedValueOnce(imagePayload)

      const summary = await saveTrmnlSettings({ deviceApiKey: 'device-key' })

      expect(summary.mode).toBe('mirror')
      expect(db.row?.mode).toBe('mirror')
    })

    it('validates through the non-advancing endpoint even in device mode', async () => {
      mocks.fetchTrmnlCurrentScreen.mockResolvedValueOnce(screen)
      mocks.fetchTrmnlImage.mockResolvedValueOnce(imagePayload)

      const summary = await saveTrmnlSettings({
        deviceApiKey: 'device-key',
        mode: 'device',
      })

      expect(summary.mode).toBe('device')
      expect(db.row?.mode).toBe('device')
      expect(mocks.fetchTrmnlCurrentScreen).toHaveBeenCalledWith({
        apiKey: 'device-key',
      })
      // Saving must never burn a playlist slot, however often it is pressed.
      expect(mocks.fetchTrmnlNextScreen).not.toHaveBeenCalled()
      expect(JSON.stringify(summary)).not.toContain('device-key')
    })

    it('preserves the stored mode when saving without one', async () => {
      await seedConfigured(1_000, 'device')

      mocks.fetchTrmnlCurrentScreen.mockResolvedValueOnce(screen)
      mocks.fetchTrmnlImage.mockResolvedValueOnce(imagePayload)
      mocks.nowSeconds.mockReturnValue(1_100)

      const summary = await saveTrmnlSettings({ deviceApiKey: '' })

      expect(summary.mode).toBe('device')
      expect(db.row?.mode).toBe('device')
    })

    it('refreshes a device-mode row from the next-screen endpoint', async () => {
      await seedConfigured(1_000, 'device')

      mocks.nowSeconds.mockReturnValue(1_400)
      mocks.fetchTrmnlNextScreen.mockResolvedValueOnce({
        ...screen,
        imageUrl: 'https://trmnl.com/images/next.png',
        filename: 'next.bmp',
        renderedAt: null,
      })
      mocks.fetchTrmnlImage.mockResolvedValueOnce({
        bytes: new Uint8Array([7, 7]).buffer,
        contentType: 'image/bmp',
      })

      await getTrmnlDisplayState()
      expect(mocks.backgroundTasks).toHaveLength(1)
      await mocks.backgroundTasks[0]

      expect(mocks.fetchTrmnlNextScreen).toHaveBeenCalledWith({
        apiKey: 'device-key',
      })
      expect(mocks.fetchTrmnlCurrentScreen).not.toHaveBeenCalled()
      expect(bytesOf(db.row?.image)).toEqual([7, 7])
      expect(db.row?.image_filename).toBe('next.bmp')
      expect(db.row?.rendered_at).toBeNull()
      expect(db.row?.fetched_at).toBe(1_400)
    })

    it('refreshes a mirror-mode row from the current-screen endpoint', async () => {
      await seedConfigured(1_000, 'mirror')

      mocks.nowSeconds.mockReturnValue(1_400)
      mocks.fetchTrmnlCurrentScreen.mockResolvedValueOnce(screen)
      mocks.fetchTrmnlImage.mockResolvedValueOnce(imagePayload)

      await getTrmnlDisplayState()
      await mocks.backgroundTasks[0]

      expect(mocks.fetchTrmnlCurrentScreen).toHaveBeenCalledWith({
        apiKey: 'device-key',
      })
      expect(mocks.fetchTrmnlNextScreen).not.toHaveBeenCalled()
    })

    it('advances the playlist on a device-mode force refresh', async () => {
      await seedConfigured(1_000, 'device')

      mocks.nowSeconds.mockReturnValue(1_010)
      mocks.fetchTrmnlNextScreen.mockResolvedValueOnce({
        ...screen,
        filename: 'forced.bmp',
      })
      mocks.fetchTrmnlImage.mockResolvedValueOnce(imagePayload)

      const summary = await forceRefreshTrmnlImage()

      expect(summary.mode).toBe('device')
      expect(mocks.fetchTrmnlNextScreen).toHaveBeenCalledTimes(1)
      expect(mocks.fetchTrmnlCurrentScreen).not.toHaveBeenCalled()
      expect(db.row?.image_filename).toBe('forced.bmp')
    })

    it('treats an unrecognized stored mode as mirror', async () => {
      await seedConfigured()
      if (!db.row) throw new Error('Missing integration row')
      db.row.mode = 'garbage'

      await expect(getTrmnlSettings()).resolves.toMatchObject({
        mode: 'mirror',
      })

      mocks.nowSeconds.mockReturnValue(1_400)
      mocks.fetchTrmnlCurrentScreen.mockResolvedValueOnce(screen)
      mocks.fetchTrmnlImage.mockResolvedValueOnce(imagePayload)
      await getTrmnlDisplayState()
      await mocks.backgroundTasks[0]

      expect(mocks.fetchTrmnlCurrentScreen).toHaveBeenCalledTimes(1)
      expect(mocks.fetchTrmnlNextScreen).not.toHaveBeenCalled()
    })
  })
})
