import feather from 'feather-icons'
import { sha256Hex } from '#/lib/crypto'

type FeatherIconsMap = typeof feather.icons

/** Map common sui2 / MDI short names onto Feather icons. */
const MDI_TO_FEATHER: Record<string, keyof FeatherIconsMap> = {
  'google-cloud': 'cloud',
  cloud: 'cloud',
  clouds: 'cloud',
  'cloud-download': 'download-cloud',
  'cloud-search-outline': 'search',
  routes: 'git-branch',
  'car-brake-alert': 'alert-triangle',
  'database-cog': 'database',
  database: 'database',
  'key-link': 'key',
  key: 'key',
  'monitor-dashboard': 'monitor',
  monitor: 'monitor',
  'desktop-tower': 'monitor',
  vpn: 'shield',
  'application-variable-outline': 'box',
  application: 'box',
  gmail: 'mail',
  mail: 'mail',
  'television-classic': 'tv',
  'movie-roll': 'film',
  'rss-box': 'rss',
  'router-wireless': 'wifi',
  'file-multiple': 'folder',
  'google-analytics': 'bar-chart-2',
  harddisk: 'hard-drive',
  server: 'server',
  docker: 'box',
  github: 'github',
  globe: 'globe',
  home: 'home',
  settings: 'settings',
  lock: 'lock',
  unlock: 'unlock',
}

const FALLBACK = 'box' as const satisfies keyof FeatherIconsMap

function hasFeatherIcon(name: string): name is keyof FeatherIconsMap {
  return Object.prototype.hasOwnProperty.call(feather.icons, name)
}

export function resolveFeatherName(iconName: string): keyof FeatherIconsMap {
  const key = iconName
    .trim()
    .replace(/^mdi:/i, '')
    .replace(/^feather:/i, '')
    .toLowerCase()

  if (hasFeatherIcon(key)) return key
  const mapped = MDI_TO_FEATHER[key]
  if (mapped && hasFeatherIcon(mapped)) return mapped
  return FALLBACK
}

export function getAppIconSvg(
  iconName: string,
  attrs: {
    width?: number
    height?: number
    class?: string
    strokeWidth?: number
  } = {},
): string {
  const name = resolveFeatherName(iconName)
  return feather.icons[name].toSvg({
    width: attrs.width ?? 24,
    height: attrs.height ?? 24,
    class: attrs.class ?? 'app-icon',
    'stroke-width': attrs.strokeWidth ?? 1.75,
  })
}

const ICON_CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800'

/** Parse a query-string number, clamped to [min, max]; falls back if absent/invalid. */
function clampParam(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === null) return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

/**
 * Build an `image/svg+xml` Response for a feather icon by name.
 *
 * The name is never reflected verbatim — `resolveFeatherName` maps it to a
 * known feather icon (or the `box` fallback), and the body comes only from
 * feather-icons' own `toSvg()`, so there is no injection surface. Optional
 * `?size=` and `?sw=` (stroke width) query params are parsed and clamped.
 */
export async function createIconSvgResponse(
  name: string,
  request: Request,
): Promise<Response> {
  const url = new URL(request.url)
  const size = clampParam(url.searchParams.get('size'), 24, 8, 512)
  const strokeWidth = clampParam(url.searchParams.get('sw'), 1.75, 0.5, 4)
  const cleanName = name.replace(/\.svg$/i, '')

  const svg = getAppIconSvg(cleanName, {
    width: size,
    height: size,
    strokeWidth,
  })
  const etag = `"${await sha256Hex(svg)}"`
  const headers = {
    'Cache-Control': ICON_CACHE_CONTROL,
    'Content-Type': 'image/svg+xml; charset=utf-8',
    ETag: etag,
  }

  if (request.headers.get('If-None-Match') === etag) {
    return new Response(null, { status: 304, headers })
  }

  return new Response(svg, { status: 200, headers })
}

export function domainFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname
  } catch {
    return url
  }
}
