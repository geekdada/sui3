import feather from 'feather-icons'

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
  attrs: { width?: number; height?: number; class?: string } = {},
): string {
  const name = resolveFeatherName(iconName)
  return feather.icons[name].toSvg({
    width: attrs.width ?? 24,
    height: attrs.height ?? 24,
    class: attrs.class ?? 'app-icon',
    'stroke-width': 1.75,
  })
}

export function domainFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname
  } catch {
    return url
  }
}
