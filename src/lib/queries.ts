import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { getAdminData, getStartpageData } from '#/lib/apps.functions'
import { getAuthStatus } from '#/lib/auth.functions'
import { fetchPublicStartpageData } from '#/lib/public-startpage'
import { getTailscaleSettingsFn } from '#/lib/tailscale.functions'

// Without a stale window, SSR-dehydrated data is refetched immediately after
// hydration, duplicating the loader's fetch. Auth status stays at the default
// staleTime of 0 because loaders rely on it being fresh for redirect checks.
const DATA_STALE_TIME_MS = 30_000

export function authStatusQueryOptions() {
  return queryOptions({
    queryKey: ['auth', 'status'],
    queryFn: () => getAuthStatus(),
  })
}

export function startpageQueryOptions(authenticated: boolean) {
  return queryOptions({
    queryKey: ['startpage', authenticated],
    staleTime: DATA_STALE_TIME_MS,
    queryFn: (context) => {
      if (authenticated || typeof window === 'undefined') {
        return getStartpageData()
      }
      return fetchPublicStartpageData(context.signal)
    },
  })
}

export function adminDataQueryOptions() {
  return queryOptions({
    queryKey: ['admin', 'data'],
    staleTime: DATA_STALE_TIME_MS,
    queryFn: () => getAdminData(),
  })
}

export function tailscaleSettingsQueryOptions() {
  return queryOptions({
    queryKey: ['admin', 'tailscale'],
    staleTime: DATA_STALE_TIME_MS,
    queryFn: () => getTailscaleSettingsFn(),
  })
}

// requireAuthMiddleware throws Error('Unauthorized'); the message survives
// server-function serialization to the client.
export function isAuthError(error: unknown): boolean {
  return error instanceof Error && error.message === 'Unauthorized'
}

export function invalidateAppData(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['admin'] }),
    queryClient.invalidateQueries({ queryKey: ['startpage'] }),
  ])
}
