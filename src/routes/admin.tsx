import { useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import AdminEditor from '#/components/admin/AdminEditor'
import ImportPanel from '#/components/admin/ImportPanel'
import TailscaleSettingsPanel from '#/components/admin/TailscaleSettingsPanel'
import FeatherIcon from '#/components/FeatherIcon'
import Sidebar from '#/components/Sidebar'
import { Alert, AlertDescription } from '#/components/ui/alert'
import {
  adminDataQueryOptions,
  authStatusQueryOptions,
  isAuthError,
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
  const navigate = useNavigate()
  const adminQuery = useQuery(adminDataQueryOptions())
  const tailscaleQuery = useQuery(tailscaleSettingsQueryOptions())
  const sessionExpired =
    isAuthError(adminQuery.error) || isAuthError(tailscaleQuery.error)

  useEffect(() => {
    if (sessionExpired) void navigate({ to: '/login' })
  }, [sessionExpired, navigate])

  const loadError = adminQuery.error ?? tailscaleQuery.error
  const categories = adminQuery.data?.categories ?? []
  return (
    <div className="flex">
      <Sidebar categories={categories} authenticated />
      <main className="min-w-0 flex-1 px-4 py-6 pb-24 sm:px-6 md:pb-6">
        <h1 className="mb-6 text-xl font-semibold tracking-tight">Admin</h1>
        {loadError && !sessionExpired ? (
          <Alert variant="destructive" className="mb-6">
            <FeatherIcon name="AlertCircle" />
            <AlertDescription>{loadError.message}</AlertDescription>
          </Alert>
        ) : null}
        <AdminEditor categories={categories} />
        {tailscaleQuery.data ? (
          <TailscaleSettingsPanel settings={tailscaleQuery.data} />
        ) : null}
        <ImportPanel />
      </main>
    </div>
  )
}
