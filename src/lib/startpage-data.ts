import { listCategoriesWithApps } from '#/lib/apps'
import { domainFromUrl } from '#/lib/icons'
import { getTailscaleStartpageCategory } from '#/lib/tailscale.server'
import type { AppItem, DecoratedApp } from '#/lib/types'

function decorateApp(app: AppItem): DecoratedApp {
  return {
    ...app,
    domain: domainFromUrl(app.url),
  }
}

export async function loadStartpageData(authenticated: boolean) {
  const [categories, tailscaleCategory] = await Promise.all([
    listCategoriesWithApps(authenticated),
    authenticated ? getTailscaleStartpageCategory() : Promise.resolve(null),
  ])
  const decoratedCategories = categories.map((category) => ({
    ...category,
    apps: category.apps.map(decorateApp),
  }))

  return {
    authenticated,
    categories: tailscaleCategory
      ? [tailscaleCategory, ...decoratedCategories]
      : decoratedCategories,
  }
}
