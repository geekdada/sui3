import { createFileRoute } from '@tanstack/react-router'
import Clock from '#/components/Clock'
import Sidebar from '#/components/Sidebar'
import Startpage from '#/components/Startpage'
import { getStartpageData } from '#/lib/apps.functions'

export const Route = createFileRoute('/')({
  loader: () => getStartpageData(),
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
