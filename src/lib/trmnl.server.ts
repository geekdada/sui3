import { runInBackground } from '#/lib/background'
import { nowSeconds } from '#/lib/crypto'
import {
  decryptCredential,
  encryptCredential,
  type CredentialContext,
} from '#/lib/credential-crypto'
import { getCredentialEncryptionKey, getDb } from '#/lib/env'
import {
  fetchTrmnlCurrentScreen,
  fetchTrmnlImage,
  fetchTrmnlNextScreen,
  isRefreshDue,
  nextAttemptAllowedAt,
  parseTrmnlMode,
  RATE_LIMIT_BACKOFF_SECONDS,
  TrmnlRateLimitError,
  type TrmnlDisplayState,
  type TrmnlMode,
  type TrmnlSettingsSummary,
} from '#/lib/trmnl-service'

const INTEGRATION_ID = 1

const TRMNL_CREDENTIAL_CONTEXT: CredentialContext = {
  aad: 'sui3:trmnl-device-key:v1',
  decryptError:
    'Unable to decrypt the stored credential. Re-enter the TRMNL device API key.',
}

/** D1 converts written `ArrayBuffer`s with `Array.from`, so BLOB columns come
 * back as plain number arrays. Accept every shape a driver might hand us. */
type StoredBlob = ArrayBuffer | ArrayBufferView | number[]

