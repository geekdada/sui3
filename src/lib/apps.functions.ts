import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import {
  createApp,
  createCategory,
  deleteApp,
  deleteCategory,
  importSui2Apps,
  listCategoriesWithApps,
  reorderLayout,
  updateApp,
  updateCategory,
} from '#/lib/apps'
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
} from '#/lib/auth-middleware'
import { domainFromUrl } from '#/lib/icons'
import { loadStartpageData } from '#/lib/startpage-data'
import type { AppItem, DecoratedApp } from '#/lib/types'

/** Attach the display domain to a raw app row. */
function decorateApp(app: AppItem): DecoratedApp {
  return {
    ...app,
    domain: domainFromUrl(app.url),
  }
}

export const getStartpageData = createServerFn({ method: 'GET' })
  .middleware([optionalAuthMiddleware])
  .handler(async ({ context }) => {
    setResponseHeader('Cache-Control', 'no-store')
    const { authenticated } = context
    return loadStartpageData(authenticated)
  })

export const getAdminData = createServerFn({ method: 'GET' })
  .middleware([requireAuthMiddleware])
  .handler(async () => {
    setResponseHeader('Cache-Control', 'no-store')
    const categories = await listCategoriesWithApps(true)
    return {
      categories: categories.map((cat) => ({
        ...cat,
        apps: cat.apps.map(decorateApp),
      })),
    }
  })

export const createCategoryFn = createServerFn({ method: 'POST' })
  .middleware([requireAuthMiddleware])
  .validator(
    z.object({
      name: z.string().min(1),
      visibility: z.enum(['public', 'auth']),
    }),
  )
  .handler(async ({ data }) => createCategory(data))

export const updateCategoryFn = createServerFn({ method: 'POST' })
  .middleware([requireAuthMiddleware])
  .validator(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      visibility: z.enum(['public', 'auth']),
      sort_order: z.number().int(),
    }),
  )
  .handler(async ({ data }) => {
    await updateCategory(data)
    return { ok: true }
  })

export const deleteCategoryFn = createServerFn({ method: 'POST' })
  .middleware([requireAuthMiddleware])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    await deleteCategory(data.id)
    return { ok: true }
  })

export const createAppFn = createServerFn({ method: 'POST' })
  .middleware([requireAuthMiddleware])
  .validator(
    z.object({
      category_id: z.string().min(1),
      name: z.string().min(1),
      url: z.string().min(1),
      icon: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => createApp(data))

export const updateAppFn = createServerFn({ method: 'POST' })
  .middleware([requireAuthMiddleware])
  .validator(
    z.object({
      id: z.string().min(1),
      category_id: z.string().min(1),
      name: z.string().min(1),
      url: z.string().min(1),
      icon: z.string().min(1),
      sort_order: z.number().int(),
    }),
  )
  .handler(async ({ data }) => {
    await updateApp(data)
    return { ok: true }
  })

export const deleteAppFn = createServerFn({ method: 'POST' })
  .middleware([requireAuthMiddleware])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    await deleteApp(data.id)
    return { ok: true }
  })

export const reorderLayoutFn = createServerFn({ method: 'POST' })
  .middleware([requireAuthMiddleware])
  .validator(
    z.object({
      categories: z.array(
        z.object({ id: z.string().min(1), sort_order: z.number().int() }),
      ),
      apps: z.array(
        z.object({
          id: z.string().min(1),
          category_id: z.string().min(1),
          sort_order: z.number().int(),
        }),
      ),
    }),
  )
  .handler(async ({ data }) => {
    await reorderLayout(data)
    return { ok: true }
  })

export const importDataFn = createServerFn({ method: 'POST' })
  .middleware([requireAuthMiddleware])
  .validator(z.object({ json: z.string().min(2) }))
  .handler(async ({ data }) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(data.json)
    } catch {
      throw new Error('Invalid JSON')
    }
    return importSui2Apps(parsed as import('#/lib/types').Sui2ImportPayload)
  })
