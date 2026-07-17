import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listCategoriesWithApps: vi.fn(),
  getTailscaleStartpageCategory: vi.fn(),
}))

vi.mock('#/lib/apps', () => ({
  listCategoriesWithApps: mocks.listCategoriesWithApps,
}))

vi.mock('#/lib/icons', () => ({
  getAppIconSvg: (icon: string) => `<svg data-icon="${icon}" />`,
  domainFromUrl: (url: string) => new URL(url).hostname,
}))

vi.mock('#/lib/tailscale.server', () => ({
  getTailscaleStartpageCategory: mocks.getTailscaleStartpageCategory,
}))

import { loadStartpageData } from '#/lib/startpage-data'

const publicCategory = {
  id: 'public',
  name: 'Public',
  visibility: 'public' as const,
  sort_order: 0,
  apps: [
    {
      id: 'app',
      category_id: 'public',
      name: 'App',
      url: 'https://app.example.com/',
      icon: 'home',
      sort_order: 0,
    },
  ],
}

describe('startpage private integrations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listCategoriesWithApps.mockResolvedValue([publicCategory])
  })

  it('does not access or expose Tailscale for anonymous requests', async () => {
    const result = await loadStartpageData(false)

    expect(mocks.listCategoriesWithApps).toHaveBeenCalledWith(false)
    expect(mocks.getTailscaleStartpageCategory).not.toHaveBeenCalled()
    expect(result.authenticated).toBe(false)
    expect(result.categories.map((category) => category.name)).toEqual([
      'Public',
    ])
  })

  it('appends the private Tailscale category for authenticated requests', async () => {
    mocks.getTailscaleStartpageCategory.mockResolvedValue({
      id: 'integration:tailscale-services',
      name: 'Tailscale Services',
      visibility: 'auth',
      sort_order: Number.MAX_SAFE_INTEGER,
      apps: [],
    })

    const result = await loadStartpageData(true)

    expect(mocks.listCategoriesWithApps).toHaveBeenCalledWith(true)
    expect(mocks.getTailscaleStartpageCategory).toHaveBeenCalledOnce()
    expect(result.categories.map((category) => category.name)).toEqual([
      'Public',
      'Tailscale Services',
    ])
  })
})
