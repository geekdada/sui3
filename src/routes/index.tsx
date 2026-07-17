import { createFileRoute } from '@tanstack/react-router'
import Clock from '#/components/Clock'
import Sidebar from '#/components/Sidebar'
import Startpage from '#/components/Startpage'
import { getStartpageData } from '#/lib/apps.functions'
import { fetchPublicStartpageData } from '#/lib/public-startpage'

export const Route = createFileRoute('/')({
  loader: async ({ abortController, parentMatchPromise }) => {
    const parentMatch = await parentMatchPromise
    if (!parentMatch.loaderData) {
      throw new Error('Root authentication state is unavailable')
    }
    const authenticated = parentMatch.loaderData.authenticated

    if (authenticated || typeof window === 'undefined') {
      return getStartpageData()
    }

    return fetchPublicStartpageData(abortController.signal)
  },
  component: HomePage,
})

function HomePage() {
  const { categories, authenticated } = Route.useLoaderData()
  return (
    <div className="flex">
      <Sidebar categories={categories} authenticated={authenticated} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">
        <Clock />
        <Startpage categories={categories} />
      </main>
    </div>
  )
}
