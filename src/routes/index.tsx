import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import Clock from '#/components/Clock'
import Sidebar from '#/components/Sidebar'
import Startpage from '#/components/Startpage'
import { authStatusQueryOptions, startpageQueryOptions } from '#/lib/queries'

export const Route = createFileRoute('/')({
  loader: async ({ context }) => {
    const { authenticated } = await context.queryClient.ensureQueryData(
      authStatusQueryOptions(),
    )
    await context.queryClient.ensureQueryData(
      startpageQueryOptions(authenticated),
    )
  },
  component: HomePage,
})

function HomePage() {
  const { data: auth } = useQuery(authStatusQueryOptions())
  const authenticated = auth?.authenticated ?? false
  const { data } = useQuery(startpageQueryOptions(authenticated))
  const categories = data?.categories ?? []
  return (
    <div className="flex">
      <Sidebar categories={categories} authenticated={authenticated} />
      <main className="min-w-0 flex-1 px-4 py-6 pb-24 sm:px-6 md:pb-6">
        <Clock />
        <Startpage categories={categories} />
      </main>
    </div>
  )
}
