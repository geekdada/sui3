import { z } from 'zod'
import { createTailnetDnsDiscoveryError } from '#/lib/tailscale-errors'

const TOKEN_URL = 'https://api.tailscale.com/api/v2/oauth/token'
const SERVICES_URL = 'https://api.tailscale.com/api/v2/tailnet/-/vip-services'
const DEVICES_URL = 'https://api.tailscale.com/api/v2/tailnet/-/devices'
const DEFAULT_TIMEOUT_MS = 10_000

const tokenResponseSchema = z.object({ access_token: z.string().min(1) })
const serviceSchema = z.object({
  name: z.string().min(1),
  ports: z.array(z.string()),
})
const servicesResponseSchema = z.union([
  z.array(serviceSchema),
  z.object({ vipServices: z.array(serviceSchema) }),
])
const devicesResponseSchema = z.object({
  devices: z.array(
    z.object({
      name: z.string().min(1),
      isExternal: z.boolean(),
    }),
  ),
})

export type TailscaleCachedService = {
  id: string
  name: string
  url: string
}

export type TailscaleServicesSnapshot = {
  tailnetDnsName: string
  services: TailscaleCachedService[]
}

export type TailscaleSettingsSummary = {
  configured: boolean
  clientId: string
  tailnetDnsName: string
  serviceCount: number
  lastSyncAt: number | null
  lastSyncAttemptAt: number | null
  lastSyncError: string | null
}

export function shouldRefreshTailscaleCache(
  input: {
    lastSyncAt: number | null
    lastSyncAttemptAt: number | null
    lastSyncError: string | null
  },
  now: number,
  ttlSeconds: number,
): boolean {
  const freshnessAnchor = input.lastSyncError
    ? input.lastSyncAttemptAt
    : input.lastSyncAt
  return freshnessAnchor === null || now - freshnessAnchor >= ttlSeconds
}

type FetchTailscaleServicesSnapshotInput = {
  clientId: string
  clientSecret: string
  tailnetDnsNameFallback?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

export function normalizeTailnetDnsName(value: string): string {
  const hostname = value.trim().replace(/\.$/, '').toLowerCase()
  const labels = hostname.split('.')
  if (
    hostname.length === 0 ||
    hostname.length > 253 ||
    labels.length < 2 ||
    labels.some((label) => !DNS_LABEL.test(label))
  ) {
    throw new Error('Tailnet DNS name must be a hostname without a URL or port')
  }
  return hostname
}

export function discoverTailnetDnsName(payload: unknown): string {
  const parsed = devicesResponseSchema.safeParse(payload)
  if (!parsed.success) {
    throw new Error('Invalid Tailscale Devices response')
  }

  const suffixes = new Set<string>()
  for (const device of parsed.data.devices) {
    if (device.isExternal) continue
    const name = device.name.trim().replace(/\.$/, '').toLowerCase()
    const firstDot = name.indexOf('.')
    if (firstDot <= 0) continue
    try {
      suffixes.add(normalizeTailnetDnsName(name.slice(firstDot + 1)))
    } catch {
      // Ignore malformed device names; another internal device may be valid.
    }
  }

  if (suffixes.size !== 1) {
    throw new Error('Unable to determine Tailscale tailnet DNS name')
  }
  return [...suffixes][0] as string
}

function includesTcpPort(value: string, port: 80 | 443): boolean {
  const match = /^tcp:(\d+)(?:-(\d+))?$/.exec(value)
  if (!match) return false
  const start = Number(match[1])
  const end = match[2] ? Number(match[2]) : start
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 1 ||
    end > 65_535 ||
    start > end
  ) {
    return false
  }
  return start <= port && port <= end
}

export function normalizeTailscaleServices(
  payload: unknown,
  tailnetDnsName: string,
): TailscaleCachedService[] {
  const parsed = servicesResponseSchema.safeParse(payload)
  if (!parsed.success) {
    throw new Error('Invalid Tailscale Services response')
  }
  const services = Array.isArray(parsed.data)
    ? parsed.data
    : parsed.data.vipServices
  const suffix = normalizeTailnetDnsName(tailnetDnsName)
  const merged = new Map<
    string,
    { name: string; label: string; http: boolean; https: boolean }
  >()

  for (const service of services) {
    const label = service.name.replace(/^svc:/, '').toLowerCase()
    if (!DNS_LABEL.test(label)) continue
    const previous = merged.get(service.name)
    const http = service.ports.some((port) => includesTcpPort(port, 80))
    const https = service.ports.some((port) => includesTcpPort(port, 443))
    if (!http && !https) continue
    merged.set(service.name, {
      name: service.name,
      label,
      http: (previous?.http ?? false) || http,
      https: (previous?.https ?? false) || https,
    })
  }

  return [...merged.values()]
    .map((service) => {
      const protocol = service.https ? 'https' : 'http'
      const name = service.name.replace(/^svc:/, '')
      return {
        id: `tailscale:${service.name}`,
        name,
        url: `${protocol}://${service.label}.${suffix}/`,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
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
      throw new Error('Tailscale request timed out')
    }
    throw new Error('Tailscale request failed')
  } finally {
    clearTimeout(timeout)
  }
}

async function readJson(response: Response, label: string): Promise<unknown> {
  if (!response.ok) {
    throw new Error(`${label} request failed (${response.status})`)
  }
  try {
    return await response.json()
  } catch {
    throw new Error(`${label} returned an invalid response`)
  }
}

export async function fetchTailscaleServicesSnapshot({
  clientId,
  clientSecret,
  tailnetDnsNameFallback,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: FetchTailscaleServicesSnapshotInput): Promise<TailscaleServicesSnapshot> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
    scope: 'all:read',
  })
  const tokenResponse = await requestWithTimeout(
    TOKEN_URL,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    },
    fetchImpl,
    timeoutMs,
  )
  const tokenPayload = await readJson(tokenResponse, 'Tailscale OAuth')
  const token = tokenResponseSchema.safeParse(tokenPayload)
  if (!token.success) {
    throw new Error('Tailscale OAuth returned an invalid response')
  }

  const authorizedRequest = {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token.data.access_token}`,
      Accept: 'application/json',
    },
  } satisfies RequestInit
  const [servicesResult, devicesResult] = await Promise.allSettled([
    requestWithTimeout(
      SERVICES_URL,
      authorizedRequest,
      fetchImpl,
      timeoutMs,
    ).then((response) => readJson(response, 'Tailscale Services')),
    requestWithTimeout(
      DEVICES_URL,
      authorizedRequest,
      fetchImpl,
      timeoutMs,
    ).then((response) => readJson(response, 'Tailscale Devices')),
  ])
  if (servicesResult.status === 'rejected') throw servicesResult.reason

  let tailnetDnsName: string
  try {
    if (devicesResult.status === 'rejected') throw devicesResult.reason
    tailnetDnsName = discoverTailnetDnsName(devicesResult.value)
  } catch (error) {
    if (!tailnetDnsNameFallback) {
      throw createTailnetDnsDiscoveryError(error)
    }
    tailnetDnsName = normalizeTailnetDnsName(tailnetDnsNameFallback)
  }
  return {
    tailnetDnsName,
    services: normalizeTailscaleServices(servicesResult.value, tailnetDnsName),
  }
}
