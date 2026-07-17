import { nowSeconds } from '#/lib/crypto'
import {
  decryptCredential,
  encryptCredential,
} from '#/lib/credential-crypto'
import { getCredentialEncryptionKey, getDb } from '#/lib/env'
import { domainFromUrl, getAppIconSvg } from '#/lib/icons'
import {
  fetchTailscaleServices,
  normalizeTailnetDnsName,
  shouldRefreshTailscaleCache,
  type TailscaleCachedService,
  type TailscaleSettingsSummary,
} from '#/lib/tailscale-service'

const INTEGRATION_ID = 1
const CACHE_TTL_SECONDS = 5 * 60
const TAILSCALE_CATEGORY_ID = 'integration:tailscale-services'

type TailscaleIntegrationRow = {
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

type SaveTailscaleSettingsInput = {
  clientId: string
  clientSecret?: string
  tailnetDnsName: string
}

async function readIntegration(): Promise<TailscaleIntegrationRow | null> {
  return getDb()
    .prepare(
      `SELECT client_id, client_secret_ciphertext, client_secret_iv,
              tailnet_dns_name, cached_services_json, last_sync_at,
              last_sync_attempt_at, last_sync_error, updated_at
       FROM tailscale_integration WHERE id = ?`,
    )
    .bind(INTEGRATION_ID)
    .first<TailscaleIntegrationRow>()
}

function readCachedServices(row: TailscaleIntegrationRow): TailscaleCachedService[] {
  try {
    const parsed: unknown = JSON.parse(row.cached_services_json)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (service): service is TailscaleCachedService =>
        typeof service === 'object' &&
        service !== null &&
        typeof service.id === 'string' &&
        typeof service.name === 'string' &&
        typeof service.url === 'string',
    )
  } catch {
    return []
  }
}

function summaryFromRow(
  row: TailscaleIntegrationRow | null,
): TailscaleSettingsSummary {
  if (!row) {
    return {
      configured: false,
      clientId: '',
      tailnetDnsName: '',
      serviceCount: 0,
      lastSyncAt: null,
      lastSyncAttemptAt: null,
      lastSyncError: null,
    }
  }
  return {
    configured: true,
    clientId: row.client_id,
    tailnetDnsName: row.tailnet_dns_name,
    serviceCount: readCachedServices(row).length,
    lastSyncAt: row.last_sync_at,
    lastSyncAttemptAt: row.last_sync_attempt_at,
    lastSyncError: row.last_sync_error,
  }
}

function safeSyncError(error: unknown): string {
  if (!(error instanceof Error)) return 'Tailscale sync failed'
  const allowedPrefixes = [
    'Tailscale ',
    'Unable to decrypt ',
    'CREDENTIAL_ENCRYPTION_KEY ',
  ]
  return allowedPrefixes.some((prefix) => error.message.startsWith(prefix))
    ? error.message
    : 'Tailscale sync failed'
}

async function decryptedSecret(row: TailscaleIntegrationRow): Promise<string> {
  return decryptCredential(
    {
      ciphertext: row.client_secret_ciphertext,
      iv: row.client_secret_iv,
    },
    getCredentialEncryptionKey(),
  )
}

async function syncRow(
  row: TailscaleIntegrationRow,
): Promise<TailscaleCachedService[]> {
  const attemptAt = nowSeconds()
  try {
    const services = await fetchTailscaleServices({
      clientId: row.client_id,
      clientSecret: await decryptedSecret(row),
      tailnetDnsName: row.tailnet_dns_name,
    })
    await getDb()
      .prepare(
        `UPDATE tailscale_integration
         SET cached_services_json = ?, last_sync_at = ?,
             last_sync_attempt_at = ?, last_sync_error = NULL
         WHERE id = ?`,
      )
      .bind(JSON.stringify(services), attemptAt, attemptAt, INTEGRATION_ID)
      .run()
    return services
  } catch (error) {
    const safeError = safeSyncError(error)
    await getDb()
      .prepare(
        `UPDATE tailscale_integration
         SET last_sync_attempt_at = ?, last_sync_error = ? WHERE id = ?`,
      )
      .bind(attemptAt, safeError, INTEGRATION_ID)
      .run()
    throw new Error(safeError)
  }
}

