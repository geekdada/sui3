import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import { requireAuthMiddleware } from '#/lib/auth-middleware'
import {
  deleteTailscaleSettings,
  getTailscaleSettings,
  refreshTailscaleServices,
  saveTailscaleSettings,
} from '#/lib/tailscale.server'

function noStore() {
  setResponseHeader('Cache-Control', 'no-store')
}

export const getTailscaleSettingsFn = createServerFn({ method: 'GET' })
  .middleware([requireAuthMiddleware])
  .handler(async () => {
    noStore()
    return getTailscaleSettings()
  })

export const saveTailscaleSettingsFn = createServerFn({ method: 'POST' })
  .middleware([requireAuthMiddleware])
  .validator(
    z.object({
      clientId: z.string().trim().min(1).max(256),
      clientSecret: z.string().max(2048).optional(),
      tailnetDnsName: z.string().trim().min(1).max(253),
    }),
  )
  .handler(async ({ data }) => {
    noStore()
    return saveTailscaleSettings({
      ...data,
      clientSecret: data.clientSecret || undefined,
    })
  })

export const refreshTailscaleServicesFn = createServerFn({ method: 'POST' })
  .middleware([requireAuthMiddleware])
  .handler(async () => {
    noStore()
    return refreshTailscaleServices()
  })

export const deleteTailscaleSettingsFn = createServerFn({ method: 'POST' })
  .middleware([requireAuthMiddleware])
  .handler(async () => {
    noStore()
    await deleteTailscaleSettings()
    return { ok: true }
  })
