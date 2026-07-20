import { useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import AdminEditor from '#/components/admin/AdminEditor'
import ImportPanel from '#/components/admin/ImportPanel'
import TailscaleSettingsPanel from '#/components/admin/TailscaleSettingsPanel'
import Sidebar from '#/components/Sidebar'
import {
  adminDataQueryOptions,
  authStatusQueryOptions,
  tailscaleSettingsQueryOptions,
} from '#/lib/queries'

export const Route = createFileRoute('/admin')({
  loader: async ({ context }) => {
    const status = await context.queryClient.fetchQuery(
      authStatusQueryOptions(),
    )
    if (!status.authenticated) throw redirect({ to: '/login' })
    await Promise.all([
      context.queryClient.ensureQueryData(adminDataQueryOptions()),
      context.queryClient.ensureQueryData(tailscaleSettingsQueryOptions()),
    ])
  },
  component: AdminPage,
})

function AdminPage() {
  const { data } = useQuery(adminDataQueryOptions())
  const { data: tailscale } = useQuery(tailscaleSettingsQueryOptions())
  const categories = data?.categories ?? []
  return (
    <div className="flex">
      <Sidebar categories={categories} authenticated />
      <main className="min-w-0 flex-1 px-4 py-6 pb-24 sm:px-6 md:pb-6">
        <h1 className="mb-6 text-xl font-semibold tracking-tight">Admin</h1>
        <AdminEditor categories={categories} />
        {tailscale ? <TailscaleSettingsPanel settings={tailscale} /> : null}
        <ImportPanel />
      </main>
    </div>
  )
}
