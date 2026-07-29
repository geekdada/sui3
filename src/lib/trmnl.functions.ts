import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import { requireAuthMiddleware } from '#/lib/auth-middleware'
import {
  deleteTrmnlSettings,
  forceRefreshTrmnlImage,
  getTrmnlDisplayState,
  getTrmnlSettings,
  saveTrmnlSettings,
} from '#/lib/trmnl.server'

function noStore() {
  setResponseHeader('Cache-Control', 'no-store')
}

export const getTrmnlSettingsFn = createServerFn({ method: 'GET' })
  .middleware([requireAuthMiddleware])
  .handler(async () => {
    noStore()
    return getTrmnlSettings()
  })

export const saveTrmnlSettingsFn = createServerFn({ method: 'POST' })
  .middleware([requireAuthMiddleware])
  .validator(
    z.object({
      deviceApiKey: z.string().max(256).optional(),
      mode: z.enum(['mirror', 'device']),
    }),
  )
  .handler(async ({ data }) => {
    noStore()
    return saveTrmnlSettings({
      deviceApiKey: data.deviceApiKey?.trim() || undefined,
      mode: data.mode,
    })
  })

export const deleteTrmnlSettingsFn = createServerFn({ method: 'POST' })
  .middleware([requireAuthMiddleware])
  .handler(async () => {
    noStore()
    await deleteTrmnlSettings()
    return { ok: true }
  })

export const forceRefreshTrmnlFn = createServerFn({ method: 'POST' })
  .middleware([requireAuthMiddleware])
  .handler(async () => {
    noStore()
    return forceRefreshTrmnlImage()
  })

export const getTrmnlDisplayStateFn = createServerFn({ method: 'GET' })
  .middleware([requireAuthMiddleware])
  .handler(async () => {
    noStore()
    return getTrmnlDisplayState()
  })
