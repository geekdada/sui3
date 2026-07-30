import { z } from 'zod'

/** Read-only: the screen a real device is showing. Does not advance a playlist. */
const CURRENT_SCREEN_URL = 'https://trmnl.com/api/display/current'
/** Device endpoint: advances the playlist and returns the next screen. */
const NEXT_SCREEN_URL = 'https://trmnl.com/api/display'
const DEFAULT_TIMEOUT_MS = 10_000
const IMAGE_TIMEOUT_MS = 15_000
const MAX_IMAGE_BYTES = 1024 * 1024

const MIN_REFRESH_RATE_SECONDS = 15
const MAX_REFRESH_RATE_SECONDS = 24 * 60 * 60
const DEFAULT_REFRESH_RATE_SECONDS = 300

/** Minimum gap between upstream attempts; TRMNL rate limits are strict. */
export const MIN_REFRESH_ATTEMPT_INTERVAL_SECONDS = 30
/** Fallback backoff when TRMNL sends 429 without a Retry-After header. */
export const RATE_LIMIT_BACKOFF_SECONDS = 60

/** Both endpoints share this shape. The device endpoint omits `rendered_at` and
 * adds fields we deliberately ignore (`status`, `reset_firmware`,
 * `update_firmware`, `firmware_url`, `special_function`, `action`) — a
 * non-strict object lets them pass through. */
const screenSchema = z.object({
  refresh_rate: z.number().positive().nullish(),
  image_url: z.url().nullish(),
  filename: z.string().nullish(),
  rendered_at: z.string().nullish(),
})

export type TrmnlCurrentScreen = {
  refreshRate: number
  imageUrl: string | null
  filename: string | null
  renderedAt: string | null
}

/**
 * `mirror` reflects a physical TRMNL device; `device` makes SUI3 act as its own
 * device and advance its own playlist.
 */
export type TrmnlMode = 'mirror' | 'device'

/** The `mode` column has no CHECK constraint, so normalise on read. */
export function parseTrmnlMode(value: unknown): TrmnlMode {
  return value === 'device' ? 'device' : 'mirror'
}

export type TrmnlImagePayload = {
  bytes: ArrayBuffer
  contentType: string
}

export type TrmnlSettingsSummary = {
  configured: boolean
  mode: TrmnlMode | null
  hasImage: boolean
  refreshRate: number | null
  fetchedAt: number | null
  expiresAt: number | null
  lastError: string | null
}

export type TrmnlDisplayState = {
  configured: boolean
  mode: TrmnlMode | null
  hasImage: boolean
  fetchedAt: number | null
  expiresAt: number | null
  expired: boolean
}

export class TrmnlRateLimitError extends Error {
  readonly retryAfterSeconds: number | null

  constructor(retryAfterSeconds: number | null) {
    super('TRMNL rate limited the request')
    this.name = 'TrmnlRateLimitError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export function clampRefreshRate(rate: number | null | undefined): number {
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    return DEFAULT_REFRESH_RATE_SECONDS
  }
  return Math.min(
    Math.max(Math.floor(rate), MIN_REFRESH_RATE_SECONDS),
    MAX_REFRESH_RATE_SECONDS,
  )
}

export function nextAttemptAllowedAt(input: {
  lastAttemptAt: number | null
  retryAfterAt: number | null
}): number {
  const attemptFloor =
    (input.lastAttemptAt ?? 0) + MIN_REFRESH_ATTEMPT_INTERVAL_SECONDS
  return Math.max(attemptFloor, input.retryAfterAt ?? 0)
}

export function isRefreshDue(
  input: { hasImage: boolean; expiresAt: number | null },
  now: number,
): boolean {
  if (!input.hasImage) return true
  return input.expiresAt === null || input.expiresAt <= now
}

export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null
  const seconds = Number.parseInt(header, 10)
  if (Number.isFinite(seconds) && seconds >= 0 && String(seconds) === header.trim()) {
    return seconds
  }
  const date = Date.parse(header)
  if (Number.isFinite(date)) {
    return Math.max(0, Math.ceil((date - Date.now()) / 1000))
  }
  return null
}

async function requestWithTimeout(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal })
  } catch {
    if (controller.signal.aborted) {
      throw new Error('TRMNL request timed out')
    }
    throw new Error('TRMNL request failed')
  } finally {
    clearTimeout(timeout)
  }
}

type FetchScreenOptions = {
  apiKey: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

async function fetchTrmnlScreen(
  url: string,
  {
    apiKey,
    fetchImpl = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }: FetchScreenOptions,
): Promise<TrmnlCurrentScreen> {
  const response = await requestWithTimeout(
    url,
    {
      method: 'GET',
      headers: {
        'Access-Token': apiKey,
        Accept: 'application/json',
      },
    },
    fetchImpl,
    timeoutMs,
  )
  if (response.status === 429) {
    throw new TrmnlRateLimitError(
      parseRetryAfter(response.headers.get('Retry-After')),
    )
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error('TRMNL rejected the device API key')
  }
  if (!response.ok) {
    throw new Error(`TRMNL display request failed (${response.status})`)
  }
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error('TRMNL returned an invalid response')
  }
  const parsed = screenSchema.safeParse(payload)
  if (!parsed.success) {
    throw new Error('TRMNL returned an invalid response')
  }
  return {
    refreshRate: clampRefreshRate(parsed.data.refresh_rate),
    imageUrl: parsed.data.image_url ?? null,
    filename: parsed.data.filename ?? null,
    renderedAt: parsed.data.rendered_at ?? null,
  }
}

/** Mirror mode, and credential validation in both modes: never advances a
 * playlist, so it is safe to call repeatedly. */
export async function fetchTrmnlCurrentScreen(
  options: FetchScreenOptions,
): Promise<TrmnlCurrentScreen> {
  return fetchTrmnlScreen(CURRENT_SCREEN_URL, options)
}

/** Device mode: each call advances SUI3's own playlist to the next screen. */
export async function fetchTrmnlNextScreen(
  options: FetchScreenOptions,
): Promise<TrmnlCurrentScreen> {
  return fetchTrmnlScreen(NEXT_SCREEN_URL, options)
}

export async function fetchTrmnlImage(
  imageUrl: string,
  {
    fetchImpl = fetch,
    timeoutMs = IMAGE_TIMEOUT_MS,
  }: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<TrmnlImagePayload> {
  const url = URL.parse(imageUrl)
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
    throw new Error('TRMNL image URL is invalid')
  }
  const response = await requestWithTimeout(
    url.toString(),
    { method: 'GET' },
    fetchImpl,
    timeoutMs,
  )
  if (!response.ok) {
    throw new Error(`TRMNL image download failed (${response.status})`)
  }
  const contentType =
    response.headers.get('Content-Type')?.split(';')[0]?.trim() ?? ''
  if (!contentType.startsWith('image/')) {
    throw new Error('TRMNL image download returned a non-image response')
  }
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength === 0) {
    throw new Error('TRMNL image download was empty')
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error('TRMNL image is too large')
  }
  return { bytes, contentType }
}