type TrmnlIntegrationRow = {
  device_key_ciphertext: string
  device_key_iv: string
  mode: string | null
  image: StoredBlob | null
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

export type TrmnlStoredImage = {
  bytes: ArrayBuffer
  contentType: string
  fetchedAt: number
  expiresAt: number | null
}

function toImageBytes(value: StoredBlob | null | undefined): ArrayBuffer | null {
  if (value === null || value === undefined) return null
  if (value instanceof ArrayBuffer) return value
  const source = ArrayBuffer.isView(value)
    ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    : value
  return new Uint8Array(source).buffer
}

async function readIntegration(): Promise<TrmnlIntegrationRow | null> {
  return getDb()
    .prepare(
      `SELECT device_key_ciphertext, device_key_iv, mode, image,
              image_content_type, image_filename, image_url, rendered_at,
              refresh_rate, fetched_at, expires_at, last_attempt_at,
              retry_after_at, last_error, updated_at
       FROM trmnl_integration WHERE id = ?`,
    )
    .bind(INTEGRATION_ID)
    .first<TrmnlIntegrationRow>()
}

function safeTrmnlError(error: unknown): string {
  if (!(error instanceof Error)) return 'TRMNL refresh failed'
  const allowedPrefixes = [
    'TRMNL ',
    'Unable to decrypt ',
    'CREDENTIAL_ENCRYPTION_KEY ',
  ]
  return allowedPrefixes.some((prefix) => error.message.startsWith(prefix))
    ? error.message
    : 'TRMNL refresh failed'
}

function logSafeTrmnlError(operation: string, error: unknown): void {
  console.error(`[trmnl] ${operation} failed: ${safeTrmnlError(error)}`)
}

function summaryFromRow(row: TrmnlIntegrationRow | null): TrmnlSettingsSummary {
  if (!row) {
    return {
      configured: false,
      mode: null,
      hasImage: false,
      refreshRate: null,
      fetchedAt: null,
      expiresAt: null,
      lastError: null,
    }
  }
  return {
    configured: true,
    mode: parseTrmnlMode(row.mode),
    hasImage: row.image !== null,
    refreshRate: row.refresh_rate,
    fetchedAt: row.fetched_at,
    expiresAt: row.expires_at,
    lastError: row.last_error,
  }
}

async function decryptedKey(row: TrmnlIntegrationRow): Promise<string> {
  return decryptCredential(
    {
      ciphertext: row.device_key_ciphertext,
      iv: row.device_key_iv,
    },
    getCredentialEncryptionKey(),
    TRMNL_CREDENTIAL_CONTEXT,
  )
}

/** Device mode advances SUI3's own playlist; mirror mode only observes one. */
function screenFetcherForMode(mode: TrmnlMode) {
  return mode === 'device' ? fetchTrmnlNextScreen : fetchTrmnlCurrentScreen
}

export async function getTrmnlSettings(): Promise<TrmnlSettingsSummary> {
  return summaryFromRow(await readIntegration())
}

export async function saveTrmnlSettings(input: {
  deviceApiKey?: string
  mode?: TrmnlMode
}): Promise<TrmnlSettingsSummary> {
  const existing = await readIntegration()
  const encryptionKey = getCredentialEncryptionKey()
  const mode = input.mode ?? parseTrmnlMode(existing?.mode)
  let deviceApiKey = input.deviceApiKey?.trim() ?? ''
  if (!deviceApiKey && existing) deviceApiKey = await decryptedKey(existing)
  if (!deviceApiKey) {
    throw new Error('Enter the TRMNL device API key')
  }

  // Validate the key and pull the first screen before storing anything. Always
  // the non-advancing endpoint, even in device mode, so repeatedly pressing
  // "Save and test" never burns playlist slots.
  let screen: Awaited<ReturnType<typeof fetchTrmnlCurrentScreen>>
  try {
    screen = await fetchTrmnlCurrentScreen({ apiKey: deviceApiKey })
  } catch (error) {
    logSafeTrmnlError('Credential validation', error)
    throw new Error(safeTrmnlError(error))
  }

  const encrypted = input.deviceApiKey?.trim()
    ? await encryptCredential(
        deviceApiKey,
        encryptionKey,
        TRMNL_CREDENTIAL_CONTEXT,
      )
    : {
        ciphertext: existing?.device_key_ciphertext ?? '',
        iv: existing?.device_key_iv ?? '',
      }

  let imagePayload: Awaited<ReturnType<typeof fetchTrmnlImage>> | null = null
  let imageError: string | null = null
  if (screen.imageUrl) {
    try {
      imagePayload = await fetchTrmnlImage(screen.imageUrl)
    } catch (error) {
      logSafeTrmnlError('Initial image download', error)
      imageError = safeTrmnlError(error)
    }
  }

  const now = nowSeconds()
  await getDb()
    .prepare(
      `INSERT INTO trmnl_integration (
         id, device_key_ciphertext, device_key_iv, image, image_content_type,
         image_filename, image_url, rendered_at, refresh_rate, fetched_at,
         expires_at, last_attempt_at, retry_after_at, last_error, updated_at,
         mode
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         device_key_ciphertext = excluded.device_key_ciphertext,
         device_key_iv = excluded.device_key_iv,
         mode = excluded.mode,
         image = excluded.image,
         image_content_type = excluded.image_content_type,
         image_filename = excluded.image_filename,
         image_url = excluded.image_url,
         rendered_at = excluded.rendered_at,
         refresh_rate = excluded.refresh_rate,
         fetched_at = excluded.fetched_at,
         expires_at = excluded.expires_at,
         last_attempt_at = excluded.last_attempt_at,
         retry_after_at = NULL,
         last_error = excluded.last_error,
         updated_at = excluded.updated_at`,
    )
    .bind(
      INTEGRATION_ID,
      encrypted.ciphertext,
      encrypted.iv,
      imagePayload?.bytes ?? toImageBytes(existing?.image),
      imagePayload?.contentType ?? existing?.image_content_type ?? null,
      screen.filename ?? existing?.image_filename ?? null,
      screen.imageUrl ?? existing?.image_url ?? null,
      screen.renderedAt ?? existing?.rendered_at ?? null,
      screen.refreshRate,
      imagePayload ? now : (existing?.fetched_at ?? null),
      imagePayload ? now + screen.refreshRate : (existing?.expires_at ?? null),
      now,
      imageError,
      now,
      mode,
    )
    .run()

  return getTrmnlSettings()
}

export async function deleteTrmnlSettings(): Promise<void> {
  await getDb()
    .prepare(`DELETE FROM trmnl_integration WHERE id = ?`)
    .bind(INTEGRATION_ID)
    .run()
}

async function recordRefreshError(
  error: unknown,
  attemptedAt: number,
): Promise<void> {
  const retryAfterSeconds =
    error instanceof TrmnlRateLimitError ? error.retryAfterSeconds : null
  const retryAfterAt =
    error instanceof TrmnlRateLimitError
      ? attemptedAt + (retryAfterSeconds ?? RATE_LIMIT_BACKOFF_SECONDS)
      : null
  await getDb()
    .prepare(
      `UPDATE trmnl_integration
       SET last_error = ?, retry_after_at = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(safeTrmnlError(error), retryAfterAt, nowSeconds(), INTEGRATION_ID)
    .run()
}

async function refreshRow(
  row: TrmnlIntegrationRow,
  attemptedAt: number,
): Promise<void> {
  try {
    const apiKey = await decryptedKey(row)
    const fetchScreen = screenFetcherForMode(parseTrmnlMode(row.mode))
    const screen = await fetchScreen({ apiKey })
    if (!screen.imageUrl) {
      throw new Error('TRMNL returned no image URL')
    }
    const image = await fetchTrmnlImage(screen.imageUrl)
    const now = nowSeconds()
    await getDb()
      .prepare(
        `UPDATE trmnl_integration
         SET image = ?, image_content_type = ?, image_filename = ?,
             image_url = ?, rendered_at = ?, refresh_rate = ?, fetched_at = ?,
             expires_at = ?, retry_after_at = NULL, last_error = NULL,
             updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        image.bytes,
        image.contentType,
        screen.filename,
        screen.imageUrl,
        screen.renderedAt,
        screen.refreshRate,
        now,
        now + screen.refreshRate,
        now,
        INTEGRATION_ID,
      )
      .run()
  } catch (error) {
    logSafeTrmnlError('Image refresh', error)
    await recordRefreshError(error, attemptedAt)
    throw new Error(safeTrmnlError(error))
  }
}

