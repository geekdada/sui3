import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { startRegistration } from '@simplewebauthn/browser'
import { useState } from 'react'
import { beginSetupFn, finishSetupFn, getAuthStatus } from '#/lib/auth.functions'

export const Route = createFileRoute('/setup')({
  loader: async () => {
    const status = await getAuthStatus()
    if (status.enrolled) throw redirect({ to: status.authenticated ? '/' : '/login' })
    return status
  },
  component: SetupPage,
})

function SetupPage() {
  const router = useRouter()
  const [setupToken, setSetupToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <main className="page max-w-md py-16">
      <h1 className="m-0 text-2xl font-semibold tracking-tight">Setup</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Enter the setup token from your deployment, then enroll the only
        passkey for this service.
      </p>
      <form
        className="mt-6 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError(null)
          try {
            const { options, challengeId } = await beginSetupFn({
              data: { setupToken },
            })
            const response = await startRegistration({ optionsJSON: options })
            await finishSetupFn({
              data: { setupToken, challengeId, response },
            })
            await router.invalidate()
            router.navigate({ to: '/' })
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Setup failed')
          } finally {
            setBusy(false)
          }
        }}
      >
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">Setup token</span>
          <input
            type="password"
            value={setupToken}
            onChange={(e) => setSetupToken(e.target.value)}
            className="w-full rounded-md border border-border bg-card px-3 py-2"
            required
            autoComplete="off"
          />
        </label>
        {error ? <p className="text-sm text-match">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-60"
        >
          {busy ? 'Enrolling…' : 'Enroll passkey'}
        </button>
      </form>
    </main>
  )
}
