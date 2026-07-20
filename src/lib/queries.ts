import { queryOptions } from '@tanstack/react-query'
import { getAdminData, getStartpageData } from '#/lib/apps.functions'
import { getAuthStatus } from '#/lib/auth.functions'
import { fetchPublicStartpageData } from '#/lib/public-startpage'
import { getTailscaleSettingsFn } from '#/lib/tailscale.functions'

export function authStatusQueryOptions() {
  return queryOptions({
    queryKey: ['auth', 'status'],
    queryFn: () => getAuthStatus(),
  })
}

export function startpageQueryOptions(authenticated: boolean) {
  return queryOptions({
    queryKey: ['startpage', authenticated],
    queryFn: ({ signal }) => {
      if (authenticated || typeof window === 'undefined') {
        return getStartpageData()
      }
      return fetchPublicStartpageData(signal)
    },
  })
}

export function adminDataQueryOptions() {
  return queryOptions({
    queryKey: ['admin', 'data'],
    queryFn: () => getAdminData(),
  })
}

export function tailscaleSettingsQueryOptions() {
  return queryOptions({
    queryKey: ['admin', 'tailscale'],
    queryFn: () => getTailscaleSettingsFn(),
  })
}
