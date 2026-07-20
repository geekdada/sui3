import {
  QueryClient,
  QueryObserver,
  focusManager,
} from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getStartpageData } from '#/lib/apps.functions'
import { startpageQueryOptions } from '#/lib/queries'
import { fetchPublicStartpageData } from '#/lib/public-startpage'

vi.mock('#/lib/apps.functions', () => ({
  getAdminData: vi.fn(),
  getStartpageData: vi.fn().mockResolvedValue({
    authenticated: true,
    categories: [],
  }),
}))

vi.mock('#/lib/auth.functions', () => ({
  getAuthStatus: vi.fn(),
}))

vi.mock('#/lib/public-startpage', () => ({
  fetchPublicStartpageData: vi.fn(),
}))

vi.mock('#/lib/tailscale.functions', () => ({
  getTailscaleSettingsFn: vi.fn(),
}))

describe('startpage query options', () => {
  afterEach(() => {
    focusManager.setFocused(undefined)
    vi.unstubAllGlobals()
  })

  it('does not consume the abort signal for authenticated data', async () => {
    let signalReads = 0
    const queryContext = {
      get signal() {
        signalReads += 1
        return new AbortController().signal
      },
    }
    const queryFn = startpageQueryOptions(true).queryFn

    expect(typeof queryFn).toBe('function')
    await (
      queryFn as (context: typeof queryContext) => Promise<unknown>
    )(queryContext)
    expect(signalReads).toBe(0)
  })

  it('still passes the abort signal to the public fetch', async () => {
    vi.stubGlobal('window', {})
    const signal = new AbortController().signal
    let signalReads = 0
    const queryContext = {
      get signal() {
        signalReads += 1
        return signal
      },
    }
    vi.mocked(fetchPublicStartpageData).mockResolvedValueOnce({
      authenticated: false,
      categories: [],
    })
    const queryFn = startpageQueryOptions(false).queryFn

    await (
      queryFn as (context: typeof queryContext) => Promise<unknown>
    )(queryContext)
    expect(signalReads).toBe(1)
    expect(fetchPublicStartpageData).toHaveBeenCalledWith(signal)
  })

  it.each([
    { focusCycle: false, latency: 0 },
    { focusCycle: true, latency: 25 },
  ])(
    'lets an authenticated loader finish after observer teardown (focusCycle=$focusCycle, latency=$latency)',
    async ({ focusCycle, latency }) => {
      let resolveQuery:
        | ((value: Awaited<ReturnType<typeof getStartpageData>>) => void)
        | undefined
      vi.mocked(getStartpageData).mockReturnValueOnce(
        new Promise((resolve) => {
          resolveQuery = resolve
        }),
      )
      const queryClient = new QueryClient()
      const options = startpageQueryOptions(true)
      const loaderPromise = queryClient.ensureQueryData(options)
      const observer = new QueryObserver(queryClient, options)
      const unsubscribe = observer.subscribe(() => {})

      if (focusCycle) {
        queryClient.mount()
        focusManager.setFocused(false)
        focusManager.setFocused(true)
      }
      unsubscribe()
      if (latency > 0) {
        await new Promise((resolve) => setTimeout(resolve, latency))
      }
      resolveQuery?.({ authenticated: true, categories: [] })

      await expect(loaderPromise).resolves.toEqual({
        authenticated: true,
        categories: [],
      })
      if (focusCycle) queryClient.unmount()
    },
  )
})