async function claimRefreshAttempt(now: number): Promise<void> {
  await getDb()
    .prepare(
      `UPDATE trmnl_integration SET last_attempt_at = ? WHERE id = ?`,
    )
    .bind(now, INTEGRATION_ID)
    .run()
}

/** Trigger a background refresh when the cached image is due. Never blocks the
 * caller on upstream work and never throws. */
async function maybeRefreshInBackground(
  row: TrmnlIntegrationRow,
  now: number,
): Promise<void> {
  if (!isRefreshDue({ hasImage: row.image !== null, expiresAt: row.expires_at }, now)) {
    return
  }
  if (
    now <
    nextAttemptAllowedAt({
      lastAttemptAt: row.last_attempt_at,
      retryAfterAt: row.retry_after_at,
    })
  ) {
    return
  }
  await claimRefreshAttempt(now)
  runInBackground(refreshRow(row, now))
}

/** Display state for the startpage widget. Reads D1 only; an overdue image is
 * refreshed in the background so SSR never waits on TRMNL. */
export async function getTrmnlDisplayState(): Promise<TrmnlDisplayState> {
  const row = await readIntegration()
  if (!row) {
    return {
      configured: false,
      hasImage: false,
      fetchedAt: null,
      expiresAt: null,
      expired: false,
    }
  }
  const now = nowSeconds()
  const expired = isRefreshDue(
    { hasImage: row.image !== null, expiresAt: row.expires_at },
    now,
  )
  await maybeRefreshInBackground(row, now)
  return {
    configured: true,
    hasImage: row.image !== null,
    fetchedAt: row.fetched_at,
    expiresAt: row.expires_at,
    expired,
  }
}

/** Cached image for the /api/trmnl/display endpoint. Serves stale images while
 * a background refresh runs. */
export async function getTrmnlImagePayload(): Promise<TrmnlStoredImage | null> {
  const row = await readIntegration()
  if (!row) return null
  const bytes = toImageBytes(row.image)
  if (!bytes) return null
  await maybeRefreshInBackground(row, nowSeconds())
  return {
    bytes,
    contentType: row.image_content_type ?? 'image/png',
    fetchedAt: row.fetched_at ?? row.updated_at,
    expiresAt: row.expires_at,
  }
}

/** Admin-triggered refresh. Bypasses the dedup window and surfaces errors. */
export async function forceRefreshTrmnlImage(): Promise<TrmnlSettingsSummary> {
  const row = await readIntegration()
  if (!row) throw new Error('TRMNL is not configured')
  const now = nowSeconds()
  await claimRefreshAttempt(now)
  await refreshRow(row, now)
  return getTrmnlSettings()
}
