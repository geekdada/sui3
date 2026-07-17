import { createFileRoute, redirect } from '@tanstack/react-router'
import AdminEditor from '#/components/admin/AdminEditor'
import ImportPanel from '#/components/admin/ImportPanel'
import TailscaleSettingsPanel from '#/components/admin/TailscaleSettingsPanel'
import Sidebar from '#/components/Sidebar'
import { getAdminData } from '#/lib/apps.functions'
import { getAuthStatus } from '#/lib/auth.functions'
import { getTailscaleSettingsFn } from '#/lib/tailscale.functions'

export const Route = createFileRoute('/admin')({
  loader: async () => {
    const status = await getAuthStatus()
    if (!status.authenticated) throw redirect({ to: '/login' })
    const [data, tailscale] = await Promise.all([
      getAdminData(),
      getTailscaleSettingsFn(),
    ])
    return { ...data, tailscale }
  },
  component: AdminPage,
})

function AdminPage() {
  const data = Route.useLoaderData()
  return (
    <div className="flex">
      <Sidebar categories={data.categories} authenticated />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">
        <h1 className="mb-6 text-xl font-semibold tracking-tight">Admin</h1>
        <AdminEditor categories={data.categories} />
        <TailscaleSettingsPanel settings={data.tailscale} />
        <ImportPanel />
      </main>
    </div>
  )
}