export async function getTailscaleSettings(): Promise<TailscaleSettingsSummary> {
  return summaryFromRow(await readIntegration())
}

export async function saveTailscaleSettings(
  input: SaveTailscaleSettingsInput,
): Promise<TailscaleSettingsSummary> {
  const existing = await readIntegration()
  const encryptionKey = getCredentialEncryptionKey()
  const clientId = input.clientId.trim()
  const tailnetDnsName = normalizeTailnetDnsName(input.tailnetDnsName)
  let clientSecret = input.clientSecret
  if (!clientSecret && existing) clientSecret = await decryptedSecret(existing)
  if (!clientSecret) {
    throw new Error('Enter a Tailscale OAuth client secret')
  }

  const services = await fetchTailscaleServices({
    clientId,
    clientSecret,
    tailnetDnsName,
  })
  const encrypted = input.clientSecret
    ? await encryptCredential(clientSecret, encryptionKey)
    : {
        ciphertext: existing?.client_secret_ciphertext ?? '',
        iv: existing?.client_secret_iv ?? '',
      }
  const now = nowSeconds()

  await getDb()
    .prepare(
      `INSERT INTO tailscale_integration (
         id, client_id, client_secret_ciphertext, client_secret_iv,
         tailnet_dns_name, cached_services_json, last_sync_at,
         last_sync_attempt_at, last_sync_error, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
       ON CONFLICT(id) DO UPDATE SET
         client_id = excluded.client_id,
         client_secret_ciphertext = excluded.client_secret_ciphertext,
         client_secret_iv = excluded.client_secret_iv,
         tailnet_dns_name = excluded.tailnet_dns_name,
         cached_services_json = excluded.cached_services_json,
         last_sync_at = excluded.last_sync_at,
         last_sync_attempt_at = excluded.last_sync_attempt_at,
         last_sync_error = NULL,
         updated_at = excluded.updated_at`,
    )
    .bind(
      INTEGRATION_ID,
      clientId,
      encrypted.ciphertext,
      encrypted.iv,
      tailnetDnsName,
      JSON.stringify(services),
      now,
      now,
      now,
    )
    .run()

  return getTailscaleSettings()
}

export async function refreshTailscaleServices(): Promise<TailscaleSettingsSummary> {
  const row = await readIntegration()
  if (!row) throw new Error('Tailscale is not configured')
  await syncRow(row)
  return getTailscaleSettings()
}

export async function deleteTailscaleSettings(): Promise<void> {
  await getDb()
    .prepare(`DELETE FROM tailscale_integration WHERE id = ?`)
    .bind(INTEGRATION_ID)
    .run()
}

export async function getTailscaleStartpageCategory() {
  const row = await readIntegration()
  if (!row) return null

  let services = readCachedServices(row)
  let unavailable = row.last_sync_error !== null && row.last_sync_at === null
  const now = nowSeconds()
  const stale = shouldRefreshTailscaleCache(
    {
      lastSyncAt: row.last_sync_at,
      lastSyncAttemptAt: row.last_sync_attempt_at,
      lastSyncError: row.last_sync_error,
    },
    now,
    CACHE_TTL_SECONDS,
  )
  if (stale) {
    try {
      services = await syncRow(row)
      unavailable = false
    } catch {
      unavailable = row.last_sync_at === null
    }
  }

  return {
    id: TAILSCALE_CATEGORY_ID,
    name: 'Tailscale Services',
    visibility: 'auth' as const,
    sort_order: Number.MAX_SAFE_INTEGER,
    emptyMessage: unavailable
      ? 'Tailscale services are unavailable.'
      : services.length === 0
        ? 'No Tailscale services listen on port 80 or 443.'
        : undefined,
    apps: services.map((service, index) => ({
      id: service.id,
      category_id: TAILSCALE_CATEGORY_ID,
      name: service.name,
      url: service.url,
      icon: 'server',
      sort_order: index,
      iconSvg: getAppIconSvg('server'),
      domain: domainFromUrl(service.url),
    })),
  }
}
